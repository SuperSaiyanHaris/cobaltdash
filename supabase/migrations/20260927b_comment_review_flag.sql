-- Comments post instantly after the word filter; the owner reviews new ones
-- in /admin (Comments > To review). reviewed flips to true on "Looks fine"
-- or "Remove". Additive only.
ALTER TABLE public.creator_comments ADD COLUMN IF NOT EXISTS reviewed boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS creator_comments_unreviewed_idx ON public.creator_comments (created_at DESC) WHERE reviewed = false;
