// Tight live-viewer poller (Deno/Supabase Edge). Runs every 1-2 min via
// pg_cron -- this is the piece that actually gets viewer_samples now that
// twitch-eventsub / kick-eventsub own opening and closing stream_sessions.
//
// THE POINT OF THIS FILE: scripts/monitorTwitchStreams.js and
// monitorKickStreams.js sweep the ENTIRE tracked roster (20K+ Twitch, 3K+
// Kick) every run just to find out who's live. That's the thing EventSub
// webhooks replace. This function never sweeps a roster -- it only ever
// looks at stream_sessions rows the webhooks already opened
// (WHERE ended_at IS NULL), which is a small, cheap set, and adds a real
// viewer_count to each one. The full monitor scripts keep running
// unchanged for every creator NOT in eventsub_subscriptions (see
// scripts/manageEventSubSubscriptions.js) -- this doesn't replace them,
// it takes the top-N subscribed creators off their plate.
//
// Safety net: if a webhook's stream.offline / is_live:false event is ever
// missed (dropped delivery, temporary outage), an open session would
// otherwise stay open forever. So on every run, any open session whose
// creator the API now reports as NOT live gets finalized here too -- same
// finalize_stream_sessions RPC the webhooks and full monitors already use.
// A failed API batch is never read as "not live" (would wrongly close
// real sessions) -- it's skipped and left for the next run.
//
// Auth: shared secret header (x-cron-key), same pattern as
// collect-substack -- deployed with --no-verify-jwt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_KEY = Deno.env.get("CRON_KEY") || "";

const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") || "";
const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") || "";
const KICK_CLIENT_ID = Deno.env.get("KICK_CLIENT_ID") || "";
const KICK_CLIENT_SECRET = Deno.env.get("KICK_CLIENT_SECRET") || "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getTwitchToken(): Promise<string> {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`twitch token ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function getKickToken(): Promise<string> {
  const res = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: KICK_CLIENT_ID,
      client_secret: KICK_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`kick token ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchTwitchLive(platformIds: string[], token: string) {
  const params = platformIds.map((id) => `user_id=${id}`).join("&");
  const res = await fetch(`https://api.twitch.tv/helix/streams?${params}&first=100`, {
    headers: { "Client-ID": TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`helix/streams ${res.status}`);
  const data = await res.json();
  const byId = new Map<string, { viewerCount: number; gameName: string }>();
  for (const s of data.data || []) {
    byId.set(s.user_id, { viewerCount: s.viewer_count, gameName: s.game_name });
  }
  return byId;
}

async function fetchKickLive(slugs: string[], token: string) {
  const params = slugs.map((s) => `slug=${encodeURIComponent(s)}`).join("&");
  const res = await fetch(`https://api.kick.com/public/v1/channels?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`kick/channels ${res.status}`);
  const data = await res.json();
  const bySlug = new Map<string, { viewerCount: number; gameName: string }>();
  for (const c of data.data || []) {
    if (!c.stream?.is_live) continue;
    bySlug.set(c.slug.toLowerCase(), {
      viewerCount: c.stream.viewer_count || 0,
      gameName: c.category?.name || "",
    });
  }
  return bySlug;
}

Deno.serve(async (req) => {
  if (CRON_KEY && req.headers.get("x-cron-key") !== CRON_KEY) {
    return new Response("Forbidden", { status: 403 });
  }

  // Only the open sessions -- this is the whole point, never the full roster.
  const { data: openSessions, error: openErr } = await sb
    .from("stream_sessions")
    .select("id, creator_id, peak_viewers")
    .is("ended_at", null);
  if (openErr) {
    return new Response(JSON.stringify({ ok: false, error: openErr.message }), { status: 500 });
  }
  if (!openSessions?.length) {
    return new Response(JSON.stringify({ ok: true, open: 0, samples: 0, finalized: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const creatorIds = [...new Set(openSessions.map((s) => s.creator_id))];
  const { data: creators, error: creatorErr } = await sb
    .from("creators")
    .select("id, platform, platform_id, username")
    .in("id", creatorIds);
  if (creatorErr) {
    return new Response(JSON.stringify({ ok: false, error: creatorErr.message }), { status: 500 });
  }
  const creatorById = new Map(creators.map((c) => [c.id, c]));

  const twitchSessions = openSessions.filter((s) => creatorById.get(s.creator_id)?.platform === "twitch");
  const kickSessions = openSessions.filter((s) => creatorById.get(s.creator_id)?.platform === "kick");

  let twitchLive = new Map<string, { viewerCount: number; gameName: string }>();
  let twitchOk = twitchSessions.length === 0;
  if (twitchSessions.length && TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
    try {
      const token = await getTwitchToken();
      const ids = [...new Set(twitchSessions.map((s) => creatorById.get(s.creator_id)!.platform_id))];
      for (const batch of chunk(ids, 100)) {
        const live = await fetchTwitchLive(batch, token);
        for (const [k, v] of live) twitchLive.set(k, v);
      }
      twitchOk = true;
    } catch (err) {
      console.error("poll-live-creators: twitch sweep failed", (err as Error).message);
    }
  }

  let kickLive = new Map<string, { viewerCount: number; gameName: string }>();
  let kickOk = kickSessions.length === 0;
  if (kickSessions.length && KICK_CLIENT_ID && KICK_CLIENT_SECRET) {
    try {
      const token = await getKickToken();
      const slugs = [...new Set(kickSessions.map((s) => creatorById.get(s.creator_id)!.username.toLowerCase()))];
      for (const batch of chunk(slugs, 50)) {
        const live = await fetchKickLive(batch, token);
        for (const [k, v] of live) kickLive.set(k, v);
      }
      kickOk = true;
    } catch (err) {
      console.error("poll-live-creators: kick sweep failed", (err as Error).message);
    }
  }

  const samples: { session_id: string; viewer_count: number; game_name: string }[] = [];
  const peakBumps: { id: string; peak_viewers: number }[] = [];
  const toFinalize: string[] = [];

  for (const s of twitchSessions) {
    const c = creatorById.get(s.creator_id)!;
    const live = twitchLive.get(c.platform_id);
    if (live) {
      samples.push({ session_id: s.id, viewer_count: live.viewerCount, game_name: live.gameName });
      if (live.viewerCount > (s.peak_viewers || 0)) peakBumps.push({ id: s.id, peak_viewers: live.viewerCount });
    } else if (twitchOk) {
      toFinalize.push(s.id);
    }
  }
  for (const s of kickSessions) {
    const c = creatorById.get(s.creator_id)!;
    const live = kickLive.get(c.username.toLowerCase());
    if (live) {
      samples.push({ session_id: s.id, viewer_count: live.viewerCount, game_name: live.gameName });
      if (live.viewerCount > (s.peak_viewers || 0)) peakBumps.push({ id: s.id, peak_viewers: live.viewerCount });
    } else if (kickOk) {
      toFinalize.push(s.id);
    }
  }

  let samplesRecorded = 0;
  for (const group of chunk(samples, 1000)) {
    const { error } = await sb.from("viewer_samples").insert(group);
    if (!error) samplesRecorded += group.length;
    else console.error("poll-live-creators: sample insert failed", error.message);
  }

  await Promise.all(
    peakBumps.map((b) => sb.from("stream_sessions").update({ peak_viewers: b.peak_viewers }).eq("id", b.id)),
  );

  let finalized = 0;
  if (toFinalize.length) {
    const { data, error } = await sb.rpc("finalize_stream_sessions", { p_session_ids: toFinalize });
    if (!error) finalized = data || 0;
    else console.error("poll-live-creators: finalize failed", error.message);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      open: openSessions.length,
      twitchOpen: twitchSessions.length,
      kickOpen: kickSessions.length,
      samples: samplesRecorded,
      peaksBumped: peakBumps.length,
      finalized,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
