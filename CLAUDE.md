# ShinyPull - Agent Context

> **This file is maintained by AI agents for AI agents.** Update it when making significant architectural changes, adding new features, or changing conventions. Do NOT update for minor bug fixes or small tweaks.

## Project Overview

ShinyPull is a social media analytics platform that tracks creator statistics across 9 platforms: YouTube, TikTok, Twitch, Kick, Bluesky, Mastodon, Rumble, Substack, and Music (Last.fm). Platform count is centralized in `src/lib/constants.js` (`PLATFORM_IDS` / `PLATFORM_COUNT`).

**Status:** All 9 platform integrations fully working. Live subscriber/follower counts, historical charts, and automated daily data collection operational.

## Critical Rules

**DATA INTEGRITY — THIS IS THE MOST IMPORTANT RULE:**

Our creator stats are the entire reason this site exists. Every chart and table users see is powered directly by the `creator_stats` table. A single corrupt row can trash a chart by causing wild swings (e.g., 630K → 0 → 630K). The rules below are non-negotiable:

- **NEVER DELETE CREATORS OR ANY CREATOR-RELATED DATA. EVER.** This includes the `creators` table, `creator_stats`, `stream_sessions`, `viewer_samples`, `rankings_cache` row regenerations are fine but the underlying source tables are sacred. A creator with 0 followers, 0 stats, or no recent activity is NOT junk — it's a record we'll fill in when the API recovers, when the discovery script finds them again, or when a user submits a request. Small/inactive creators stay. If an agent ever proposes "cleaning up" small or inactive creators, the answer is no. Investigate WHY they're in that state instead. (Don't ever ask either — the answer is permanently no.)
- **NEVER DELETE TABLE ROWS WITHOUT EXPLICIT USER CONSENT. EVER.** This is rule zero. On 2026-05-28 an agent (me) destroyed 383K rows of irreplaceable historical creator stats by running a "cleanup" DELETE without asking. (As of 2026-05-30 we're on Supabase **Pro** which provides daily automated backups with 7-day retention, but a same-day mistake is still recoverable only by restoring the whole DB and rolling back any legitimate work since the last backup. The rule stands.) Never run `DELETE`, `TRUNCATE`, `DROP TABLE`, or `ALTER TABLE ... DROP` against any production table without first telling the user exactly what rows will be removed and getting a clear yes. `scripts/run-sql.js` blocks destructive statements unless `--yes-destroy` is passed as a separate argument. **Do not remove that safeguard.** If you think a table has junk in it, ASK FIRST and describe what you would remove.
- **Never write 0 or null for subscriber/follower counts.** A 0 means the API call failed — it is NOT a real value. Always validate API responses before saving.
- **Always check `response.ok` before reading API data.** Never do `data.total || 0` as a fallback — throw an error instead so the calling code can skip the write.
- **`aggregateHoursWatched.js` and similar secondary scripts must use `.update()`, never `.upsert()`.** If the primary stats collection failed and no row exists for today, a secondary script must not create a row with NULL subscribers. Use `update` — if no row exists, nothing happens (correct behavior).
- **`api/update-creator.js` must never write stats with 0 subscribers.** If the API returns 0, skip the stats write entirely — a failed API call must not overwrite a good historical record.
- **Never backfill or generate synthetic data.** We use REAL API data only. Historical data builds up naturally from daily snapshots.
- **When in doubt, skip the write.** A missing row is far better than a corrupt row with 0 data. Charts handle gaps gracefully; they cannot handle zeros masquerading as real values.

**UI/UX - NO DISCLAIMERS:**
- NEVER add warning banners, info boxes, or explanatory notes to user-facing pages
- Handle API limitations gracefully in the UI without explaining why to users
- The only exception is the Terms of Service page for legal disclaimers
- Keep the UI clean and professional.

**HOW WE GET DATA — NEVER DESCRIBE THE MECHANISM IN USER-FACING COPY. (hard rule)**
- Anywhere on the site (FAQ, Methodology, About, Support, Terms, Privacy, rankings/profile blurbs, SEO descriptions, blog, tooltips), the ONLY acceptable phrasing for how we source data is some variant of **"we obtain / show publicly available information."** Keep it short and legal.
- NEVER name the mechanism or the source: no "API" / "official platform APIs" / "YouTube Data API" / "Twitch Helix" / "AT Protocol" / "ActivityPub" / "Last.fm API" / "category leaderboard API"; no "scrape" / "scraping" / "public channel pages" / "request per second" / "polite rate"; no "/c/ vs /user/", "federate through mastodon.social", "order-of-magnitude band", "viewer samples every few minutes", "leaderboard position", etc. These are our secrets. No competitor exposes this and neither do we.
- You MAY still state user-relevant CAVEATS about the numbers themselves (what helps a reader trust/understand the figure), worded without mechanism: e.g. "YouTube rounds subscriber counts (their policy)", "on Kick the public number is paid subscribers", "Substack publishes counts as approximate ranges, so the figure is an approximate minimum", "this platform has no public view count". That's about the DATA, not the HOW.
- The Methodology page describes WHAT we track + caveats only. Every platform's source label is just "Publicly available". Do not reintroduce a per-platform "Data Source"/"how" breakdown.
- This rule overrides any instinct to be transparent/helpful about implementation. When in doubt, write less.

**WRITING STYLE - ALL USER-FACING COPY (tooltips, labels, descriptions, notifications, blog posts):**
- NEVER use em dashes (—). Use commas or periods instead.
- Write like a human. Short sentences. Direct. No corporate fluff.
- No AI clichés: "game-changer", "landscape", "seamless", "robust", "leverage", "unlock"
- No semicolons for dramatic effect. No "it's worth noting". No "importantly".
- See the Blog Post Format section for the full list of patterns to avoid.

**TIMEZONE:**
- All dates use America/New_York timezone via `getTodayLocal()` helper
- This prevents future-date issues when UTC is ahead of local time

**RANKINGS CACHE REFRESH — per-platform, NOT bulk:**
- `scripts/refreshRankingsCache.js` calls `refresh_rankings_cache_platform(p_platform text)` once per platform. Runs at the end of `daily-stats-collection.yml` (and `tiktok-refresh.yml`) so the cache reflects freshly collected numbers.
- The OLD bulk function `refresh_rankings_cache()` looped all platforms in one transaction and routinely hit PostgREST's 8s request timeout, silently failing every refresh. Don't go back to that pattern.
- **The REST path has a hard ~60s statement_timeout we CANNOT raise.** PostgREST connects as `authenticator` and `SET ROLE service_role` per request; role `rolconfig` GUCs (`ALTER ROLE service_role SET statement_timeout=...`) and the function's own `SET LOCAL statement_timeout='180s'` do NOT apply to a REST RPC — the outer statement's deadline is fixed at ~60s by Supabase. So `ALTER ROLE`-ing the timeout up does nothing for REST calls (it only helps direct/pg_cron connections). Learned 2026-05-31 when Twitch grew past 60s and failed the workflow.
- **Therefore `refreshRankingsCache.js` only refreshes the 7 fast platforms** (tiktok, kick, bluesky, music, mastodon, rumble, substack) — each well under 60s. **YouTube and Twitch are deliberately excluded** from this script; they are refreshed ONLY by the `refresh-rankings-heavy-platforms` pg_cron job (inside Postgres, where `SET LOCAL 180s` works — those runs take ~75s and succeed). Do NOT add youtube/twitch back to this script's PLATFORMS array.
- The script exits with code 1 if any (fast) platform fails — failures stay visible in the Actions tab.
- **`pg_cron` keeps the cache warm** (Pro plan):
  - `refresh-rankings-fast-platforms` — `17 * * * *` (hourly) — Mastodon, Rumble, Bluesky, Kick, Music, TikTok, Substack via the wrapper `refresh_rankings_cache_fast_platforms()`.
  - `refresh-rankings-heavy-platforms` — `37 */3 * * *` (every 3 hrs) — YouTube + Twitch, inside Postgres (the only path that can run them, given the REST 60s cap). Their data only moves on the 8h daily-collection cycle anyway, so a ≤3h ranking lag is fine.
- `pg_cron` runs inside Postgres, no PostgREST involvement; the function's `SET LOCAL statement_timeout = '180s'` applies there. To inspect runs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC;`. To pause: `SELECT cron.unschedule('refresh-rankings-fast-platforms');`.

**SECTION DIVIDERS — NO GRADIENT FADES:**
- The user removed all gradient section dividers (`bg-gradient-to-b from-X to-Y` between sections) months ago and does NOT want them re-added. If a transition between light and dark sections feels harsh, the fix is to add a proper section header (eyebrow + title) above the next section, NOT a gradient fade.
- Hard color edges between sections are intentional. They read as deliberate when content hierarchy is clear.

**HOME HERO LAYOUT (current, working):**
- Section: full-bleed dark `#0a0a0f`, `md:min-h-[900px]` on desktop, mobile sizes to content
- Desktop only: `/hero-bg.jpeg` photo bg via `<img>` with `hidden md:block` + dark overlay
- Mobile: solid `#0a0a0f` background, no image (the wide image cropped awkwardly on portrait viewports). `public/hero-bg-mobile.jpeg` is kept in repo as a backup option but currently unused.
- Marquee at top: shuffled YouTube top 20 + Twitch top 20, 120s rotation, `mask-gradient` edge fade
- Headline: 2 lines, `clamp(2.25rem, 6vw, 5rem)`, rotating last word in indigo→fuchsia→cyan gradient
- Left bento stack (desktop, `min-[1280px]`): "Live across 6 platforms" pulse pill + rotating #1-per-platform card (cycles YT → TikTok → Twitch → Kick → Bluesky → Music every 4s) + Featured Listings B2B card. All three have continuous floating Y motion. Position via `style={{ left: 'max(2rem, calc(50% - 30rem - 19rem))' }}` and explicit `top-[14rem]`.
- Each #1 card uses its platform-correct metric label (`subscribers` / `followers` / `paid subscribers` / `monthly listeners`).

**HOME LIVE-PREVIEW CAROUSEL:**
- 4 browser-mockup cards rotating every 9s: Rankings → Profile → Compare → Earnings
- Same outer shell (chrome with traffic lights + URL bar), inner content swaps via `AnimatePresence`
- Fixed `min-h-[420px] sm:min-h-[440px]` content area + bottom-pinned CTA so the page never reflows during rotation
- URL bar and CTA both link to the actual page; pill tabs below allow manual selection
- Sparklines inside fixed-height cards must use `fluid` prop on `<Sparkline>` so they fill width responsively

**DESIGN STYLE - PREFERRED CARD PATTERN (apply this to all new sections and redesigns):**

The user loves the dark-card style introduced in the Features Section on the home page. Use it for all new UI sections and when redesigning existing ones. Key patterns:

- **Section backgrounds:** `bg-[#0a0a0f]` (deep black) or `bg-gray-900` (alternating for visual rhythm)
- **Card base:** `bg-gray-900 border border-gray-800 rounded-2xl`
- **Hover state:** `hover:border-{color}-500/60 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-{color}-500/10` — always pair border glow + lift + shadow
- **Glow blob:** `pointer-events-none absolute -top-12 -right-12 w-40 h-40 bg-{color}-500/10 rounded-full blur-3xl group-hover:bg-{color}-500/20 transition-colors duration-500`
- **Ghost numbers/labels:** `absolute top-6 right-7 text-3xl font-black text-gray-800 select-none` — subtle watermarks (01, 02, 03 or $$$)
- **Icon box:** `w-14 h-14 bg-gradient-to-br from-{color1} to-{color2} rounded-xl flex items-center justify-center shadow-lg shadow-{color}-500/30 group-hover:scale-105 transition-transform duration-300`
- **Section header:** `text-2xl sm:text-3xl font-extrabold text-gray-100` title + `mt-3 text-gray-400 text-base sm:text-lg` subtitle, centered with `text-center mb-12 sm:mb-16`
- **Inline CTA:** `inline-flex items-center gap-1.5 text-sm font-semibold text-{color}-400 group-hover:gap-3 transition-all duration-200` with ArrowRight icon
- **Category labels:** small uppercase pill — `px-2.5 py-1 bg-{color}-500/10 border border-{color}-500/20 text-{color}-400 text-xs font-semibold rounded-full`
- **Color identity per section:** each card/section gets a unique accent (indigo/purple, amber/orange, emerald/teal, yellow/amber). Never reuse the same color twice in a single view.
- **Never** use flat solid gradient banners (`bg-gradient-to-r from-X to-Y`) for promo sections. Use the dark card pattern instead.
- All cards use `group` on the container so child elements can use `group-hover:` utilities.

## Tech Stack

- **Frontend:** React 18 + Vite
- **Styling:** Tailwind CSS
- **Routing:** React Router v7
- **Charts:** Recharts
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel (auto-deploys on push to main)
- **Icons:** Lucide React
- **APIs:** YouTube Data API v3, TikTok (embedded JSON scraping), Twitch Helix API, Kick API v1

## Project Structure

```
src/
├── components/
│   ├── Header.jsx        # Navigation header
│   ├── Footer.jsx        # Site footer
│   ├── SEO.jsx           # Meta tags for pages
│   ├── Odometer.jsx      # Animated number counter
│   ├── KickIcon.jsx      # Custom Kick platform SVG icon
│   ├── TikTokIcon.jsx    # Custom TikTok platform SVG icon
│   ├── ProductCard.jsx   # Full-size affiliate product card
│   └── MiniProductCard.jsx # Compact product card + grid
├── pages/
│   ├── Home.jsx          # Landing page with search
│   ├── Search.jsx        # Creator search
│   ├── Rankings.jsx      # Top creators by platform
│   ├── Reports.jsx       # Custom reports & bulk export (Mod-only)
│   ├── CreatorProfile.jsx # Individual creator stats
│   ├── LiveCount.jsx     # Real-time subscriber counter
│   ├── Compare.jsx       # Compare creators
│   ├── Blog.jsx          # Blog listing page
│   ├── BlogPost.jsx      # Individual blog post viewer
│   ├── BlogAdmin.jsx     # Blog & products admin panel
│   ├── About.jsx         # About page
│   ├── Contact.jsx       # Contact page
│   ├── Privacy.jsx       # Privacy policy
│   └── Terms.jsx         # Terms of service
├── services/
│   ├── youtubeService.js # YouTube Data API integration
│   ├── twitchService.js  # Twitch Helix API integration
│   ├── kickService.js    # Kick API integration
│   ├── tiktokScraper.js  # TikTok scraper (fetch + embedded JSON, no Puppeteer)
│   ├── creatorService.js # Supabase CRUD operations
│   ├── blogService.js    # Blog posts CRUD
│   ├── blogAdminService.js # Blog admin operations
│   └── productsService.js # Affiliate products CRUD
├── lib/
│   ├── supabase.js       # Supabase client
│   └── analytics.js      # Google Analytics
├── App.jsx               # Main app with routes
├── main.jsx              # Entry point
└── index.css             # Tailwind + custom styles

scripts/
├── collectDailyStats.js      # Daily stats collection (runs 3x daily)
├── refreshRankingsCache.js   # Precomputes rankings_cache table (runs after each stats collection)
├── refreshTikTokProfiles.js  # Refresh N TikTok profiles (staleness order)
├── discoverTikTokCreators.js  # Discover new TikTok creators from curated list
├── monitorTwitchStreams.js   # Twitch stream monitoring (every 5 min)
├── monitorKickStreams.js     # Kick stream monitoring (every 5 min)
├── aggregateHoursWatched.js  # Calculate Twitch/Kick hours watched
├── processCreatorRequests.js # Process pending TikTok creator requests (runs 4x daily via GitHub Actions)
├── seedTopCreators.js        # Seed top 50 creators
├── seedTopCreatorsExpanded.js # Seed 200+ creators
├── seedTopKickCreators.js    # Seed top Kick creators
├── seedTopSpotifyArtists.js  # Seed top 1000 Spotify artists (15 genre seeds)
├── seedBlogPosts.js          # Seed initial blog posts
├── seedProducts.js           # Seed affiliate products
├── generateSitemap.js        # Generate sitemap.xml dynamically
├── updateBlogPost.js         # Update blog post content from temp files
└── local/                    # Local automation (Windows Task Scheduler)
    ├── README.md             # Setup instructions for local tasks
    ├── refresh-tiktok.bat    # Batch script for TikTok profile refresh
    └── discover-tiktok.bat   # Batch script for TikTok creator discovery

api/                              # Vercel serverless functions
├── twitch.js                 # Twitch API proxy (keeps secrets server-side)
├── kick.js                   # Kick API proxy (keeps secrets server-side)
├── request-creator.js        # Creator request submission endpoint
└── admin.js                  # Admin verification endpoint
```

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/` | Home | Landing page with search |
| `/search` | Search | Search creators |
| `/rankings` | Rankings | Top creators overall |
| `/rankings/:platform` | Rankings | Top creators for platform |
| `/compare` | Compare | Compare multiple creators |
| `/live/:platform/:username` | LiveCount | Real-time counter |
| `/:platform/:username` | CreatorProfile | Creator stats page |
| `/blog` | Blog | Blog listing page |
| `/blog/:slug` | BlogPost | Individual blog post |
| `/blog/admin` | BlogAdmin | Blog & products admin panel |
| `/reports` | Reports | Custom reports & bulk export (Mod-only) |
| `/about`, `/contact`, `/privacy`, `/terms` | Static | Info pages |

## Database Schema

```sql
creators (id, platform, platform_id, username, display_name, profile_image, description, country, category, created_at, updated_at)
creator_stats (id, creator_id, recorded_at, subscribers, followers, total_views, total_posts, hours_watched_*, peak_viewers_*, avg_viewers_*, streams_count_*)
rankings_cache (platform, rank_type, rank_position, creator_id, username, display_name, profile_image, platform_id, subscribers, total_views, total_posts, growth_30d, hours_watched_*, computed_at) — PK (platform, rank_type, rank_position)
creator_requests (id, platform, username, user_id, status, error_message, created_at, processed_at)
stream_sessions (id, creator_id, stream_id, started_at, ended_at, peak_viewers, avg_viewers, hours_watched, game_name, title)
viewer_samples (id, session_id, recorded_at, viewer_count, game_name)
blog_posts (id, slug, title, description, content, category, author, image, read_time, published_at, is_published, created_at, updated_at)
products (id, slug, name, price, badge, description, features[], image, affiliate_link, is_active, created_at, updated_at)
saved_reports (id, user_id, name, config[jsonb], created_at, updated_at)
```

## Platform API Notes

**YouTube:**
- Subscriber counts rounded to 3 significant figures (YouTube policy since 2019)
- UI defaults to showing Views (accurate) instead of Subscribers for growth metrics
- Daily subscriber changes hidden in UI since they're always 0 for large channels

**Twitch:**
- `view_count` deprecated in April 2022
- We track **Hours Watched** instead (industry standard)
- Follower counts are accurate

**Kick:**
- No follower count endpoint in API — only `active_subscribers_count` (paid subs)
- `subscribers` field stores paid subscriber count (not free followers)
- Live stream status available via `/channels` endpoint (`stream.is_live`)
- Uses OAuth2 Client Credentials flow (same pattern as Twitch)
- Batch up to 50 slugs per request
- Custom `KickIcon` SVG component (no lucide-react icon available)

**TikTok:**
- No official public API for querying arbitrary profiles
- Uses **HTTP fetch with browser user-agent** to scrape `__UNIVERSAL_DATA_FOR_REHYDRATION__` embedded JSON
- TikTok embeds all profile data (followers, likes, videos) in a script tag as structured JSON
- **No Puppeteer/Chrome needed** — lightweight HTTP request only
- Service: `src/services/tiktokScraper.js`
- Runs via `refreshTikTokProfiles.js` (2x daily, ALL creators per run — via GitHub Actions)
- Discovery via `discoverTikTokCreators.js` (curated list of top creators)
- Rate-limited scraping: 2 seconds between requests
- Custom `TikTokIcon` component using `currentColor` pattern (like Lucide icons)
- Profile displays: Followers, Likes, Videos (3-card stats grid)
- Growth summary shows: Followers and Posts growth
- Daily Metrics Table columns: Date, Followers (with changes), Likes (with changes), Videos (with changes)
- `total_views` field stores TikTok likes count (repurposed since TikTok doesn't have "views" per profile)
- **Creator Request System:** Users can request TikTok creators not in the database
  - Request button appears on search page when no results found
  - Backend validates username format and checks for duplicates
  - Requests stored in `creator_requests` table with status tracking
  - Processed by GitHub Actions (4x daily) — TikTok doesn't block cloud IPs
  - 429 errors revert requests to `pending` (not `failed`) for retry on next run
  - Scalable queueing system prevents timeout issues

**Spotify:**
- Uses the Spotify Web API with Client Credentials OAuth2 flow (no user auth needed)
- `platform_id` stores the Spotify artist ID (e.g. `06HL4z0CvFAxyc27GXpf02`)
- `username` stores the slugified artist name (e.g. `taylor-swift`) — NOT a Spotify handle
- `subscribers` + `followers` = `followers.total` (Spotify API)
- `total_views` = `popularity` (0-100 Spotify score, updates faster than followers)
- `total_posts` = null (Spotify has no content count per profile)
- `description` = comma-separated genres (top 3)
- Profile page shows: Followers, Popularity Score (/100), Genres
- Color scheme: `text-green-400`, `bg-green-950/30`, `border-green-800`
- Proxy: `api/spotify.js` — search, artist (single), batch (up to 50 IDs)
- Service: `src/services/spotifyService.js`
- `slugifyArtist()` helper: lowercase, remove non-alphanumeric, collapse spaces/dashes to `-`
- Seed: `scripts/seedTopSpotifyArtists.js` — collects 1000+ artists across 15 genre seeds
- Profile URLs: `https://open.spotify.com/artist/{platformId}`
- **Required env vars:** `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`

**ADDING A NEW PLATFORM — completeness checklist:**
Before declaring a new platform "done," run this from the repo root:
```bash
grep -rl "bluesky" src/ scripts/ api/ | xargs grep -L "$NEW_PLATFORM"
```
Substitute `bluesky` with whatever platform was most recently added — currently **`substack`** (it's the canonical "you have to touch all these files" template). The output lists every file that mentions the template platform but not the new one. Walk the list. Common categories of misses:
- `src/components/Footer.jsx` — `PLATFORM_LINKS` array + tagline string
- `src/components/CommandPalette.jsx` — `PLATFORM_ICONS` map + `PLATFORM_LINKS` array
- `src/components/BlogContent.jsx` — `PLATFORM_META` for `{{creators:...}}` blog embed
- `src/pages/Rankings.jsx` — `noViews` check, `getSeoData` (title noun map, descriptions, keywords), `getH1Text`, `getSubheading`, follower label
- `src/pages/Account.jsx` — `LISTING_PLATFORMS`, labels, pill colors
- `src/pages/FAQ.jsx`, `About.jsx`, `Methodology.jsx`, `Promote.jsx`, `Support.jsx`, `BlogPost.jsx` — body copy strings
- `api/og.jsx` — `PLATFORM_LABELS` + `PLATFORM_COLORS`
- `api/update-creator.js` — `validPlatforms` array (lazy creator hydration breaks without this)
- `api/stripe-checkout.js` — `VALID_PLATFORMS` set (Featured Listings can't be created without this)
- `scripts/generateSitemap.js` — static `/rankings/{platform}` URL
- `scripts/generateBlogDraft.js` — 3 prompt strings mentioning platforms + entity-blacklist regex
- `index.html` — meta description, og:description, twitter:description, structured-data description

**Rumble:**
- YouTube alternative video platform. No public API — we scrape public channel pages.
- `username` = the bare slug (e.g. `Bongino`). `platform_id` = `c:slug` (for `/c/...` channels) or `user:slug` (for `/user/...` accounts) to disambiguate.
- We track followers + video count. Total views are NOT tracked (would require per-video scraping).
- Service: `src/services/rumbleService.js`. `getRumbleChannel(input)` accepts a slug, prefixed id, or full URL and tries `/c/` first then falls back to `/user/`.
- Collection paces at 800ms between requests (~1.25 req/s) — Rumble has no published rate limit so we're conservative.
- No live counter (follower counts don't tick fast enough).
- Color scheme: `lime-600` (`#65a30d`). Distinct from Kick's `green-600`.
- Discovery + seed crawl `/browse/{category}` pages for channel links + a curated handle list. Seed targets 1K creators.
- Profile URLs: `https://rumble.com/c/{slug}` or `https://rumble.com/user/{slug}` (CreatorProfile uses `platform_id` to pick the right one).

**Mastodon:**
- Federated. Username = full webfinger handle `user@instance.tld` (e.g. `Mastodon@mastodon.social`)
- `platform_id` = `{instance}:{account.id}` for cross-instance uniqueness
- No views metric (same shape as Bluesky: followers + posts only)
- No auth required, no API key — uses public ActivityPub endpoints on each instance
- Falls back to `mastodon.social/api/v2/search?resolve=true` if a direct instance lookup fails
- Major instances list lives in `src/services/mastodonService.js#MAJOR_INSTANCES`
- Service: `src/services/mastodonService.js`
- Rate limit: 300 req/5min per instance (default); we pace at 100ms between requests in collectDailyStats.js
- Custom `MastodonIcon` component using the official "M" mark
- Color scheme: `violet-600` (`text-violet-700`, `bg-violet-50`, `border-violet-200`)
- CSP `connect-src` enumerates the top instances we federate to — vercel.json
- Profile URLs: `https://{instance}/@{user}` (e.g. `https://hachyderm.io/@mosseri`)
- Discovery: `discoverMastodonCreators.js` pulls each instance's `/api/v1/directory?order=active` plus rotating hashtag searches via mastodon.social
- Seed: `seedTopMastodonCreators.js` curates ~250 known accounts + sweeps top instance directories to reach 1K

**Bluesky:**
- Uses the AT Protocol public API — zero authentication required, no API key, no approval process
- Base URL: `https://public.api.bsky.app/xrpc/`
- Key endpoints: `app.bsky.actor.getProfile` (single), `app.bsky.actor.searchActors` (search), `app.bsky.actor.getProfiles` (batch up to 25)
- `platform_id` stores the DID (e.g. `did:plc:abc123`) — stable unique identifier
- `username` stores the handle (e.g. `mosseri.bsky.social`)
- `subscribers` field stores `followersCount`
- `total_posts` stores `postsCount`
- `total_views` is null (no profile-level views metric on Bluesky)
- Service: `src/services/blueskyService.js`
- Search is live from AT Protocol API (not database-only like TikTok)
- No creator request system needed — API is fully public
- No live stream support (Bluesky is not a streaming platform)
- Custom `BlueskyIcon` SVG butterfly component (no lucide-react icon available)
- Profile displays: Followers, Posts (2-card stats grid)
- Daily Metrics Table columns: Date, Followers (with changes), Posts (with changes)
- Collected in `collectDailyStats.js` with batch size of 25
- Color scheme: sky-500 Tailwind palette (`text-sky-400`, `bg-sky-950/30`, `border-sky-800`)

**Substack:** (platform #9, added 2026-05-31)
- Newsletter / long-form platform. The category leaderboard API exposes a **precise total subscriber count** for ~88% of pubs via the `freeSubscriberCount` field (e.g. `"2,900,000"`). The remaining ~12% only expose the coarse order-of-magnitude band (`rankingDetailFreeIncludedOrderOfMagnitude`: 1K/10K/100K/1M), used as a fallback floor. ALWAYS prefer `freeSubscriberCount` — parse digits, fall back to the band. (Do NOT use `rankingDetailFreeIncludedOrderOfMagnitude` as the primary; that was the original mistake — it made Letters from an American read 1M instead of its real 2.9M.)
- `platform_id` = numeric publication id (stable). `username` = the subdomain slug (e.g. `lenny`). Profile URL = `https://{slug}.substack.com` (always resolves, even for custom-domain pubs).
- `subscribers` = precise total (free+paid) from `freeSubscriberCount`, band floor fallback. `total_views`/`total_posts` = null (no public post count in the leaderboard data — Substack shows just subscribers, no second metric). Substack natively uses **"subscribers"** so it joins YouTube's label group (NOT followers).
- **Ranking is by precise `subscribers` DESC, like every other platform.** `creators.leaderboard_rank` is still populated (global position across category leaderboards) but is only a TIEBREAKER now: `refresh_rankings_cache_platform`'s substack ORDER BY is `stat_subs DESC, leaderboard_rank ASC`. The `subsFor(pub)` helper (precise-or-band) is duplicated in `seedTopSubstackCreators.js`, `discoverSubstackCreators.js`, and `collectDailyStats.js#buildSubstackRanking`.
- Data source: `https://substack.com/api/v1/category/public/{categoryId}/paid?page=N` (25/pub per page, paginated). Category ids live in `SUBSTACK_CATEGORIES` (duplicated in the service + both scripts + collectDailyStats).
- Daily collection does ONE leaderboard sweep (~100 requests) and matches tracked pubs by `platform_id`; pubs that drop off keep last-good (no 0 write).
- **Latest post:** `https://{slug}.substack.com/api/v1/archive?sort=new&limit=1` gives title/date/canonical_url/reactions/comments. This is **CORS-blocked from the browser**, so it's fetched **server-side in collectDailyStats** for the **top 300 ranked pubs only** (Substack throttles sustained archive requests from one IP — ~50% success under bulk load, with one retry; a failed fetch never clobbers a prior good value, so coverage accumulates across daily runs). Reactions stored in `latest_post_views` (no view metric). Profile reads latest post from DB columns (like Rumble/Mastodon), shows title + relative date + reactions + comments.
- Profile hero stat shows the precise count via `formatNumber()` (e.g. "2.9M"), like other platforms. Single stat card (subscribers only — no second metric exists). No growth cards. No live counter.
- **Rankings second column:** the per-platform `SECONDARY_COLUMN` map in `Rankings.jsx` decides the one extra column (youtube→Views, tiktok→Likes, music→Plays, rumble→Videos, mastodon/bluesky→Posts; twitch/kick/substack→none). Don't reintroduce ad-hoc per-platform conditions for that column — extend the map.
- **Deliberately excluded from Trending** — Trending is a growth-velocity view and bands produce no meaningful growth signal.
- Service: `src/services/substackService.js`. Custom `SubstackIcon` (stacked-bars mark). Color scheme: `orange-600` (`text-orange-700`, `bg-orange-50`, `border-orange-200`).
- Search is DB-only (live leaderboard API can't free-text search), same as Mastodon/Rumble.
- Seed: `seedTopSubstackCreators.js` (~1.4K pubs across 14 categories). Discovery: `discoverSubstackCreators.js` (rotating categories, recomputes global ranks after adds). CSP allows `https://*.substack.com` for the (best-effort) lazy profile fallback.

## Commands

```bash
npm run dev                    # Dev server on port 3000
npm run build                  # Production build
npm run seed:top-creators      # Seed top creators
npm run seed:kick              # Seed top Kick creators
npm run seed:bluesky           # Seed top Bluesky accounts
npm run seed:spotify           # Seed top 1000 Spotify artists
node scripts/seedTopSubstackCreators.js   # Seed top Substack newsletters (no npm alias)
npm run seed:blog              # Seed blog posts
npm run seed:products          # Seed affiliate products
npm run collect:daily          # Collect daily stats (YouTube, Twitch, Kick, Bluesky)
npm run refresh:rankings       # Recompute rankings_cache table (all platforms, all rank types)
npm run monitor:twitch         # Monitor Twitch streams
npm run monitor:kick           # Monitor Kick streams
npm run aggregate:hours-watched # Aggregate hours watched
npm run discover:tiktok         # Discover new TikTok creators
npm run refresh:tiktok           # Refresh TikTok profile data
```

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=https://ziiqqbfcncjdewjkbvyq.supabase.co
VITE_SUPABASE_ANON_KEY=<key>
VITE_YOUTUBE_API_KEY=<key>
VITE_TWITCH_CLIENT_ID=<key>
TWITCH_CLIENT_SECRET=<key>
KICK_CLIENT_ID=<key>
KICK_CLIENT_SECRET=<key>
SPOTIFY_CLIENT_ID=<key>
SPOTIFY_CLIENT_SECRET=<key>
```

Scripts use `dotenv` to load `.env` automatically.

## Supabase Pro (active since 2026-05-30)

We're on the **Pro** plan. The features below are now available — choose the right one before adding more Vercel functions or GitHub Actions workflows.

### What's actually new vs Free

| Capability | Free (old) | Pro (now) |
|---|---|---|
| Database storage | 500 MB | 8 GB |
| File storage | 1 GB | 100 GB |
| Egress | 5 GB/mo | 250 GB/mo |
| Auto backups | none | daily, 7-day retention |
| Point-in-time recovery | no | add-on available |
| Realtime messages | 2M/mo | unlimited |
| Edge Function invocations | 500K/mo | 2M/mo |
| Project auto-pause | yes (1 wk idle) | never |

### `pg_cron` + `pg_net` — already installed

```sql
SELECT cron.schedule(
  'refresh-rankings-cache',
  '15 */6 * * *',  -- every 6 hours, at minute 15
  $$ SELECT public.refresh_rankings_cache() $$
);
```

For HTTP calls (e.g. trigger a Supabase Edge Function on a schedule):
```sql
SELECT cron.schedule(
  'sync-something',
  '0 */4 * * *',
  $$ SELECT net.http_post(
       url := 'https://ziiqqbfcncjdewjkbvyq.supabase.co/functions/v1/my-edge-function',
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
       body := '{}'::jsonb
     ) $$
);
```
List jobs: `SELECT * FROM cron.job;`. Cancel: `SELECT cron.unschedule('jobname');`. Schedules use standard cron syntax. Jobs run in UTC.

### When to use which runtime

This is the decision tree for new scheduled work or new endpoints. Apply it before adding to either `api/` or `.github/workflows/`.

**Pure DB work (SQL only, < 60s): use `pg_cron`.**
Examples: `refresh_rankings_cache`, table-level aggregations, cleanup of expired `featured_listings`. No Node, no GitHub Actions overhead, no Vercel slot. Runs inside Postgres so it shares the same transaction guarantees as everything else.

**HTTP proxy or scraper that returns JSON (< 50s, no npm deps Deno can't handle): use a Supabase Edge Function.**
Edge Functions are Deno-based and **don't count against Vercel Hobby's 12-function cap**. This is the escape valve when we'd otherwise hit the cap and have to convert a Vercel function to Edge runtime as we did for `api/mastodon.js`. New scrapers (Rumble-style) and new platform proxies (Twitch/Kick/YouTube/Last.fm style) should go here unless they need a Node-only library. Deploy with `supabase functions deploy NAME`. Call as `https://ziiqqbfcncjdewjkbvyq.supabase.co/functions/v1/NAME`. Free invocation budget is 2M/mo on Pro.

**Anything that needs `@vercel/og`, Stripe webhook raw-body verification, or @vercel/* SDKs: stay on Vercel.**
Concretely: `api/og.jsx`, `api/stripe-webhook.js`. These will never move.

**Long-running batch jobs (> 60s, heavy Node deps): stay on GitHub Actions.**
The TikTok refresh, daily stats collection, stream monitors, and creator discovery all run for several minutes and depend on `@supabase/supabase-js` + a lot of `fetch`. Edge Functions cap each invocation at 60s (150s on Pro for newer regions), which makes them a bad fit. GitHub Actions on a public repo is free and effectively unlimited for us.

**Polling user-generated state (creator requests, contact form submissions): use Database Webhooks instead.**
Pro exposes Database Webhooks — `INSERT`/`UPDATE`/`DELETE` on a table can fire an Edge Function or HTTP endpoint immediately. Replace `process-creator-requests.yml` (currently polls every 6 hours) with a webhook on `creator_requests` → Edge Function. Faster response, no quota burn.

### Vercel function cap budget

Hobby plan = 12 Node serverless functions. Edge runtime functions also count. As of 2026-05-30 we have 14 files in `api/` (one is `_ratelimit.js` shared helper, and `api/mastodon.js` is forced to Edge runtime because we'd otherwise be over). If we add a 13th Node function the deploy fails silently — the GitHub deployment status flips to "failure" with only `Deployment has failed` as the message. **Before adding anything to `api/`, ask: can this be a Supabase Edge Function instead?** Almost always the answer is yes.

Files that should migrate to Supabase Edge Functions next time they're touched:
- `api/rumble.js` (HTML scraper proxy — Deno handles fetch fine)
- `api/twitch.js`, `api/kick.js`, `api/youtube.js`, `api/lastfm.js` (all stateless API proxies)
- `api/image-proxy.js` (pure pass-through)

That migration frees 5 Vercel slots and removes the cap pressure for a long time.

### Other Pro features worth knowing

- **Supabase Vault** — encrypted secrets table. If we ever store per-creator API tokens (e.g. user-provided YouTube OAuth) we put them here, not in `users.*` columns.
- **Storage with image transformations** — `?width=400&height=400&resize=cover` on storage URLs. Useful if we ever host custom assets (right now all avatars are hot-linked from the platform).
- **Read replicas (Team+)** — not us yet, but listed for future awareness.
- **Foreign Data Wrappers (`wrappers` ext)** — can query external APIs from SQL (Stripe, ClickHouse, etc.). Probably overkill but available.

## GitHub Actions

**Public repo — unlimited GitHub Actions minutes:**
- **Daily Stats Collection:** Runs 3x daily (1 AM, 9 AM, 5 PM EST) — collects YouTube, Twitch, Kick, and Bluesky stats
- **TikTok Profile Refresh:** Runs 4x daily (9 PM, 3 AM, 9 AM, 3 PM EST) — scrapes all TikTok creator profiles
- **Creator Request Processor:** Runs 4x daily (every 6 hours) — processes pending TikTok creator requests
- **Creator Discovery:** Runs 4x daily via `.github/workflows/youtube-discovery.yml` (badly named — covers ALL platforms). Steps in order: YouTube → Kick → Twitch → TikTok (queues candidates from existing creators) → Bluesky → Music. Scripts: `discoverYouTubeCreators.js`, `discoverKickCreators.js` (MIN_VIEWERS=500 + MIN_SUBSCRIBERS=1 to skip junk accounts), `discoverTwitchCreators.js`, `discoverTikTokCreators.js`, `discoverBlueskyCreators.js` (searches 25 topic seeds via public AT Protocol, 10K+ followers), `discoverMusicArtists.js` (Last.fm chart pages 1-6 + 3 random genre tags per run, 10K+ listeners).
- **GitHub Secret naming:** Twitch credentials in GH secrets are `VITE_TWITCH_CLIENT_ID` and `VITE_TWITCH_CLIENT_SECRET` (both prefixed). When wiring new workflow steps, double-check secret names against existing workflows or jobs will fail with "credentials not configured."
- **Twitch Stream Monitor:** Runs every 3 hours (8x daily) — tracks live streams and hours watched
- **Kick Stream Monitor:** Runs every 3 hours (8x daily, offset) — tracks live streams and hours watched

**Note:** TikTok scraping works from GitHub Actions IPs (confirmed Feb 2026). Local scripts kept as fallback only.

## Local Automation (Fallback Only)

Local scripts in `scripts/local/` are kept as a fallback if GitHub Actions gets rate-limited by TikTok. Normal operation is fully automated via GitHub Actions — no Windows Task Scheduler setup needed.

- `refresh-tiktok.bat` — manual TikTok profile refresh
- `discover-tiktok.bat` — manual TikTok creator discovery

See `scripts/local/README.md` for usage.

## Conventions

- UUIDs: Use `gen_random_uuid()` in Supabase
- Numbers: Format with K/M/B suffixes via `formatNumber()`
- Dates: Use `getTodayLocal()` for America/New_York timezone
- Usernames: Store without @ prefix

## Monetization Model (current)

**No subscription tiers anymore.** The Lurker/Sub/Mod system was deprecated. ShinyPull is free-to-use and monetized through:

1. **Featured Listings (B2B)** — paid sponsored slots in rankings tables via `/promote`. Stripe Checkout flow. Slots are first-come-first-served, queue auto-promotes as slots open. Table: `featured_listings`. Pricing: $49/mo Basic, $149/mo Premium.
2. **Google AdSense** — display ads for anonymous traffic.
3. **Blog affiliate products** — Amazon affiliate embeds via `{{product:slug}}` markdown in blog posts.

**Deleted (do NOT reintroduce without explicit user request):** `Pricing.jsx`, `SubscriptionContext.jsx`, `UpgradePanel.jsx`, `useSubscription` hook, tier gating logic in Compare/CreatorProfile, the `/pricing` route. The `subscription_tier`/`subscription_status` columns may still exist on `users` but aren't read anywhere.

**Stripe is still wired for Featured Listings only** — `api/stripe-checkout.js`, `api/stripe-portal.js`, `api/stripe-webhook.js`. Required env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Webhook URL: `https://shinypull.com/api/stripe-webhook`.

---

## Authentication & Follow System

**AuthPanel Component (ONLY way to sign in/up):**
- Slide-out panel from the right side (component: `src/components/AuthPanel.jsx`)
- Controlled by custom events: `openAuthPanel` and `closeAuthPanel`
- Supports contextual messages (e.g., "Sign in to follow creators")
- Smooth animations: `translate-x-full` → `translate-x-0` with transition
- Input fields have visible text (text-gray-900) and placeholders
- Integrated into Header component with event listeners
- Shows benefits section when in signup mode (Follow creators, Dashboard, Compare, Recently viewed)
- **To open the auth panel, always dispatch the custom event:**
  ```jsx
  window.dispatchEvent(new CustomEvent('openAuthPanel', {
    detail: { message: 'Sign in to access this feature' }
  }));
  ```
- **There is NO `/auth` page route** - AuthPanel is the only authentication UI

**Follow Button Integration:**
- Follow/unfollow buttons dispatch `openAuthPanel` event when user not authenticated
- Opens auth panel with message: "Sign in to follow creators"
- `ensureUserExists()` helper creates public.users entry if auth.users exists but public.users doesn't

**Dashboard Link:**
- Desktop: Shows in main header navigation (right side)
- Mobile: Appears in hamburger menu dropdown
- Only visible when user is authenticated

## Search Bar Pattern

All search interfaces (Home, Search, Compare) follow this pattern:
- Centered layout with `max-w-2xl mx-auto`
- Search input and button stacked vertically (`space-y-3`)
- Button appears **below** the input (not inline)
- Responsive button width: `w-full sm:w-auto sm:min-w-[200px]`
- Full width on mobile, auto-sized on desktop (min 200px)

## Twitch & Kick Stream Features

**Hours Watched Tracking:**
- Primary metric for Twitch and Kick
- Tracked via `stream_sessions` table with start/end times
- `viewer_samples` table stores viewer count every 5 minutes
- Aggregated daily/weekly/monthly via `aggregateHoursWatched.js`
- **Aggregation approach:** Calendar day snapshots, NOT rolling 24-hour windows
  - Daily: streams that ENDED today (todayStart to todayEnd)
  - Weekly: last 7 calendar days
  - Monthly: last 30 calendar days
- Displayed as "XK Hours" (divide by 1000, add K suffix)

**Daily Channel Metrics Table:**
- Shows Watch Hours column for Twitch creators
- Queries `hours_watched_day` field from `creator_stats`
- Formats large numbers: 58365 → "58K Hours"
- Falls back to "Building Historical Data" when no data yet

## Blog Post Format

**Content Structure:**
- Blog post content starts with intro paragraph (NO H1 title in content)
- Title is rendered from `title` field in header, not from markdown
- First paragraph automatically styled as intro box:
  - Larger text (text-xl)
  - Gradient background (indigo-50 to purple-50)
  - Rounded border with padding
  - Detected by checking `node?.position?.start?.line === 1`
- All blog posts follow this pattern for consistency

**Blog Post Creation:**
1. Title goes in `title` field (used in header)
2. Content starts with intro paragraph (no H1)
3. First heading in content should be H2 (##)
4. Intro paragraph gets automatic gradient box styling
5. Always set `published_at` to the publish date (never leave it null or posts sort incorrectly)

**Writing Style (MANDATORY):**
- Write like a real person, not a language model. Conversational, direct, opinionated.
- **NEVER use em dashes (—).** Use commas, periods, or rewrite the sentence instead.
- **NEVER use these AI cliché patterns:**
  - "isn't just X — it's Y" / "not just X, it's Y"
  - "Here's what it signals:" / "Here's the math:"
  - "seismic shift," "game-changer," "landscape," "paradigm"
  - "beautifully [adjective]," "spectacularly [adverb]"
  - "borderline absurd," "sheer audacity," "genuinely [anything]"
  - "it's worth noting," "it bears mentioning," "importantly"
  - "in an era where," "in a world where"
  - "the question isn't X — it's Y"
  - "And that's [exactly/precisely] the point"
  - "Let that sink in"
  - Semicolons used for dramatic effect
- **DO** use short sentences. Fragments are fine. Contractions are good.
- **DO** use casual language: "nah," "basically," "pretty much," "kind of," "a ton of"
- **DO** state opinions directly instead of hedging with qualifiers
- **DO** vary sentence length. Mix punchy one-liners with longer explanations.
- Read the final draft out loud. If it sounds like a press release or a college essay, rewrite it.

## Blog & Products System

**Blog Admin Panel (`/blog/admin`):**
- Full CRUD interface for blog posts and affiliate products
- Two tabs: Posts and Products
- Markdown content editor with product embed support
- Publish/unpublish toggle for posts
- Active/inactive toggle for products
- Copy embed codes to clipboard

**Product Embeds:**
- Use `{{product:slug}}` for full-size product cards in blog content
- Use `{{product-mini:slug}}` for compact vertical cards (image, name, price, buy button)
- Use `{{product-grid}}...{{/product-grid}}` to wrap mini cards in a responsive grid
- BlogPost component parses and replaces with ProductCard/MiniProductCard components
- Products are fetched asynchronously from Supabase
- Both components support snake_case (DB) and camelCase (legacy) fields

**Updating Blog Content:**
When you need to update a blog post with large content changes:
1. Create the new content in a temp file (e.g., `temp_blog_updated.txt`)
2. Use `scripts/updateBlogPost.js` as a template
3. Modify the script to read your temp file and target the correct slug
4. Run: `node scripts/updateBlogPost.js`
5. Content is updated in Supabase (no need to git commit temp files)

**Adding Products:**
1. Visit `/blog/admin` → Products tab
2. Click "New Product"
3. Fill in: name, slug, price, badge, description, features, image URL, affiliate link
4. Copy the embed code: `{{product:slug}}`
5. Paste into any blog post content
6. Product card automatically renders with image, features, and buy button

**Product Images:**
- Use Amazon product images: Right-click product image → "Open image in new tab" → Copy URL
- Format: `https://m.media-amazon.com/images/I/[IMAGE_ID]._AC_SL1500_.jpg`

## Database Management

**NO local migrations folder.** All database changes are made directly against the live Supabase database.

**Two ways to interact with the database:**

1. **Data operations (CRUD):** Use the Supabase JS client with `SUPABASE_SERVICE_ROLE_KEY` from `.env`. This bypasses RLS and works for reads/writes via PostgREST. Cannot run DDL (CREATE/ALTER/DROP).

2. **Schema/DDL/RLS changes:** Use the Supabase Management API SQL endpoint. This can run ANY SQL including CREATE POLICY, ALTER TABLE, etc.

**Running DDL/schema SQL — use the built-in helper script:**
```bash
node scripts/run-sql.js "YOUR SQL HERE"

# Examples:
node scripts/run-sql.js "SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'"
node scripts/run-sql.js "CREATE INDEX CONCURRENTLY ..."
node scripts/run-sql.js "ALTER TABLE creators ADD COLUMN ..."
node scripts/run-sql.js "$(cat my-migration.sql)"
```

`scripts/run-sql.js` reads the Supabase CLI access token from Windows Credential Manager at runtime (stored there by `npx supabase login`). No credentials are in the file — it is safe to commit. If it fails with a token error, run `npx supabase login` to re-authenticate.

**NEVER write `.ps1` files to the repo** to extract the token manually. That's what `run-sql.js` is for. The repo has `*.ps1` in `.gitignore` as a safeguard.

**Known quirk — DELETE/UPDATE via run-sql.js silently no-ops.** The Supabase Management API `/database/query` endpoint returns `OK (no rows returned)` for `DELETE`/`UPDATE` statements but does NOT actually mutate the rows. An agent (me) hit this on 2026-05-30 trying to clean Rumble dupes: `--yes-destroy "DELETE ..."` reported success three times in a row while the rows persisted. **For row-level CRUD, use the Supabase JS client with the service role key in a small ad-hoc script.** Only use `run-sql.js` for DDL (CREATE / ALTER / DROP) and read-only queries. If you delete creator rows, remember to cascade through `rankings_cache`, `user_saved_creators`, `featured_listings`, `stream_sessions`, and `creator_stats` (none of these have ON DELETE CASCADE on the creator FK).

**Also note — `CREATE OR REPLACE FUNCTION` via `run-sql.js` shell wrapping is unreliable.** When the function body contains `$function$` quoting or DELETE statements, the shell-encoded SQL passed through `run-sql.js` sometimes lands at the API as a partially executed payload (DDL succeeds with 201, but the new body isn't what you sent). When updating stored procedures, write the full SQL to a temp file and POST it directly to `https://api.supabase.com/v1/projects/{ref}/database/query` instead of using `run-sql.js`.

**Mastodon rankings quirk — Flipboard + dead instances inflate the leaderboard.** Two pollution sources to filter:
  1. **Flipboard.com ActivityPub bridge.** Flipboard publishes its internal magazines as Mastodon-compatible accounts but reports its native Flipboard userbase as `followers_count` — e.g. `thenewsdesk@flipboard.com` reports 233M, which is ~100× the entire Mastodon userbase. The ranking refresh function filters `username NOT LIKE '%@flipboard.com'`.
  2. **Dead instances and 404'd accounts.** Once-seeded accounts on instances that died (e.g. `climatenews-xyz.fly.dev`) or accounts that got deleted retain their last-good follower count in `creator_stats` and pollute rankings forever. Fix: `creators.last_verified_at` is stamped only on a 200 response. Rankings require `last_verified_at >= NOW() - INTERVAL '14 days'` for Mastodon. Daily collection refreshes the timestamp.

**Important notes:**
- `npx supabase db dump`, `db pull`, and `db diff` all require Docker (not installed) — do NOT use them
- `npx supabase projects list` and `projects api-keys` work fine (Management API only)
- `npx supabase db lint --linked` works for linting (connects directly)
- The Supabase JS client (`pg` via PostgREST) CANNOT run DDL — always use the Management API for schema changes

**NEVER use migration files** — they were deleted and should not be recreated. Always use direct database access.

## RLS Policy Reference

All tables have RLS enabled. Here are the current policies:

**Read-only tables (frontend can SELECT, only service_role can write):**
- `creators`, `creator_stats`, `blog_posts`, `products`, `stream_sessions`, `viewer_samples`
- SELECT: `TO anon, authenticated USING (true)`
- INSERT/UPDATE/DELETE: `TO anon, authenticated USING/WITH CHECK (false)`
- Server-side scripts use `service_role` key which bypasses RLS

**User-owned tables (authenticated users can manage their own data):**
- `user_saved_creators`:
  - SELECT own: `TO authenticated USING (auth.uid() = user_id)`
  - INSERT own: `TO authenticated WITH CHECK (auth.uid() = user_id)`
  - DELETE own: `TO authenticated USING (auth.uid() = user_id)`
  - Anon blocked: `TO anon USING/WITH CHECK (false)`
- `users`:
  - SELECT own: `TO authenticated USING (auth.uid() = id)`
  - INSERT own: `TO authenticated WITH CHECK (auth.uid() = id)`
  - UPDATE own: `TO authenticated USING/WITH CHECK (auth.uid() = id)`
  - Anon blocked: `TO anon USING/WITH CHECK (false)`

- `saved_reports`:
  - SELECT own: `TO authenticated USING (auth.uid() = user_id)`
  - INSERT own: `TO authenticated WITH CHECK (auth.uid() = user_id)`
  - DELETE own: `TO authenticated USING (auth.uid() = user_id)`
  - Anon blocked: `TO anon USING/WITH CHECK (false)`

## Agent Instructions

**Autonomy:**
- Run commands directly - don't ask user to run them
- Use `vercel` or `vercel --prod` for deployment
- For database changes, use the Management API SQL endpoint (NOT migration files)

**When to Update This File:**
- Adding new pages, services, or major features
- Changing database schema or RLS policies
- Adding new API integrations
- Changing architectural patterns or conventions
- Do NOT update for bug fixes, styling changes, or minor tweaks

## Performance Optimization

**PageSpeed scores (as of Feb 2026):** Mobile 85, Desktop 96. SEO 100, Best Practices 100.

**Code splitting (React.lazy):**
- `App.jsx` uses `React.lazy()` + `Suspense` for all page routes except Home
- Home is eagerly loaded (critical path); all other pages load on-demand
- `PageLoader` spinner component shown during lazy chunk loading
- This reduced initial JS payload by ~60%

**index.html optimizations:**
- Google Fonts loaded non-blocking via `media="print" onload="this.media='all'"` pattern
- Google Analytics deferred until `window.load` event (not render-blocking)
- `preconnect` to Supabase origin for faster API calls
- Only font weights 400/500/600/700 loaded (300 removed — unused)

**Image loading:**
- All below-fold `<img>` tags use `loading="lazy"`
- Above-fold hero/LCP images intentionally do NOT have lazy loading

**When adding new pages:**
- Add them as lazy imports in `App.jsx`: `const NewPage = lazy(() => import('./pages/NewPage'));`
- Do NOT add regular imports — this would bundle them into the main chunk and hurt performance

---

*Last updated: 2026-05-31*
