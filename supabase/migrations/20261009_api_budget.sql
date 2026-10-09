-- Shared daily spend counter for paid-quota APIs (YouTube search = 100 units).
-- In-memory limits do not hold across serverless instances, so the site's
-- YouTube proxy asks this function before every search. The day follows
-- Google's quota reset (Pacific time). Service key only.
create table if not exists public.api_budget (
  day date not null,
  name text not null,
  used integer not null default 0,
  primary key (day, name)
);
alter table public.api_budget enable row level security;
revoke all on public.api_budget from anon, authenticated;

create or replace function public.spend_api_budget(p_name text, p_cost integer, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
  total integer;
begin
  insert into api_budget (day, name, used) values (d, p_name, 0)
    on conflict (day, name) do nothing;
  update api_budget set used = used + p_cost
    where day = d and name = p_name and used + p_cost <= p_cap
    returning used into total;
  return total is not null;
end;
$$;
revoke all on function public.spend_api_budget(text, integer, integer) from public, anon, authenticated;
grant execute on function public.spend_api_budget(text, integer, integer) to service_role;
