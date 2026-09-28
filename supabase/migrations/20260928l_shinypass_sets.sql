-- ShinyPass pack sets (2026-09-28): two new item kinds.
--   effect: animated card effect, the bonus for completing a pack's set
--   flair:  the plate behind your name in comments (pack only)
-- Widens the kind check; no rows change. Set completion badges use keys
-- 'set_<pack key>' in user_badges (no schema change).
ALTER TABLE public.user_items
  DROP CONSTRAINT IF EXISTS user_items_kind_check1,
  ADD CONSTRAINT user_items_kind_check2 CHECK (kind IN ('frame', 'ring', 'title', 'banner', 'showcase', 'shiny', 'sticker', 'name', 'back', 'effect', 'flair'));
