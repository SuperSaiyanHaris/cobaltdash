# Local Automation

Everything now runs in the cloud. Rumble used to be the one platform that had
to run locally (rumble.com hard-blocked every datacenter IP we tried, and
eventually blocked the residential IP too), but Rumble was **delisted from the
site 2026-09-04** — permanently Cloudflare-blocked with no free fix left, so
we stopped collecting/discovering/serving it. `rumble-auto.bat` and
`collect-rumble.bat` were deleted along with it. See CLAUDE.md's "RUMBLE
DELISTED" section for the full history if this ever needs revisiting.

Substack is fully cloud too: the Supabase Edge Function `collect-substack`
runs daily via pg_cron — Substack doesn't block Supabase's IPs. Nothing to do
locally for Substack either.

## Scripts

- **`refresh-tiktok.bat`** - Manually refresh ALL TikTok profiles (fallback only)
- **`discover-tiktok.bat`** - Discovers new creators from curated list (see
  note below — general TikTok/creator discovery is currently paused site-wide)

## Normal Operation

TikTok profile refresh runs automatically via GitHub Actions:
- **9 PM EST** (02:00 UTC)
- **9 AM EST** (14:00 UTC)

Creator requests also run via GitHub Actions (4x daily). No local scripts needed for regular operation.

**Discovery is currently paused (2026-09-05).** The "Creator Discovery (all
platforms)" and "Major Names Seed" GitHub Actions workflows were both disabled
(`gh workflow disable`, easily reversible) after `discoverTikTokCreators.js`
flooded `creator_requests` with ~200 candidates/day and built a 9,438-row
backlog that outpaced processing capacity for over a month. Going forward,
new creators should only enter the DB via a real user searching them (live
platforms auto-hydrate) or submitting a "track this channel" request
(TikTok/Mastodon/Substack). Don't re-enable discovery without addressing the
throughput mismatch that caused the backlog in the first place.

## When to Run Locally

Only run the local scripts if:
- GitHub Actions is getting 429 errors from TikTok (check Actions logs)
- You need to refresh profiles immediately without waiting for the schedule

## Manual Running

- Double-click `refresh-tiktok.bat` to refresh all profiles
- Double-click `discover-tiktok.bat` to discover new creators (only if you've
  deliberately decided to re-enable discovery — see note above)

## Troubleshooting

**Getting 429 errors on GitHub Actions:**
- TikTok may be temporarily rate-limiting Azure IPs
- Run locally as a fallback (residential IP)
- Check again next scheduled run — usually recovers quickly

**Script crashes locally:**
- Check `.env` file exists in `d:\Claude\ShinyPull`
- Verify `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Run manually to see full error output
