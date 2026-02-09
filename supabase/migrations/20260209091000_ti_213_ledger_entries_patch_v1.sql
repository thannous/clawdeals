-- TI-213: Ledger entries v1 patch (constraint + RLS)
--
-- Ensures the unique constraint has a stable name for ON CONFLICT usage
-- and reasserts deny-all RLS policy for v0 posture.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1
      from pg_constraint c
     where c.conname = 'ledger_entries_one_per_type_unique'
       and c.conrelid = 'public.ledger_entries'::regclass
  ) then
    alter table public.ledger_entries
      add constraint ledger_entries_one_per_type_unique unique (escrow_id, type);
  end if;
end $$;

alter table public.ledger_entries enable row level security;
alter table public.ledger_entries force row level security;

drop policy if exists deny_all_anon_authenticated on public.ledger_entries;
create policy deny_all_anon_authenticated
on public.ledger_entries
for all
to anon, authenticated
using (false)
with check (false);
