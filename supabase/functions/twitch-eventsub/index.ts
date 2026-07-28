// Twitch EventSub webhook receiver (Deno/Supabase Edge).
//
// Replaces full-roster polling for a SUBSET of Twitch creators (the ones with
// a row in eventsub_subscriptions -- see scripts/manageEventSubSubscriptions.js
// for which ones and why) with real-time stream.online / stream.offline
// pushes from Twitch. This does NOT give us viewer counts, only exact
// live/offline transitions -- but it means poll-live-creators (the tight
// poller, run every 1-2 min via pg_cron) only ever has to check the handful
// of creators actually live right now instead of sweeping the whole tracked
// roster. See CLAUDE.md "STREAM MONITORS" for the accuracy story this fixes.
//
// This function owns opening and closing stream_sessions rows directly, using
// Twitch's own started_at instead of inferring it from poll timing:
//   stream.online  -> upsert an open session (onConflict creator_id+stream_id,
//                      same reasoning as monitorTwitchStreams.js: a session can
//                      already exist closed for this exact stream if we're
//                      recovering from an outage)
//   stream.offline -> find that creator's open session(s) and finalize them
//                      via the existing finalize_stream_sessions RPC
// The tight poller then just adds viewer_samples to whatever's open here.
//
// Verified live against Twitch, 2026-07-27: app-access-token subscriptions to
// stream.online/offline need no broadcaster authorization, and each costs 1
// against a 10,000 max_total_cost budget.
//
// Auth model: NOT our own cron-key pattern. Twitch signs every request with
// HMAC-SHA256 over message-id + timestamp + raw body, using the per-
// subscription secret we supplied when creating it. We verify that signature
// before trusting anything in the payload.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("TWITCH_EVENTSUB_SECRET")!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const MESSAGE_TYPE = "Twitch-Eventsub-Message-Type";
const MESSAGE_ID = "Twitch-Eventsub-Message-Id";
const MESSAGE_TIMESTAMP = "Twitch-Eventsub-Message-Timestamp";
const MESSAGE_SIGNATURE = "Twitch-Eventsub-Message-Signature";

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const id = req.headers.get(MESSAGE_ID) || "";
  const timestamp = req.headers.get(MESSAGE_TIMESTAMP) || "";
  const signatureHeader = req.headers.get(MESSAGE_SIGNATURE) || "";
  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(id + timestamp + rawBody),
  );
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time-ish comparison. Not cryptographically perfect timing safety
  // in JS, but avoids the most obvious early-exit short-circuit comparison.
  const expected = expectedPrefix + hex;
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const rawBody = await req.text();
  const messageType = req.headers.get(MESSAGE_TYPE);

  const validSignature = await verifySignature(req, rawBody);
  if (!validSignature) {
    console.error("twitch-eventsub: invalid signature");
    return new Response("invalid signature", { status: 403 });
  }

  const payload = JSON.parse(rawBody);

  // Twitch's one-time proof that we control this URL. Must echo the raw
  // challenge string back, unmodified, with a 200.
  if (messageType === "webhook_callback_verification") {
    return new Response(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (messageType === "revocation") {
    console.warn(
      `twitch-eventsub: subscription revoked, type=${payload.subscription?.type}, reason=${payload.subscription?.status}`,
    );
    return new Response("ok", { status: 200 });
  }

  if (messageType === "notification") {
    const subType = payload.subscription?.type;
    const event = payload.event;
    const broadcasterId = String(event?.broadcaster_user_id || "");

    const { data: creator } = await sb
      .from("creators")
      .select("id")
      .eq("platform", "twitch")
      .eq("platform_id", broadcasterId)
      .maybeSingle();

    if (!creator) {
      // Not one of ours (or ids drifted) -- ack anyway so Twitch doesn't retry.
      console.warn(`twitch-eventsub: unknown broadcaster_user_id ${broadcasterId}`);
      return new Response("ok", { status: 200 });
    }

    if (subType === "stream.online") {
      // Upsert, not insert: a session can already exist CLOSED for this exact
      // stream_id if we're recovering from downtime and a prior offline event
      // was missed. Same reasoning as monitorTwitchStreams.js. Note the
      // stream.online payload has no title/game_name -- the tight poller
      // fills those in on its first successful sample.
      const { error } = await sb.from("stream_sessions").upsert(
        {
          creator_id: creator.id,
          stream_id: String(event.id),
          started_at: event.started_at,
          ended_at: null,
        },
        { onConflict: "creator_id,stream_id" },
      );
      if (error) console.error("twitch-eventsub: session upsert failed", error.message);
    } else if (subType === "stream.offline") {
      // stream.offline carries no stream id -- just broadcaster info. Find
      // and finalize whatever's open for this creator via the same set-based
      // RPC the tight/broad pollers already use.
      const { data: open } = await sb
        .from("stream_sessions")
        .select("id")
        .eq("creator_id", creator.id)
        .is("ended_at", null);

      if (open?.length) {
        const { error } = await sb.rpc("finalize_stream_sessions", {
          p_session_ids: open.map((s) => s.id),
        });
        if (error) console.error("twitch-eventsub: finalize failed", error.message);
      }
    }

    return new Response("ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
});
