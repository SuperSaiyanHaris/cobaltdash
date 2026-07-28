// Kick webhook receiver (Deno/Supabase Edge). Twitch counterpart:
// supabase/functions/twitch-eventsub/index.ts -- read that file's header
// comment for the overall design (targeted live-polling instead of a full
// roster sweep). Same stream_sessions-direct approach as that function:
// livestream.status.updated with is_live=true upserts an open session,
// is_live=false finds and finalizes it via finalize_stream_sessions.
//
// Verified live against Kick, 2026-07-27: app-access-token subscriptions to
// livestream.status.updated need no broadcaster authorization once the app's
// "Enable webhooks" toggle + callback URL are set (Kick app dashboard). Budget
// is 10,000 subscriptions for this event type.
//
// Auth model: unlike Twitch's shared-secret HMAC, Kick signs with ITS OWN
// private key and publishes the matching RSA public key at
// GET /public/v1/public-key. We fetch and cache that key, then verify
// RSASSA-PKCS1-v1_5/SHA-256 over `${messageId}.${timestamp}.${rawBody}`.

const KICK_PUBLIC_KEY_URL = "https://api.kick.com/public/v1/public-key";

const SIGNATURE_HEADER = "Kick-Event-Signature";
const MESSAGE_ID_HEADER = "Kick-Event-Message-Id";
const TIMESTAMP_HEADER = "Kick-Event-Message-Timestamp";
const EVENT_TYPE_HEADER = "Kick-Event-Type";

let cachedKey: CryptoKey | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getKickPublicKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const res = await fetch(KICK_PUBLIC_KEY_URL);
  if (!res.ok) throw new Error(`failed to fetch Kick public key: ${res.status}`);
  const body = await res.json();
  const pem: string = body.data?.public_key || body.public_key;
  cachedKey = await crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return cachedKey;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifySignature(req: Request, rawBody: string): Promise<boolean> {
  const signatureB64 = req.headers.get(SIGNATURE_HEADER) || "";
  const messageId = req.headers.get(MESSAGE_ID_HEADER) || "";
  const timestamp = req.headers.get(TIMESTAMP_HEADER) || "";
  if (!signatureB64) return false;

  const key = await getKickPublicKey();
  const signed = `${messageId}.${timestamp}.${rawBody}`;
  const signatureBytes = base64ToBytes(signatureB64);

  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signatureBytes,
    new TextEncoder().encode(signed),
  );
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req: Request) => {
  const rawBody = await req.text();

  let validSignature = false;
  try {
    validSignature = await verifySignature(req, rawBody);
  } catch (err) {
    console.error("kick-eventsub: signature verification error", err);
  }
  if (!validSignature) {
    console.error("kick-eventsub: invalid signature");
    return new Response("invalid signature", { status: 403 });
  }

  const eventType = req.headers.get(EVENT_TYPE_HEADER);
  if (eventType !== "livestream.status.updated") {
    // We only ever subscribe to this one type, but ack anything else rather
    // than erroring, in case Kick adds fields/types later.
    return new Response("ok", { status: 200 });
  }

  const payload = JSON.parse(rawBody);
  const broadcasterId = String(payload.broadcaster?.user_id || "");

  const { data: creator } = await sb
    .from("creators")
    .select("id")
    .eq("platform", "kick")
    .eq("platform_id", broadcasterId)
    .maybeSingle();

  if (!creator) {
    console.warn(`kick-eventsub: unknown broadcaster user_id ${broadcasterId}`);
    return new Response("ok", { status: 200 });
  }

  if (payload.is_live) {
    // Upsert, not insert: mirrors twitch-eventsub -- a session can already
    // exist closed for this exact stream_id if we're recovering from
    // downtime. Kick's payload has no stream id, so synthesize one from
    // broadcaster + start time, same format scripts/monitorKickStreams.js
    // already uses (`kick-${broadcaster_user_id}-${start_time}`).
    const { error } = await sb.from("stream_sessions").upsert(
      {
        creator_id: creator.id,
        stream_id: `kick-${broadcasterId}-${payload.started_at || "live"}`,
        started_at: payload.started_at,
        ended_at: null,
      },
      { onConflict: "creator_id,stream_id" },
    );
    if (error) console.error("kick-eventsub: session upsert failed", error.message);
  } else {
    // Kick's offline event carries no stream id either -- find and finalize
    // whatever's open for this creator, same as twitch-eventsub.
    const { data: open } = await sb
      .from("stream_sessions")
      .select("id")
      .eq("creator_id", creator.id)
      .is("ended_at", null);

    if (open?.length) {
      const { error } = await sb.rpc("finalize_stream_sessions", {
        p_session_ids: open.map((s) => s.id),
      });
      if (error) console.error("kick-eventsub: finalize failed", error.message);
    }
  }

  return new Response("ok", { status: 200 });
});
