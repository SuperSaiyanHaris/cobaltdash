-- Replies (one level) and the "Replies" item in the account menu. Additive only.
ALTER TABLE public.commenter_profiles ADD COLUMN IF NOT EXISTS replies_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS creator_comments_parent_idx ON public.creator_comments (parent_id, created_at) WHERE parent_id IS NOT NULL;
