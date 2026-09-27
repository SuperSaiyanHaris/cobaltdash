-- ShinyPass helpers (2026-09-27). Called only by the API with the service
-- key. Grants are atomic and idempotent; nothing is ever deleted: a revoked
-- grant keeps its row (so it still counts toward the daily cap and can't be
-- farmed by posting and deleting) and only its XP is taken back.

ALTER TABLE public.xp_events ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- Grant XP once per (user, action, ref), at most p_cap grants of this action
-- per day (NULL = no cap). Returns the new XP total, or NULL if nothing was
-- granted.
CREATE OR REPLACE FUNCTION public.grant_xp(p_user uuid, p_action text, p_ref text, p_day date, p_xp integer, p_cap integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c integer; new_xp integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || p_action, 0));
  IF p_cap IS NOT NULL THEN
    SELECT count(*) INTO c FROM xp_events WHERE user_id = p_user AND action = p_action AND day = p_day;
    IF c >= p_cap THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO xp_events (user_id, action, ref, day, xp) VALUES (p_user, p_action, p_ref, p_day, p_xp)
  ON CONFLICT (user_id, action, ref) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO user_progress (user_id) VALUES (p_user) ON CONFLICT DO NOTHING;
  UPDATE user_progress SET xp = xp + p_xp, updated_at = now() WHERE user_id = p_user RETURNING xp INTO new_xp;
  RETURN new_xp;
END $$;

-- Take back a grant (e.g. a removed comment). Returns XP removed (0 if none).
CREATE OR REPLACE FUNCTION public.revoke_xp(p_user uuid, p_action text, p_ref text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE amt integer;
BEGIN
  UPDATE xp_events SET revoked_at = now()
  WHERE user_id = p_user AND action = p_action AND ref = p_ref AND revoked_at IS NULL
  RETURNING xp INTO amt;
  IF amt IS NULL OR amt = 0 THEN RETURN 0; END IF;
  UPDATE user_progress SET xp = greatest(0, xp - amt), updated_at = now() WHERE user_id = p_user;
  RETURN amt;
END $$;

-- Upvotes on your visible comments from other accounts at least 3 days old.
CREATE OR REPLACE FUNCTION public.valid_upvotes(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer
  FROM comment_votes v
  JOIN creator_comments cc ON cc.id = v.comment_id
  JOIN auth.users voter ON voter.id = v.user_id
  WHERE cc.user_id = p_user AND cc.status = 'visible' AND v.value = 1
    AND v.user_id <> p_user AND voter.created_at < now() - interval '3 days'
$$;

-- Credit new upvotes (3 XP each, at most 10 a day; the rest carry over to
-- later days). Returns the number credited.
CREATE OR REPLACE FUNCTION public.credit_upvotes(p_user uuid, p_day date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total integer; credited integer; today integer; n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text || 'upvote', 0));
  total := valid_upvotes(p_user);
  SELECT upvotes_credited INTO credited FROM user_progress WHERE user_id = p_user;
  IF credited IS NULL THEN RETURN 0; END IF;
  SELECT coalesce(sum(xp), 0) / 3 INTO today FROM xp_events WHERE user_id = p_user AND action = 'upvote' AND day = p_day;
  n := least(total - credited, 10 - today);
  IF n <= 0 THEN RETURN 0; END IF;
  INSERT INTO xp_events (user_id, action, ref, day, xp) VALUES (p_user, 'upvote', p_day || ':' || (credited + n), p_day, n * 3);
  UPDATE user_progress SET xp = xp + n * 3, upvotes_credited = credited + n, updated_at = now() WHERE user_id = p_user;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.grant_xp(uuid, text, text, date, integer, integer) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.revoke_xp(uuid, text, text) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.valid_upvotes(uuid) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.credit_upvotes(uuid, date) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.grant_xp(uuid, text, text, date, integer, integer), public.revoke_xp(uuid, text, text), public.valid_upvotes(uuid), public.credit_upvotes(uuid, date), public.award_scout_badges() TO service_role;
