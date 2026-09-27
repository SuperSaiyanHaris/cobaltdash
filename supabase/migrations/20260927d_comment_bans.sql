-- Comment bans (admin "Remove and ban"). A banned account can't comment,
-- reply, vote or report. Additive: new columns, and the existing vote/report
-- policies get the extra "not banned" condition via ALTER POLICY.
ALTER TABLE public.commenter_profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;

CREATE OR REPLACE FUNCTION public.comment_user_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM commenter_profiles WHERE user_id = auth.uid() AND banned_at IS NOT NULL)
$$;

ALTER POLICY votes_own ON public.comment_votes
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.comment_user_ok());
ALTER POLICY reports_insert_own ON public.comment_reports
  WITH CHECK (user_id = auth.uid() AND public.comment_user_ok());
