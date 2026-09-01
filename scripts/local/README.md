# Local Automation

Almost everything runs in the cloud. **Rumble is the one platform that must run
locally** — rumble.com hard-blocks every datacenter IP we've tried (GitHub
Actions, Vercel, and Supabase Edge all get Cloudflare-challenged), so it can only
be collected from a residential IP.

(Substack used to be here too, but it's now fully cloud: the Supabase Edge
Function `collect-substack` runs daily via pg_cron — Substack doesn't block
Supabase's IPs. Nothing to do locally for Substack.)

## Scripts

- **`rumble-auto.bat`** — **Recommended.** Self-scheduling Rumble collector (no
  Task Scheduler). Leave it running; every 24h it collects stats, processes any
  pending Rumble creator requests (the site's "Track this channel" self-add
  form), and discovers new channels.
- **`collect-rumble.bat`** — One-shot manual version of the same three steps
  (double-click whenever you want an immediate refresh instead of waiting for
  the 24h cycle).
- **`refresh-tiktok.bat`** - Manually refresh ALL TikTok profiles (fallback only)
- **`discover-tiktok.bat`** - Discovers new creators from curated list

## Rumble (the only platform that must run locally)

`rumble.com` Cloudflare-challenges EVERY datacenter IP (GitHub Actions, Vercel,
Supabase Edge, Cloudflare Workers all 403), and there's no open API for follower
counts. So Rumble can only be collected from this residential connection. The
cloud daily-stats workflow skips Rumble (it detects CI via `GITHUB_ACTIONS`).
(Substack, by contrast, is fully cloud — Supabase Edge Function + pg_cron.)

**No Task Scheduler needed — start on login via the Startup folder:**
1. Press **Win+R**, type `shell:startup`, Enter.
2. Right-drag `rumble-auto.bat` into that folder → "Create shortcuts here".
3. Done. It launches each login, collects immediately, then every 24h.

Keep **Proton VPN off** (or split-tunnel `rumble.com`) so it uses your home IP —
commercial VPN exit IPs get Cloudflare-challenged like datacenters do. A plain
residential connection passes fine.

If your machine is off, that day's Rumble snapshot is simply skipped — charts
tolerate gaps and the next run resumes. Everything else runs in the cloud.

A Rumble request submitted via the site (`/search?platform=rumble` → "Track
this channel") queues into `creator_requests` and just waits there — the
GitHub Actions request processor deliberately skips `platform=rumble` (it
can't tell "no such channel" apart from "we're blocked" from a datacenter, and
would wrongly reject a real submission). It only gets resolved here, next time
this script runs successfully.

**If Rumble collection stops working from here too** (all 117 channels come
back "Channel not found," including well-known ones like PragerU): that means
Cloudflare has started challenging this residential IP as well, not just
datacenters. A router reboot (new IP from your ISP) is the first thing to try;
`FALLBACK_IP.md` has the mobile-hotspot fallback if that doesn't help. There's
currently no cloud path for Rumble at all — Cloudflare challenges Supabase Edge
for rumble.com too, unlike Substack.

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
