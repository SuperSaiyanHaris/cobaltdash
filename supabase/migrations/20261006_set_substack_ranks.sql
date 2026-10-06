-- One call to set every Substack publication's leaderboard rank, instead of one
-- request per creator (that loop pushed collect-substack past its CPU budget,
-- 2026-10-06). Service role only.
CREATE OR REPLACE FUNCTION public.set_substack_ranks(p_ranks jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE creators c SET leaderboard_rank = v.leaderboard_rank
  FROM jsonb_to_recordset(p_ranks) AS v(id uuid, leaderboard_rank integer)
  WHERE c.id = v.id AND c.platform = 'substack';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.set_substack_ranks(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_substack_ranks(jsonb) TO service_role;
