-- Disk IO budget fixes (Supabase warned the project was depleting it, 2026-10-24).
-- Applied 2026-10-25. Nothing here removes creator data or history.

-- 1. finalize_abandoned_stream_sessions looked up each open session's last
--    sample with only a session_id index, reading every sample of every open
--    session (~367 MB of disk per hourly run, 18s). With recorded_at in the
--    index it is one index probe per session (1.2s, ~20 MB cold). The old
--    session_id-only index is covered by the new one and was dropped.
--    (Run these two statements one at a time, outside a transaction.)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_viewer_samples_session_time ON public.viewer_samples (session_id, recorded_at);
-- DROP INDEX CONCURRENTLY IF EXISTS public.idx_viewer_samples_session;

-- 2. net._http_response (pg_net's 6-hour reply log, ~360 rows) had bloated to
--    101 MB, and pg_net's cleanup scanned all of it every few minutes
--    (~0.5 GB of reads an hour). Rewritten in place, every row kept:
-- VACUUM FULL net._http_response;

-- 3. Rankings refresh runs when data lands instead of on a fixed clock.
--    The hourly fast-platform job recomputed the same rankings ~20 times a
--    day (data changes only after collections) and each run read ~110 MB.
--    Writers queue the platforms they changed; a cheap 10-minute job drains
--    the queue. A 6-hourly safety net queues every platform.

CREATE TABLE IF NOT EXISTS public.rankings_refresh_queue (
  platform text PRIMARY KEY,
  requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rankings_refresh_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rankings_refresh_queue FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_rankings_refresh(p_platforms text[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO rankings_refresh_queue (platform, requested_at)
  SELECT DISTINCT p, now() FROM unnest(p_platforms) p
  WHERE p IN ('youtube','tiktok','twitch','kick','bluesky','music','mastodon','substack')
  ON CONFLICT (platform) DO UPDATE SET requested_at = excluded.requested_at;
$$;
REVOKE EXECUTE ON FUNCTION public.request_rankings_refresh(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_rankings_refresh(text[]) TO service_role;

-- Drains the queue, one platform per transaction. A request that arrives
-- while its platform is refreshing keeps its newer requested_at and is
-- picked up next run, so nothing is lost.
CREATE OR REPLACE PROCEDURE public.refresh_rankings_cache_queued()
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT platform, requested_at FROM public.rankings_refresh_queue ORDER BY requested_at LOOP
    PERFORM public.refresh_rankings_cache_platform(r.platform);
    DELETE FROM public.rankings_refresh_queue WHERE platform = r.platform AND requested_at = r.requested_at;
    COMMIT;
  END LOOP;
END;
$$;

-- Rumble was dropped 2026-09-04; its cache rows no longer need refreshing.
CREATE OR REPLACE PROCEDURE public.refresh_rankings_cache_fast_platforms()
 LANGUAGE plpgsql
AS $procedure$
DECLARE
  p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['mastodon','bluesky','kick','music','tiktok','substack']
  LOOP
    PERFORM public.refresh_rankings_cache_platform(p);
    COMMIT;
  END LOOP;
END;
$procedure$;

-- 4. refresh_rankings_cache_platform gets 32 MB of sort memory for its own
--    transaction (server default is 3.5 MB), so its window sorts stop
--    spilling to temp files. The live body now has, next to its other
--    SET LOCAL lines:  SET LOCAL work_mem = '32MB';

SELECT cron.unschedule('refresh-rankings-fast-platforms');
SELECT cron.unschedule('refresh-rankings-heavy-platforms');
SELECT cron.schedule('refresh-rankings-queued', '*/10 * * * *', $$ CALL public.refresh_rankings_cache_queued() $$);
SELECT cron.schedule('refresh-rankings-safety-net', '37 */6 * * *',
  $$ SELECT public.request_rankings_refresh(ARRAY['youtube','tiktok','twitch','kick','bluesky','music','mastodon','substack']) $$);

-- 5. (2026-10-28) Autovacuum never visits net._http_response (last run Aug 25),
--    so it re-bloated 456 KB -> 6.5 MB in 3.5 days. A daily plain VACUUM lets
--    pg_net reuse the space instead of growing the file. Keeps every row.
SELECT cron.schedule('vacuum-http-response', '25 4 * * *', 'VACUUM net._http_response');
