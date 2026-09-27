-- Comments on creator profiles (2026-09-27). Additive only.
-- Writes to comments and commenter profiles go through api/comments.js with
-- the service key, after moderation. Clients can only read visible comments,
-- vote, and report.

-- Public name a commenter picks before their first comment. users.display_name
-- often holds an email address, so it is never shown.
CREATE TABLE IF NOT EXISTS public.commenter_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text NOT NULL CHECK (handle ~ '^[a-z0-9_.]{3,20}$'),
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commenter_profiles_handle_key ON public.commenter_profiles (lower(handle));

CREATE TABLE IF NOT EXISTS public.creator_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.creators(id),
  -- Through commenter_profiles (which cascades from auth.users) so a read can
  -- embed the author's handle in one query.
  user_id uuid NOT NULL REFERENCES public.commenter_profiles(user_id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.creator_comments(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 500),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('visible', 'held', 'hidden', 'removed')),
  follows_creator boolean NOT NULL DEFAULT false,
  up_count integer NOT NULL DEFAULT 0,
  down_count integer NOT NULL DEFAULT 0,
  report_count integer NOT NULL DEFAULT 0,
  moderation jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creator_comments_new_idx ON public.creator_comments (creator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_comments_top_idx ON public.creator_comments (creator_id, status, ((up_count - down_count)) DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_comments_user_idx ON public.creator_comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_comments_queue_idx ON public.creator_comments (status, created_at DESC) WHERE status IN ('held', 'hidden') OR report_count > 0;

CREATE TABLE IF NOT EXISTS public.comment_votes (
  comment_id uuid NOT NULL REFERENCES public.creator_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.comment_reports (
  comment_id uuid NOT NULL REFERENCES public.creator_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('harmful', 'harassment', 'spam')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

-- Vote counts stay exact: every insert, flip and removal adjusts the totals.
CREATE OR REPLACE FUNCTION public.comment_votes_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE creator_comments SET
      up_count = up_count - (OLD.value = 1)::int,
      down_count = down_count - (OLD.value = -1)::int
    WHERE id = OLD.comment_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE creator_comments SET
      up_count = up_count + (NEW.value = 1)::int,
      down_count = down_count + (NEW.value = -1)::int
    WHERE id = NEW.comment_id;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER comment_votes_count AFTER INSERT OR UPDATE OR DELETE ON public.comment_votes
  FOR EACH ROW EXECUTE FUNCTION public.comment_votes_count();

-- Three reports hide a comment until an admin looks at it.
CREATE OR REPLACE FUNCTION public.comment_reports_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE creator_comments SET
    report_count = report_count + 1,
    status = CASE WHEN report_count + 1 >= 3 AND status = 'visible' THEN 'hidden' ELSE status END
  WHERE id = NEW.comment_id;
  RETURN NULL;
END $$;
CREATE TRIGGER comment_reports_count AFTER INSERT ON public.comment_reports
  FOR EACH ROW EXECUTE FUNCTION public.comment_reports_count();

-- Row level security
ALTER TABLE public.commenter_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creator_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_public_read ON public.commenter_profiles FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY comments_read_visible ON public.creator_comments FOR SELECT TO anon, authenticated
  USING (status = 'visible' OR (status = 'held' AND user_id = auth.uid()));

CREATE POLICY votes_own ON public.comment_votes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY reports_insert_own ON public.comment_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Only the columns clients need. moderation (the classifier's verdict) and
-- report_count stay server-side.
REVOKE ALL ON public.creator_comments FROM anon, authenticated;
GRANT SELECT (id, creator_id, user_id, parent_id, body, status, follows_creator, up_count, down_count, created_at)
  ON public.creator_comments TO anon, authenticated;
REVOKE ALL ON public.commenter_profiles FROM anon, authenticated;
GRANT SELECT (user_id, handle, avatar_url) ON public.commenter_profiles TO anon, authenticated;
REVOKE ALL ON public.comment_votes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comment_votes TO authenticated;
REVOKE ALL ON public.comment_reports FROM anon;
GRANT INSERT ON public.comment_reports TO authenticated;
