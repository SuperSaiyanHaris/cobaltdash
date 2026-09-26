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
  `featured_listings`, `stream_sessions` (and any other `creator_id` table)
  first.

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
  `middleware.js` (edge) server-renders SEO content and serves `/badge` and
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
- Rarity comes from `cardTier(rank, total)`: Legendary = top 10 or top 0.1%,
  Epic = top 1%, Rare = top 10%, else Common. `getCardsByRarity()` draws per
  band. Home shows Legendary/Epic/Rare; the sign-in wall shows all four.
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
