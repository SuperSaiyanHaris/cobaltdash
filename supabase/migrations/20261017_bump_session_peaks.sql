-- One request raises many sessions' peak_viewers (the stream monitors and the
-- minute poller used to send one UPDATE per stream, ~50 a minute). Peaks only
-- go up; the final peak is still recomputed from the samples when a session ends.
create or replace function public.bump_session_peaks(p_ids uuid[], p_peaks integer[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update stream_sessions s
  set peak_viewers = v.peak
  from unnest(p_ids, p_peaks) as v(id, peak)
  where s.id = v.id
    and (s.peak_viewers is null or v.peak > s.peak_viewers);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.bump_session_peaks(uuid[], integer[]) from public, anon, authenticated;
grant execute on function public.bump_session_peaks(uuid[], integer[]) to service_role;
