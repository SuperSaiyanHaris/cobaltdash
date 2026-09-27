-- ShinyPass (2026-09-27): levels, streaks, badges, packs and cosmetics for
-- signed-in users. Additive only. Rules live in src/lib/shinyPass.js; every
-- write goes through api/progress.js or api/comments.js with the service key.
-- Clients can read public progress and their own private rows, never write.

CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  streak_freezes integer NOT NULL DEFAULT 0 CHECK (streak_freezes >= 0),
  upvotes_credited integer NOT NULL DEFAULT 0,
  -- { frame, ring, title, banner, badge } keys of owned items
  equipped jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- creator ids shown on the public page, plus the chosen shiny variant
  showcase jsonb NOT NULL DEFAULT '[]'::jsonb,
  shiny_creator_id uuid REFERENCES public.creators(id) ON DELETE SET NULL,
  is_private boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per grant. The unique key makes grants idempotent: the same
-- follow, comment or daily visit can never pay twice.
CREATE TABLE IF NOT EXISTS public.xp_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  ref text NOT NULL DEFAULT '',
  day date NOT NULL,
  xp integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action, ref)
);
CREATE INDEX IF NOT EXISTS xp_events_user_day_idx ON public.xp_events (user_id, day, action);

CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge)
);

CREATE TABLE IF NOT EXISTS public.user_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('frame', 'ring', 'title', 'banner', 'showcase', 'shiny')),
  item_key text NOT NULL,
  source_level integer,
  obtained_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_items_user_idx ON public.user_items (user_id, kind);

CREATE TABLE IF NOT EXISTS public.pack_openings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_level integer NOT NULL,
  items jsonb NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pack_level)
);

-- Free month of a Basic featured listing, won in a pack. Redeeming creates a
-- featured_listings row with source 'reward' and no Stripe subscription, so
-- it lapses on its own after 30 days.
CREATE TABLE IF NOT EXISTS public.listing_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_level integer NOT NULL,
  status text NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'redeemed', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  creator_id uuid REFERENCES public.creators(id),
  listing_id uuid REFERENCES public.featured_listings(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz
);
CREATE INDEX IF NOT EXISTS listing_vouchers_user_idx ON public.listing_vouchers (user_id, status);

ALTER TABLE public.featured_listings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'stripe';

-- Row level security: progress and badges are public (they show on comments
-- and public pages) unless the profile is private; everything else is own-only.
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pack_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY progress_read ON public.user_progress FOR SELECT TO anon, authenticated
  USING (NOT is_private OR user_id = auth.uid());
CREATE POLICY badges_read ON public.user_badges FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY xp_events_own ON public.xp_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY items_own ON public.user_items FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY packs_own ON public.pack_openings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY vouchers_own ON public.listing_vouchers FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON public.user_progress, public.xp_events, public.user_badges, public.user_items, public.pack_openings, public.listing_vouchers FROM anon, authenticated;
GRANT SELECT (user_id, xp, streak, best_streak, last_active_date, streak_freezes, equipped, showcase, shiny_creator_id, is_private) ON public.user_progress TO anon, authenticated;
GRANT SELECT ON public.user_badges TO anon, authenticated;
GRANT SELECT ON public.xp_events, public.user_items, public.pack_openings, public.listing_vouchers TO authenticated;

-- Everyone who already has an account starts at level 1, and every account
-- created in 2026 is an OG.
INSERT INTO public.user_progress (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;
INSERT INTO public.user_badges (user_id, badge, earned_at)
  SELECT id, 'og2026', created_at FROM auth.users
  WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'
  ON CONFLICT DO NOTHING;

-- Scout: you followed a creator and their card has since moved up a rarity
-- (to Rare or better). Checked once a day by pg_cron.
CREATE INDEX IF NOT EXISTS idx_rankings_creator_subs ON public.rankings (creator_id, recorded_at) WHERE rank_type = 'subscribers';

CREATE OR REPLACE FUNCTION public.rank_tier(pos integer, total bigint) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN total IS NULL OR total = 0 OR pos IS NULL THEN 1
    WHEN pos <= 10 OR pos::numeric / total <= 0.001 THEN 4
    WHEN pos::numeric / total <= 0.01 THEN 3
    WHEN pos::numeric / total <= 0.1 THEN 2
    ELSE 1 END
$$;

CREATE OR REPLACE FUNCTION public.award_scout_badges() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  WITH f AS (
    SELECT usc.user_id, usc.creator_id, usc.created_at::date AS fd
    FROM user_saved_creators usc
    WHERE NOT EXISTS (SELECT 1 FROM user_badges b WHERE b.user_id = usc.user_id AND b.badge = 'scout')
  ), snaps AS (
    SELECT f.user_id,
      (SELECT r FROM rankings r WHERE r.creator_id = f.creator_id AND r.rank_type = 'subscribers' AND r.recorded_at >= f.fd ORDER BY r.recorded_at LIMIT 1) AS first_r,
      (SELECT r FROM rankings r WHERE r.creator_id = f.creator_id AND r.rank_type = 'subscribers' ORDER BY r.recorded_at DESC LIMIT 1) AS last_r
    FROM f
  ), tiers AS (
    SELECT user_id,
      rank_tier((first_r).rank_position, (SELECT count(*) FROM rankings x WHERE x.platform = (first_r).platform AND x.rank_type = 'subscribers' AND x.recorded_at = (first_r).recorded_at)) AS t0,
      rank_tier((last_r).rank_position, (SELECT count(*) FROM rankings x WHERE x.platform = (last_r).platform AND x.rank_type = 'subscribers' AND x.recorded_at = (last_r).recorded_at)) AS t1
    FROM snaps
    WHERE first_r IS NOT NULL AND last_r IS NOT NULL AND (first_r).recorded_at < (last_r).recorded_at
  )
  INSERT INTO user_badges (user_id, badge)
  SELECT DISTINCT user_id, 'scout' FROM tiers WHERE t1 > t0 AND t1 >= 2
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.award_scout_badges() FROM anon, authenticated;

-- Run in the SQL Editor once (pg_cron):
-- SELECT cron.schedule('award-scout-badges', '40 7 * * *', 'SELECT public.award_scout_badges()');
