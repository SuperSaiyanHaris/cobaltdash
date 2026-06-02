# Local Automation

Most collection runs in **GitHub Actions**. Two platforms (Rumble, Substack)
**cannot** run in the cloud because their sites hard-block GitHub's datacenter
IPs, so they MUST be collected from a residential IP via a local scheduled task.

## Scripts

- **`collect-rumble-substack.bat`** — **REQUIRED daily task.** Collects Rumble +
  Substack daily stats (the cloud workflow skips them — see below). Schedule
  this once per day in Windows Task Scheduler.
- **`refresh-tiktok.bat`** - Manually refresh ALL TikTok profiles (fallback only)
- **`discover-tiktok.bat`** - Discovers new creators from curated list

## Rumble + Substack (must run locally — not optional)

`rumble.com` and `substack.com` return 403 to GitHub Actions datacenter IPs, so
the daily-stats-collection workflow skips them (it detects CI via the
`GITHUB_ACTIONS` env var). The `collect-rumble-substack.bat` task runs the same
`collectDailyStats.js` with `COLLECT_ONLY=rumble,substack` from your machine's
residential IP, where the fetches succeed, then refreshes the rankings cache.

**Set it up once (Windows Task Scheduler):**
1. Open Task Scheduler → Create Basic Task → name it "ShinyPull Rumble+Substack".
2. Trigger: Daily, pick a time your machine is on (e.g. 6 AM).
3. Action: Start a program → `d:\Claude\ShinyPull\scripts\local\collect-rumble-substack.bat`.
4. Finish. (Optional: tick "Run whether user is logged on or not".)

If your machine is off at the scheduled time, that day's Rumble/Substack
snapshot is simply skipped — the charts tolerate gaps, and the next run resumes
normally. The cloud handles all other platforms regardless.

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
