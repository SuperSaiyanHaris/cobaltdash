# ShinyPull (repo: cobaltdash)

Shared project notes for every Claude session, local and cloud. This file is
committed; the root `CLAUDE.md` is gitignored and local-only, so cloud
sessions never see it. Anything a cloud session must know goes here.

# Working with the site owner

- Whenever you need the owner to do something (create a token, change a
  setting in GitHub, Vercel or Supabase, run a workflow, run SQL, etc.), give
  detailed, numbered, click-by-click steps: which site, which menu, what to
  type or pick in each field, what to copy, and what to tell you when done.
  Never just name the thing ("add a token", "set an env var") and assume they
  know how.
- Deploy by pushing straight to `main` in small batches (Vercel deploys it);
  no pull requests unless asked.
- Canonical remote: `https://github.com/SuperSaiyanHaris/cobaltdash.git`.
  The repo is public: never commit tokens, keys or `.env` files.
- Commit messages carry no attribution trailers: no `Co-Authored-By`, no
  `Claude-Session`, nothing naming Claude or Anthropic. This overrides any
  default that adds them. Just the subject and body.

# Data rules (hard rules)

- NEVER delete creators or creator-related data, and never run `DELETE`,
  `TRUNCATE`, `DROP` or `ALTER TABLE ... DROP` on a production table, without
  first telling the owner exactly which rows will go and getting a clear yes.
- `scripts/run-sql.js` silently no-ops on DELETE/UPDATE. Use the JS client
  with the service key, or give the owner SQL for the Supabase SQL Editor.
- PostgREST returns at most 1000 rows per request. Any query that can exceed
  that needs an `.order('id').range()` loop, and long `.in('id', [...])` lists
  must be chunked (~200) or the request line overflows and fails with a bare
  "Bad Request".
- There is no `ON DELETE CASCADE` from `creators`: removing a creator means
  clearing its rows in `rankings_cache`, `creator_stats`, `user_saved_creators`,
  `featured_listings`, `stream_sessions`, `creator_comments`,
  `listing_vouchers`, `user_progress.shiny_creator_id` (and any other
  `creator_id` table) first.

# Profile comments

- Signed-in users comment on profiles (`CreatorComments.jsx`, above Similar
  creators). Tables: `commenter_profiles` (public handle; never show
  `users.display_name`, it often holds an email), `creator_comments`,
  `comment_votes`, `comment_reports` (schema and RLS in
  `supabase/migrations/20260927_creator_comments.sql`).
- Every write goes through `api/comments.js`, which runs `api/_moderation.js`:
  no links/emails/phones, swearing blocked via `obscenity` (catches disguised
  spellings), directed self-harm phrases. No paid services (the owner said no
  AI moderation, 2026-09-27). Comments post instantly; each starts
  `reviewed = false` and waits in /admin > Comments > To review, where the
  owner marks it fine or removes it (checked daily, no email). Reported,
  auto-hidden (3 reports) or heavily downvoted ones sort to the top.
- Replies are one level deep (`parent_id`); replying to a reply prefixes
  "@handle". `/replies` (account menu, unread badge) lists replies under your
  comments plus replies that @mention you; `commenter_profiles.replies_seen_at`
  tracks read state. No emails. Admin accounts may take reserved handles
  (@shinypull shows an Official badge). Admin "Remove and ban" sets
  `commenter_profiles.banned_at` and hides all of that person's comments; a
  banned account can't post, reply, rename, vote or report (API check plus
  `comment_user_ok()` in the vote/report RLS). Unban is in the Banned list. Comments aren't server-rendered or
  indexed.

# ShinyPass (user levels, 2026-09-27)

- Free yearly 1-99 track for signed-in users: `/pass`, public pages
  `/u/:handle` (noindex, respects `user_progress.is_private`), user card in
  the Dashboard hero. Rules and numbers live in `src/lib/shinyPass.js`
  (XP to next level = 40 + 0.6*L^1.5, about 27K XP total, ~6 months of
  daily use). Card rarity by level: Common 1-24, Rare 25+, Epic 50+,
  Legendary 75+.
- Seasons (owner decision 2026-09-27): a season is a year and turns over on
  Oct 1 America/New_York (Season 1: launch to 2027-09-30). SQL
  `current_season()` and JS `seasonForDate()` must agree. `ensure_season()`
  banks the old season's XP in `season_results` and resets XP to 0; level,
  XP, packs (`pack_openings` keyed by season) and level drops reset.
  Badges, cosmetics, streaks and vouchers are kept. Reaching 99 awards
  `season{N}_99` ("Season N Max"). Change both functions together.
- Every write goes through `api/progress.js` (and `api/comments.js` for
  comment XP) with the service key. Grants use the `grant_xp()` SQL function
  (idempotent per (user, action, ref), daily caps); revokes set
  `xp_events.revoked_at`, never delete. Schema:
  `supabase/migrations/20260927e_shinypass.sql` + `..f_shinypass_functions.sql`.
- XP sources: daily visit + streak (sync once a day), comments (taken back if
  removed), upvotes from accounts older than 3 days, follows, saved
  matchups, profile visits. The server verifies each event really happened.
- Packs every 10 levels and at 99 (`PACKS`), art in `src/lib/packArt.js`,
  opening animation in `src/components/pass/PackOpening.jsx`. Packs are
  earned only, never sold. Contents are cosmetic, XP, streak freezes, and
  a free 1-month Basic Featured Listing voucher (5%, 10% from level 60,
  guaranteed at 50 and 99). Redeeming creates a `featured_listings` row with
  `source = 'reward'` and no Stripe subscription, so it lapses by itself.
  Vouchers and totals: /admin > ShinyPass.
- Arena design (owner pick, 2026-09-27): `/pass` is `ArenaTrack.jsx` (HUD,
  featured stage, scroll-snap pages of 10, season packs) with styles in
  `components/pass/arena.css` (lazy) and the Barlow Condensed face loaded
  only on pass pages (`useArenaFont`). Every level has a reward (`TRACK` in
  shinyPass.js): packs, card tiers, and drops from a rotation over stickers,
  name effects, card backs, titles, rings, banners, freezes and XP boosts,
  granted atomically by SQL `grant_track_drops()` (migrations `i`, `j`).
  One cosmetic of each kind per user (unique index); an owned drop pays a
  small fixed XP bonus.
- "OG 2026" badge: every account created in 2026. Scout badge is awarded by
  pg_cron `award-scout-badges` (daily, `award_scout_badges()`).
- Copy on X/blog about this feature follows the same copy rules.

# Supported platforms

- `PLATFORM_IDS` in `src/lib/constants.js` is the only list of supported
  platforms: youtube, tiktok, twitch, kick, bluesky, music, mastodon, substack.
- Anything that lists, draws, searches or collects creators must be limited
  to it (`isActivePlatform()`, or `.in('platform', PLATFORM_IDS)` in a query).
  Old rows for a dropped platform may still be in the database and must never
  reach the UI. `tests/unit/activePlatforms.test.js` guards this.
- Rumble was dropped on 2026-09-04 and removed from the code on 2026-09-25.
  Its old URLs 301 to `/rankings` (`vercel.json`). Do not add it back.
- Adding a platform: add it to `PLATFORM_IDS`, `PLATFORM_DISPLAY_NAMES`,
  `CARD_PLATFORMS`/`LOGOS` in `src/lib/badgeCard.js`, the middleware matcher
  and name maps, the collection matrix, and the sitemap.

# Infrastructure

- Vite + React SPA with Tailwind and framer-motion, hosted on Vercel Pro.
  `middleware.js` (edge) server-renders SEO content and serves the `/badge/...` and
  `/card` SVGs. Serverless functions live in `api/`.
- Supabase: Postgres + PostgREST, RLS on, `rankings_cache` refreshed by
  pg_cron and by the daily workflow.
- Schedules run on Vercel Cron, not GitHub's scheduler (it ran hours late or
  skipped runs). `api/cron/dispatch.js` (guarded by `CRON_SECRET`) starts
  GitHub workflows with `workflow_dispatch` using the `GITHUB_DISPATCH_TOKEN`
  Vercel env var:
  - `daily-stats-collection.yml` at 06:00, 14:00, 22:00 UTC. One parallel job
    per platform (`COLLECT_ONLY`), then a rollup job (hours watched, rankings
    cache refresh, strict data-health check). Substack is collected by the
    `collect-substack` Supabase edge function instead.
  - `live-checks.yml` every 3 hours at :17, and after each deploy: smoke
    checks (`scripts/smoke.mjs`), data health, and Playwright E2E.
    Concurrency is per environment so a Preview run can't cancel Production.
- `scripts/generateSitemap.js` runs at build; it retries, pages at 250 rows,
  falls back to the live sitemaps, and fails the build rather than ship a
  truncated sitemap.
- Checks before pushing: `npm run lint` (0 errors), `npx vitest run`,
  `npm run build`.

# Design

- Light content pages with dark hero bands: the dark Home hero, the dark
  Rankings header (podium), the dark sponsor band and the full-dark sign-in
  page are approved by the owner. Keep that light/dark mix.
- Holographic creator cards (`src/lib/badgeCard.js`, bump
  `CARD_DESIGN_VERSION` in `src/lib/cardUrl.js` when the art changes). Render
  markless (`mark=0`) wherever a card is rotated or faded; upright cards may
  show the logo. Card corners use `rounded-[6.4%/4.571%]`.
- Link previews are built from the cards. Profiles use
  `/og/card/:platform/:username.jpg` (`api/share-card.js`, rendered by
  `api/_shareCard.js` with resvg and our bundled fonts; never sharp's SVG
  text, which has no fonts on Vercel). Other pages use `public/og/*.jpg`,
  regenerated at build by `scripts/generateOgImages.mjs`. Card data for both
  comes from `src/lib/cardData.js`. Bump `SHARE_CARD_V` in `middleware.js`
  when the preview design changes.
- Rarity comes from `cardTier(rank, total)`: Legendary = top 10 or top 0.1%,
  Epic = top 1%, Rare = top 10%, else Common. `getCardsByRarity()` draws per
  band. Home shows Legendary/Epic/Rare; the sign-in wall and the `/card`
  page show all four.
- The card page is `/card` (moved from `/badge` on 2026-09-26; `/badge`
  301s there in `middleware.js`, and React redirects it too). The embed
  images `/badge/:platform/:username` and `/card/:platform/:username` are
  separate and must keep working: creators have them on their sites.
- Card motion escalates with rarity (`MOTION` in `badgeCard.js`): Common a
  slow glint only, Rare adds drifting foil, Epic adds holo stripes and a
  spinning ring, Legendary adds a double glint, prism sweep, sparkles and a
  moving gold number. Keep it cheap: SMIL only, no filters/blur, glints on
  chained begins so nothing repaints between sweeps.
- Rankings: podium header, Table/Cards toggle, foil sponsored rows (Premium
  at ranks 4-5 and 9-10, Basic at 15, 20, 25...), rarity chips on the
  subscribers tab.
- Rarity is shown with `RarityPill` (tappable, opens the explainer sheet).
  Growth stars were removed on 2026-09-25; rarity replaces them. Do not add
  a second rating system.
- Content pages use the shared `PageHero` (dark band, `z-20` so dropdowns in
  it are never covered). Any dark band holding a dropdown or panel needs a
  z-index above the section after it.
- Text on light backgrounds is neutral-600 at the lightest; no faint grays.
- Hover stays quiet (no lift). Follow the existing typography tiers.

# Branding: button colors (owner decision, 2026-09-26)

Three roles, no others:
- **Brand purple (`bg-brand hover:bg-brand-hover`, #7C3AED / #6D28D9, white
  text): the one main action on a screen.** Pull a card, Search, sign in /
  sign up, subscribe, send, the empty-state "request/track this creator",
  "Search creators". At most one purple button in view. Solid color only,
  never a gradient or multi-color button.
- **Black (`bg-neutral-900`, white text) on light pages, white on dark
  bands: everything supporting.** Filters, tabs, toggles, load more,
  selected pills, settings forms, contact links, admin.
- **Gold (amber-400) only for paid placement:** Get Featured, sponsor bands,
  /promote pricing, sponsored slots. Nothing unrelated to sponsorship is gold.
- Third-party brand buttons keep their own color (e.g. Buy Me a Coffee).

# Branding: logo

- The mark is three rising foil bars inside a foil-edged card
  (`src/lib/brandMark.js`). `node scripts/brandAssets.mjs` regenerates the
  favicon, apple-touch-icon, `logo.png`, `logo-mark.svg` and the card back.
- The card back shows the bars only (the card is already the frame).
- The header/footer wordmark ("ShinyPu" + two animated purple bars) is a
  separate asset and stays as is.
- When changing brand assets, search the repo for the old mark's shapes and
  colors, not just file references; inline copies exist.

# Copy rules

- No em dashes in user-facing copy.
- No disclaimers, and no "real"/"genuine" reassurance words.
- Never describe how the data is collected in user-facing copy.
- The newsletter is occasional stories, not a fixed schedule; don't promise
  a cadence.

# Design rules (hard rules)

- NEVER use glowing orbs or colored glow blobs: no blurred colored circles
  (`rounded-full ... blur-[…]`, `blur-3xl` backgrounds), no colored radial
  "aura"/"mesh" washes, no light-burst flashes, and no colored glow
  shadows (e.g. `shadow-[0_0_40px_rgba(amber…)]`, box-shadow in a brand
  color). The owner considers them sloppy "AI slop". Dark sections are a
  flat dark base plus the faint `hero-dot-grid` texture only; shadows are
  neutral black/gray for depth, never colored light.
