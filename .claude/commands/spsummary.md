---
description: Ops health check for ShinyPull — jobs, cron, EventSub, deploys, data quality, over the last 24h
---

Run a fixed checklist against the live ShinyPull infrastructure and give a tight status report. This is read-only: report what you find, do not fix anything in this same run, even if something looks broken. If the user wants a fix, that's a separate follow-up turn.

Use `node scripts/run-sql.js "..."` for all DB queries and `gh` for GitHub/Actions data. Run independent checks in parallel where the tool calls allow it.

## Checklist (always run all of these, in this order)

**1. GitHub Actions (last 24h)**
```
gh run list --limit 50 --json name,status,conclusion,createdAt,updatedAt --repo SuperSaiyanHaris/cobaltdash
```
Flag any run with a conclusion other than `success` (and not still `in_progress`). Separately confirm Twitch/Kick Stream Monitor runs are still fast (30-90s each, not the old ~9 minutes) by diffing `createdAt`/`updatedAt` on the last few of each.

**2. pg_cron (last 24h)**
```sql
SELECT jobname, count(*) runs_24h,
  count(*) FILTER (WHERE status='succeeded') as succeeded,
  count(*) FILTER (WHERE status='failed') as failed
FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid = jrd.jobid
WHERE jrd.start_time >= NOW() - INTERVAL '24 hours'
GROUP BY jobname ORDER BY jobname
```
Flag any job with `failed > 0`. Expected jobs: `poll-live-creators` (should be roughly 1/min, so ~1000-1440 runs), `refresh-rankings-fast-platforms` (hourly), `refresh-rankings-heavy-platforms` (every 3h), `finalize-abandoned-stream-sessions` (hourly), `collect-substack-daily` (once/day). A job missing entirely from this list that should exist is itself a finding.

**3. Twitch/Kick EventSub + stream_sessions activity (last 24h)**
```sql
SELECT c.platform, count(*) as new_sessions_24h
FROM stream_sessions ss JOIN creators c ON c.id = ss.creator_id
WHERE ss.started_at >= NOW() - INTERVAL '24 hours'
GROUP BY c.platform;

SELECT e.platform, count(DISTINCT e.creator_id) as subscribed_creators,
  count(DISTINCT ss.id) FILTER (WHERE ss.started_at >= NOW() - INTERVAL '24 hours') as sessions_started_24h
FROM eventsub_subscriptions e
LEFT JOIN stream_sessions ss ON ss.creator_id = e.creator_id
GROUP BY e.platform;
```
Sanity-check: subscribed-creator session counts should be nonzero and roughly proportional to how many of the top 500 per platform are typically live in a day. Zero activity for either platform is a real red flag (webhook likely broken, e.g. Kick's dashboard callback URL reverted to the placeholder). Also check for finalization health:
```sql
SELECT count(*) FROM stream_sessions
WHERE ended_at >= NOW() - INTERVAL '24 hours' AND sample_count IS NULL;
```
Any rows here mean sessions are closing without going through `finalize_stream_sessions` correctly.

**4. Data quality spot checks**
```sql
SELECT c.platform, count(*) FROM creator_stats cs JOIN creators c ON c.id = cs.creator_id
WHERE cs.recorded_at = CURRENT_DATE AND (cs.subscribers = 0 OR cs.subscribers IS NULL)
GROUP BY c.platform;
```
Kick showing up here is expected (0 paid subs is a real value for Kick, see CLAUDE.md). Any OTHER platform showing up here is a real data-integrity problem worth flagging loudly (CLAUDE.md's hard rule: never write 0/null subscribers except Kick's documented case).
```sql
SELECT platform, max(computed_at) FROM rankings_cache GROUP BY platform;
```
Flag any platform whose `computed_at` is more than ~4 hours stale for the fast platforms, or more than ~6 hours for youtube/twitch (the heavy-platform cron runs every 3h).

**This `computed_at` check alone can miss a fully-stalled platform** — the rankings refresh recomputes ranks from whichever `recorded_at` is latest per creator and stamps `computed_at = NOW()` regardless of how old that underlying data actually is, so the cache can look perfectly fresh while collection itself has been dead for weeks (this exact blind spot hid a 14-day total Rumble collection outage on 2026-09-01 — found only by checking `creator_stats` directly, not the cache). Always also check real data freshness per platform:
```sql
SELECT c.platform,
  count(*) AS total,
  count(*) FILTER (WHERE latest.recorded_at >= CURRENT_DATE - INTERVAL '2 days') AS fresh_last_2d,
  max(latest.recorded_at) AS most_recent_any
FROM creators c
LEFT JOIN LATERAL (SELECT recorded_at FROM creator_stats WHERE creator_id=c.id ORDER BY recorded_at DESC LIMIT 1) latest ON true
GROUP BY c.platform ORDER BY fresh_last_2d::float / NULLIF(total,0) ASC;
```
A platform sitting at or near 0% fresh (not just a few percent of stale outliers, which is normal churn) is a real collection outage, not noise — flag it loudly, and note `most_recent_any` so the report says how long it's been broken. Rumble is the platform most likely to break this way (only collectible from one residential connection, see CLAUDE.md's Local Automation section and `scripts/local/README.md` — check whether `rumble-auto.bat` is actually still running and whether Cloudflare has started challenging that IP too before assuming it's just an off machine).

**5. Deploy status**
```
gh api repos/SuperSaiyanHaris/cobaltdash/commits/main/status --jq '{state, statuses: [.statuses[] | {context, state, created_at}]}'
```
Flag if Vercel's latest status isn't `success`, or if it's stale relative to the latest commit on `main`.

**6. Anything needing a decision**
```
gh api repos/SuperSaiyanHaris/cobaltdash/dependabot/alerts --jq '[.[] | select(.state=="open")]'
gh pr list --repo SuperSaiyanHaris/cobaltdash --json number,title,createdAt,author
```
List open Dependabot alerts and open PRs (including Dependabot auto-PRs). Don't close, merge, or dismiss anything, just surface them.

## Report format

Keep it tight, bullets over prose, grouped by the sections above. Lead with a one-line overall verdict (e.g. "All green" / "One thing needs attention" / "Two real problems"). Only elaborate on items that are abnormal, don't narrate every passing check in detail, a passing section is one line. End with anything that needs a decision from the user (security alerts, open PRs, ambiguous data) without deciding it yourself.
