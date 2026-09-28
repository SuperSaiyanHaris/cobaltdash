-- ShinyPass rewards on every level (2026-09-27, Arena redesign). Additive:
-- the old user_items (empty) is renamed aside, never dropped.

-- 1. New cosmetic kinds: stickers, name effects, card backs.
ALTER TABLE public.user_items RENAME TO user_items_v1;
CREATE TABLE public.user_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('frame', 'ring', 'title', 'banner', 'showcase', 'shiny', 'sticker', 'name', 'back')),
  item_key text NOT NULL,
  source_level integer,
  obtained_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_items_user_idx2 ON public.user_items (user_id, kind);
ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY items_own ON public.user_items FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.user_items FROM anon, authenticated;
GRANT SELECT ON public.user_items TO authenticated;
INSERT INTO public.user_items (id, user_id, kind, item_key, source_level, obtained_at)
  SELECT id, user_id, kind, item_key, source_level, obtained_at FROM public.user_items_v1 ON CONFLICT DO NOTHING;

-- 2. XP Boost reward: +25% XP on every grant while it lasts.
ALTER TABLE public.user_progress ADD COLUMN IF NOT EXISTS boost_until timestamptz;

CREATE OR REPLACE FUNCTION public.add_xp_boost(p_user uuid, p_days integer)
RETURNS timestamptz LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE user_progress
  SET boost_until = greatest(coalesce(boost_until, now()), now()) + make_interval(days => p_days), updated_at = now()
  WHERE user_id = p_user RETURNING boost_until
$$;

CREATE OR REPLACE FUNCTION public.grant_xp(p_user uuid, p_action text, p_ref text, p_day date, p_xp integer, p_cap integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c integer; new_xp integer; s integer; amt integer := p_xp;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || p_action, 0));
  s := ensure_season(p_user);
  IF p_cap IS NOT NULL THEN
    SELECT count(*) INTO c FROM xp_events WHERE user_id = p_user AND action = p_action AND day = p_day;
    IF c >= p_cap THEN RETURN NULL; END IF;
  END IF;
  -- Boost applies to earned XP, not to pack or drop XP (those are rewards already).
  IF p_xp > 0 AND p_action NOT IN ('pack', 'drop') AND EXISTS (SELECT 1 FROM user_progress WHERE user_id = p_user AND boost_until > now()) THEN
    amt := round(p_xp * 1.25);
  END IF;
  INSERT INTO xp_events (user_id, action, ref, day, xp, season) VALUES (p_user, p_action, p_ref, p_day, amt, s)
  ON CONFLICT (user_id, action, ref) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE user_progress SET xp = xp + amt, updated_at = now() WHERE user_id = p_user RETURNING xp INTO new_xp;
  RETURN new_xp;
END $$;

REVOKE ALL ON FUNCTION public.add_xp_boost(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_xp(uuid, text, text, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_xp_boost(uuid, integer), public.grant_xp(uuid, text, text, date, integer, integer) TO service_role;
