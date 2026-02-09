-- TI-212: Disputes v1 patch (RLS deny-all)
--
-- Reassert deny-all policy for disputes after schema upgrades.

create extension if not exists "pgcrypto";

alter table public.disputes enable row level security;
alter table public.disputes force row level security;

drop policy if exists deny_all_anon_authenticated on public.disputes;
create policy deny_all_anon_authenticated
on public.disputes
for all
to anon, authenticated
using (false)
with check (false);
