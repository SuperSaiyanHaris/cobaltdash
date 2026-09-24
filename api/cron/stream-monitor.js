// Vercel Cron: live-stream sweep for every tracked Twitch and Kick channel.
//
// Replaces the */5 GitHub Actions schedules, which GitHub throttled to ~5
// runs a day (2026-09-24 audit), leaving most streams with a handful of viewer
// samples and hours-watched numbers that were mostly interpolation. Vercel Pro
// runs this every 5 minutes (vercel.json "crons"); the sweeps themselves take
// well under a minute. The top EventSub-subscribed channels are additionally
// sampled every 1-2 minutes by the poll-live-creators edge function.
//
// Only Vercel's scheduler may call it: Vercel sends
// `Authorization: Bearer $CRON_SECRET` on cron invocations when the project
// has a CRON_SECRET environment variable, and anything else is rejected.

import { monitorStreams as monitorTwitch } from '../../scripts/monitorTwitchStreams.js';
import { monitorStreams as monitorKick } from '../../scripts/monitorKickStreams.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('stream-monitor: CRON_SECRET is not set; refusing to run');
    return res.status(503).json({ error: 'CRON_SECRET not configured' });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Twitch and Kick share nothing, so run them side by side; one failing
  // must not cost the other its run.
  const [twitch, kick] = await Promise.allSettled([monitorTwitch(), monitorKick()]);
  const summary = {
    twitch: twitch.status === 'fulfilled' ? twitch.value : { error: twitch.reason?.message },
    kick: kick.status === 'fulfilled' ? kick.value : { error: kick.reason?.message },
  };
  const failed = twitch.status === 'rejected' || kick.status === 'rejected';
  if (failed) console.error('stream-monitor failed:', JSON.stringify(summary));
  return res.status(failed ? 500 : 200).json(summary);
}
