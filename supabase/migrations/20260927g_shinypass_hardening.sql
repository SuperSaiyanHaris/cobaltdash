-- ShinyPass hardening (2026-09-27, from peer review). Additive only.

-- 1. Functions are executable by PUBLIC by default; only the service role
--    (API, pg_cron) may run these.
REVOKE ALL ON FUNCTION public.award_scout_badges() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rank_tier(integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_scout_badges(), public.rank_tier(integer, bigint) TO service_role;

-- 2. Anyone may read only what comment chips need. Everything else (streaks,
--    last visit, freezes, showcase) is served by api/progress.js, which
--    respects is_private.
REVOKE SELECT ON public.user_progress FROM anon, authenticated;
GRANT SELECT (user_id, xp, equipped) ON public.user_progress TO anon, authenticated;

-- 3. Atomic freeze grant (packs, level drops) so concurrent writes can't
--    overwrite each other.
CREATE OR REPLACE FUNCTION public.add_streak_freezes(p_user uuid, p_n integer)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE user_progress SET streak_freezes = streak_freezes + p_n, updated_at = now()
  WHERE user_id = p_user RETURNING streak_freezes
$$;

-- 4. The daily visit as one atomic step. Dates are passed in as the site's
--    local (America/New_York) calendar days. Returns the new streak and
--    whether a freeze was used, or no row if today was already counted.
CREATE OR REPLACE FUNCTION public.record_visit(p_user uuid, p_today date, p_yesterday date, p_two_ago date)
RETURNS TABLE (streak integer, used_freeze boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p user_progress%ROWTYPE; s integer; f boolean := false;
BEGIN
  SELECT * INTO p FROM user_progress WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND OR p.last_active_date = p_today THEN RETURN; END IF;
  IF p.last_active_date = p_yesterday THEN s := p.streak + 1;
  ELSIF p.last_active_date = p_two_ago AND p.streak_freezes > 0 THEN s := p.streak + 1; f := true;
  ELSE s := 1;
  END IF;
  UPDATE user_progress SET
    streak = s,
    best_streak = greatest(best_streak, s),
    last_active_date = p_today,
    streak_freezes = streak_freezes - f::integer,
    updated_at = now()
  WHERE user_id = p_user;
  RETURN QUERY SELECT s, f;
END $$;

REVOKE ALL ON FUNCTION public.add_streak_freezes(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_visit(uuid, date, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_streak_freezes(uuid, integer), public.record_visit(uuid, date, date, date) TO service_role;

-- 5. The earlier functions were revoked from PUBLIC too; make it explicit.
REVOKE ALL ON FUNCTION public.grant_xp(uuid, text, text, date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_xp(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.valid_upvotes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_upvotes(uuid, date) FROM PUBLIC;
