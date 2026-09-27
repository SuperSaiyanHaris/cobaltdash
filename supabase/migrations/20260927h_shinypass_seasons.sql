-- ShinyPass seasons (2026-09-27, owner decision): the pass resets every
-- year. Seasons turn over on Oct 1 (America/New_York); Season 1 runs from
-- launch to Sep 30, 2027. Levels, XP and packs reset each season; badges,
-- cosmetics, streaks and vouchers are kept. Additive only: nothing is
-- dropped or deleted (the old pack_openings is renamed aside, it was empty).

CREATE OR REPLACE FUNCTION public.current_season() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT greatest(1, extract(year FROM ((now() AT TIME ZONE 'America/New_York')::date - interval '9 months'))::integer - 2025)
$$;

ALTER TABLE public.user_progress ADD COLUMN IF NOT EXISTS season integer NOT NULL DEFAULT 1;
ALTER TABLE public.xp_events ADD COLUMN IF NOT EXISTS season integer NOT NULL DEFAULT 1;
ALTER TABLE public.xp_events ALTER COLUMN season SET DEFAULT public.current_season();

-- Final XP of each finished season, kept for the public page.
CREATE TABLE IF NOT EXISTS public.season_results (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season integer NOT NULL,
  xp integer NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season)
);
ALTER TABLE public.season_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.season_results FROM anon, authenticated;

-- Packs can be opened once per level per season.
ALTER TABLE public.pack_openings RENAME TO pack_openings_v1;
CREATE TABLE public.pack_openings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season integer NOT NULL DEFAULT public.current_season(),
  pack_level integer NOT NULL,
  items jsonb NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season, pack_level)
);
ALTER TABLE public.pack_openings ENABLE ROW LEVEL SECURITY;
CREATE POLICY packs_own ON public.pack_openings FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.pack_openings FROM anon, authenticated;
GRANT SELECT ON public.pack_openings TO authenticated;
INSERT INTO public.pack_openings (user_id, season, pack_level, items, opened_at)
  SELECT user_id, 1, pack_level, items, opened_at FROM public.pack_openings_v1 ON CONFLICT DO NOTHING;

-- Move a user into the current season if a new one has started: bank the
-- old season's XP and start again from 0. Returns the current season.
CREATE OR REPLACE FUNCTION public.ensure_season(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur integer := current_season(); p user_progress%ROWTYPE;
BEGIN
  INSERT INTO user_progress (user_id, season) VALUES (p_user, cur) ON CONFLICT DO NOTHING;
  SELECT * INTO p FROM user_progress WHERE user_id = p_user FOR UPDATE;
  IF p.season < cur THEN
    INSERT INTO season_results (user_id, season, xp) VALUES (p_user, p.season, p.xp) ON CONFLICT DO NOTHING;
    UPDATE user_progress SET xp = 0, season = cur, updated_at = now() WHERE user_id = p_user;
  END IF;
  RETURN cur;
END $$;

-- grant_xp now rolls the season over first and tags the event with it.
CREATE OR REPLACE FUNCTION public.grant_xp(p_user uuid, p_action text, p_ref text, p_day date, p_xp integer, p_cap integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c integer; new_xp integer; s integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || p_action, 0));
  s := ensure_season(p_user);
  IF p_cap IS NOT NULL THEN
    SELECT count(*) INTO c FROM xp_events WHERE user_id = p_user AND action = p_action AND day = p_day;
    IF c >= p_cap THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO xp_events (user_id, action, ref, day, xp, season) VALUES (p_user, p_action, p_ref, p_day, p_xp, s)
  ON CONFLICT (user_id, action, ref) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE user_progress SET xp = xp + p_xp, updated_at = now() WHERE user_id = p_user RETURNING xp INTO new_xp;
  RETURN new_xp;
END $$;

-- A revoke only takes XP back from the season it was earned in.
CREATE OR REPLACE FUNCTION public.revoke_xp(p_user uuid, p_action text, p_ref text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE amt integer; ev_season integer;
BEGIN
  UPDATE xp_events SET revoked_at = now()
  WHERE user_id = p_user AND action = p_action AND ref = p_ref AND revoked_at IS NULL
  RETURNING xp, season INTO amt, ev_season;
  IF amt IS NULL OR amt = 0 THEN RETURN 0; END IF;
  UPDATE user_progress SET xp = greatest(0, xp - amt), updated_at = now() WHERE user_id = p_user AND season = ev_season;
  RETURN amt;
END $$;

CREATE OR REPLACE FUNCTION public.credit_upvotes(p_user uuid, p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total integer; credited integer; today integer; n integer; s integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || 'upvote', 0));
  s := ensure_season(p_user);
  total := valid_upvotes(p_user);
  SELECT upvotes_credited INTO credited FROM user_progress WHERE user_id = p_user;
  IF credited IS NULL THEN RETURN 0; END IF;
  SELECT coalesce(sum(xp), 0) / 3 INTO today FROM xp_events WHERE user_id = p_user AND action = 'upvote' AND day = p_day;
  n := least(total - credited, 10 - today);
  IF n <= 0 THEN RETURN 0; END IF;
  INSERT INTO xp_events (user_id, action, ref, day, xp, season) VALUES (p_user, 'upvote', p_day || ':' || (credited + n), p_day, n * 3, s);
  UPDATE user_progress SET xp = xp + n * 3, upvotes_credited = credited + n, updated_at = now() WHERE user_id = p_user;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.ensure_season(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_xp(uuid, text, text, date, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_xp(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_upvotes(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_season(uuid), public.grant_xp(uuid, text, text, date, integer, integer), public.revoke_xp(uuid, text, text), public.credit_upvotes(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_season() TO anon, authenticated, service_role;
