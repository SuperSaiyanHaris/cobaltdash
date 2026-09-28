-- ShinyPass track drops (2026-09-27, from review). Additive only.

-- 1. One cosmetic of each kind per user. Showcase slots and shiny variants
--    stack, so they're left out. (user_items was empty when this was added.)
CREATE UNIQUE INDEX IF NOT EXISTS user_items_one_each
  ON public.user_items (user_id, kind, item_key)
  WHERE kind NOT IN ('showcase', 'shiny');

-- 2. Grant every due track drop in one atomic call. p_drops is a JSON array
--    of {level, kind, key}. Each level pays once per season (marker in
--    xp_events: action 'drop', ref 'season:level'); the marker and the reward
--    commit together, so a failure can never eat a reward. Returns an array
--    of {level, result} where result is item | dupe | freeze | boost.
CREATE OR REPLACE FUNCTION public.grant_track_drops(p_user uuid, p_season integer, p_day date, p_drops jsonb, p_dupe_xp integer, p_boost_days integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d jsonb; lvl integer; k text; key text; res text; out jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || 'drop', 0));
  PERFORM ensure_season(p_user);
  FOR d IN SELECT * FROM jsonb_array_elements(p_drops) LOOP
    lvl := (d->>'level')::integer; k := d->>'kind'; key := d->>'key';
    INSERT INTO xp_events (user_id, action, ref, day, xp, season)
      VALUES (p_user, 'drop', p_season || ':' || lvl, p_day, 0, p_season)
      ON CONFLICT (user_id, action, ref) DO NOTHING;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF k = 'freeze' THEN
      UPDATE user_progress SET streak_freezes = streak_freezes + 1, updated_at = now() WHERE user_id = p_user;
      res := 'freeze';
    ELSIF k = 'boost' THEN
      UPDATE user_progress SET boost_until = greatest(coalesce(boost_until, now()), now()) + make_interval(days => p_boost_days), updated_at = now() WHERE user_id = p_user;
      res := 'boost';
    ELSE
      INSERT INTO user_items (user_id, kind, item_key, source_level) VALUES (p_user, k, key, lvl)
        ON CONFLICT (user_id, kind, item_key) WHERE kind NOT IN ('showcase', 'shiny') DO NOTHING;
      IF FOUND THEN
        res := 'item';
      ELSE
        -- Already owned: a small fixed XP bonus instead.
        INSERT INTO xp_events (user_id, action, ref, day, xp, season)
          VALUES (p_user, 'drop-dupe', p_season || ':' || lvl, p_day, p_dupe_xp, p_season)
          ON CONFLICT (user_id, action, ref) DO NOTHING;
        UPDATE user_progress SET xp = xp + p_dupe_xp, updated_at = now() WHERE user_id = p_user;
        res := 'dupe';
      END IF;
    END IF;
    out := out || jsonb_build_object('level', lvl, 'result', res);
  END LOOP;
  RETURN out;
END $$;

-- 3. The XP Boost applies to earned XP only (not packs, drops or duplicate
--    bonuses), and now also to upvote XP.
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
  IF p_xp > 0 AND p_action NOT IN ('pack', 'drop', 'drop-dupe') AND EXISTS (SELECT 1 FROM user_progress WHERE user_id = p_user AND boost_until > now()) THEN
    amt := round(p_xp * 1.25);
  END IF;
  INSERT INTO xp_events (user_id, action, ref, day, xp, season) VALUES (p_user, p_action, p_ref, p_day, amt, s)
  ON CONFLICT (user_id, action, ref) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE user_progress SET xp = xp + amt, updated_at = now() WHERE user_id = p_user RETURNING xp INTO new_xp;
  RETURN new_xp;
END $$;

CREATE OR REPLACE FUNCTION public.credit_upvotes(p_user uuid, p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total integer; credited integer; today integer; n integer; s integer; amt integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || 'upvote', 0));
  s := ensure_season(p_user);
  total := valid_upvotes(p_user);
  SELECT upvotes_credited INTO credited FROM user_progress WHERE user_id = p_user;
  IF credited IS NULL THEN RETURN 0; END IF;
  -- The daily cap counts upvotes (10), not XP, so a boost doesn't eat it.
  -- ref is 'day:credited:n'; older rows ('day:credited') count xp / 3.
  SELECT coalesce(sum(coalesce(nullif(split_part(ref, ':', 3), '')::integer, xp / 3)), 0) INTO today
  FROM xp_events WHERE user_id = p_user AND action = 'upvote' AND day = p_day;
  n := least(total - credited, 10 - today);
  IF n <= 0 THEN RETURN 0; END IF;
  amt := n * 3;
  IF EXISTS (SELECT 1 FROM user_progress WHERE user_id = p_user AND boost_until > now()) THEN amt := round(amt * 1.25); END IF;
  INSERT INTO xp_events (user_id, action, ref, day, xp, season) VALUES (p_user, 'upvote', p_day || ':' || (credited + n) || ':' || n, p_day, amt, s);
  UPDATE user_progress SET xp = xp + amt, upvotes_credited = credited + n, updated_at = now() WHERE user_id = p_user;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.grant_track_drops(uuid, integer, date, jsonb, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_xp(uuid, text, text, date, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_upvotes(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_track_drops(uuid, integer, date, jsonb, integer, integer), public.grant_xp(uuid, text, text, date, integer, integer), public.credit_upvotes(uuid, date) TO service_role;
