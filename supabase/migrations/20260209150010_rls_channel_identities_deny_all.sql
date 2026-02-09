alter table public.channel_identities enable row level security;

drop policy if exists deny_all_anon_authenticated on public.channel_identities;
create policy deny_all_anon_authenticated
on public.channel_identities
for all
to anon, authenticated
using (false)
with check (false);

