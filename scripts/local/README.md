# Local Automation

Almost everything runs in the cloud. **Rumble is the one platform that must run
locally** — rumble.com hard-blocks every datacenter IP we've tried (GitHub
Actions, Vercel, and Supabase Edge all get Cloudflare-challenged), so it can only
be collected from a residential IP.

(Substack used to be here too, but it's now fully cloud: the Supabase Edge
Function `collect-substack` runs daily via pg_cron — Substack doesn't block
Supabase's IPs. Nothing to do locally for Substack.)

## Scripts

- **`collect-rumble.bat`** — **REQUIRED daily task.** Collects Rumble daily stats
  (the cloud workflow skips Rumble). Schedule once per day in Task Scheduler.
- **`refresh-tiktok.bat`** - Manually refresh ALL TikTok profiles (fallback only)
- **`discover-tiktok.bat`** - Discovers new creators from curated list

## Rumble (must run locally — not optional)

`rumble.com` returns a Cloudflare challenge to datacenter IPs, so the
daily-stats-collection workflow skips Rumble (it detects CI via `GITHUB_ACTIONS`).
`collect-rumble.bat` runs `collectDailyStats.js` with `COLLECT_ONLY=rumble` from
your machine's residential IP (where fetches succeed), then refreshes the
rankings cache.

**Set it up once (Windows Task Scheduler):**
1. Open Task Scheduler → Create Basic Task → name it "ShinyPull Rumble".
2. Trigger: Daily, pick a time your machine is on (e.g. 6 AM).
3. Action: Start a program → `d:\Claude\ShinyPull\scripts\local\collect-rumble.bat`.
4. Finish. (Optional: tick "Run whether user is logged on or not".)

If your machine is off at the scheduled time, that day's Rumble snapshot is just
skipped — the charts tolerate gaps and the next run resumes. Everything else
(including Substack) runs in the cloud regardless.

## Normal Operation

TikTok profile refresh runs automatically via GitHub Actions:
- **9 PM EST** (02:00 UTC)
- **9 AM EST** (14:00 UTC)

Creator requests also run via GitHub Actions (4x daily). No local scripts needed for regular operation.

## When to Run Locally

Only run the local scripts if:
- GitHub Actions is getting 429 errors from TikTok (check Actions logs)
- You need to refresh profiles immediately without waiting for the schedule
- You want to run discovery for new creators

## Manual Running

- Double-click `refresh-tiktok.bat` to refresh all profiles
- Double-click `discover-tiktok.bat` to discover new creators

## Troubleshooting

**Getting 429 errors on GitHub Actions:**
- TikTok may be temporarily rate-limiting Azure IPs
- Run locally as a fallback (residential IP)
- Check again next scheduled run — usually recovers quickly

**Script crashes locally:**
- Check `.env` file exists in `d:\Claude\ShinyPull`
- Verify `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Run manually to see full error output
