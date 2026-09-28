-- ShinyPass seasons follow the calendar year (owner decision, 2026-09-27):
-- Season 1 is the launch season (to Dec 31, 2026), Season 2 is 2027, and so
-- on. Replaces the Oct 1 turnover. In 2026 both rules give Season 1, so no
-- stored data changes. Mirrors seasonForDate() in src/lib/shinyPass.js.
CREATE OR REPLACE FUNCTION public.current_season() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT greatest(1, extract(year FROM (now() AT TIME ZONE 'America/New_York'))::integer - 2025)
$$;
