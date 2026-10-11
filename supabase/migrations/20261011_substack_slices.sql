-- The Substack collector outgrew the edge function's CPU budget when it ran the
-- whole leaderboard sweep in one invocation (killed ~3 minutes in, so only part
-- of the pubs got a reading: 2,327, 2,050, then 1,521 of ~2,560 on Oct 9-11).
-- It now runs in three slices (?part=1..3&parts=3), ten minutes apart, at
-- 08:00 UTC with a second attempt at 11:00 UTC. The commands are copied from the
-- old jobs so the cron key never leaves the database.
do $$
declare
  cmd text;
  i int;
begin
  select command into cmd from cron.job where jobname = 'collect-substack-daily';
  if cmd is null then raise exception 'collect-substack-daily not found'; end if;
  for i in 1..3 loop
    perform cron.schedule('collect-substack-a' || i, ((i - 1) * 10) || ' 8 * * *',
      replace(cmd, '/functions/v1/collect-substack', '/functions/v1/collect-substack?part=' || i || '&parts=3'));
    perform cron.schedule('collect-substack-b' || i, ((i - 1) * 10) || ' 11 * * *',
      replace(cmd, '/functions/v1/collect-substack', '/functions/v1/collect-substack?part=' || i || '&parts=3'));
  end loop;
  perform cron.unschedule('collect-substack-daily');
  perform cron.unschedule('collect-substack-retry');
end $$;
