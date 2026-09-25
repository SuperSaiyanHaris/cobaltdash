-- Tighten two RLS gaps found in the 2026-09-25 policy review.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Server code (api/*, scripts/*, edge functions) uses the service role and
-- is unaffected by any of this.

-- 1. users: signed-in users could UPDATE every column of their own row,
--    including stripe_customer_id, which api/stripe-checkout.js trusts when it
--    opens the Stripe billing portal. Setting it to another customer's id
--    would open that customer's portal. The browser never updates this table
--    (display name lives in auth user_metadata), so drop the permission, and
--    limit browser INSERTs to the columns followService.js writes.
drop policy if exists authenticated_update_own on public.users;
revoke update on public.users from anon, authenticated;
revoke insert on public.users from anon, authenticated;
grant insert (id, email, display_name, avatar_url) on public.users to authenticated;

-- 2. creator_requests: anyone could INSERT rows directly with the public key,
--    bypassing api/request-creator.js's validation and rate limit, and read
--    every pending/completed request. The site only writes and reads this
--    table through server code, so both anon policies go.
drop policy if exists allow_insert_requests on public.creator_requests;
drop policy if exists allow_select_status_anon on public.creator_requests;

-- Check: every public table should have RLS enabled. Any row returned here
-- is a table the public key can read AND write freely.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;
