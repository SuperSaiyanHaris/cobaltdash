-- Raw viewer samples are scratch data: finalize_stream_sessions() folds them into
-- stream_sessions (avg, peak, hours_watched) when a session closes, and nothing
-- on the site reads them. Keep the last 7 days plus every session that is still
-- open (an open one is finalized from ALL of its samples), drop the rest.

-- One-off compaction (also usable later): copies the rows to keep, truncates
-- (returns the disk space at once, unlike DELETE) and puts them back, all in one
-- transaction. Briefly blocks sample writes while it runs.
create or replace function public.compact_viewer_samples(p_keep_days integer default 7)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  kept bigint;
begin
  set local statement_timeout = '10min';
  lock table viewer_samples in access exclusive mode;
  create temp table _keep on commit drop as
    select vs.* from viewer_samples vs
    join stream_sessions ss on ss.id = vs.session_id
    where ss.ended_at is null
       or ss.started_at >= now() - make_interval(days => p_keep_days);
  truncate viewer_samples;
  insert into viewer_samples select * from _keep;
  get diagnostics kept = row_count;
  return kept;
end;
$$;

-- Nightly: samples of sessions that ended and started more than 7 days ago.
create or replace function public.purge_viewer_samples(p_keep_days integer default 7)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  set local statement_timeout = '10min';
  delete from viewer_samples vs
  using stream_sessions ss
  where ss.id = vs.session_id
    and ss.ended_at is not null
    and ss.started_at < now() - make_interval(days => p_keep_days);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.compact_viewer_samples(integer) from public, anon, authenticated;
revoke all on function public.purge_viewer_samples(integer) from public, anon, authenticated;
