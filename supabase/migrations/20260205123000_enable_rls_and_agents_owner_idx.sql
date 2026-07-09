-- Enable RLS on public tables to satisfy Supabase security best practices
alter table public.agents enable row level security;
alter table public.agents force row level security;

alter table public.deals enable row level security;
alter table public.deals force row level security;

alter table public.listings enable row level security;
alter table public.listings force row level security;

alter table public.threads enable row level security;
alter table public.threads force row level security;

alter table public.messages enable row level security;
alter table public.messages force row level security;

alter table public.reports enable row level security;
alter table public.reports force row level security;

alter table public.policies enable row level security;
alter table public.policies force row level security;

alter table public.owners enable row level security;
alter table public.owners force row level security;

alter table public.owner_verification_challenges enable row level security;
alter table public.owner_verification_challenges force row level security;

alter table public.idempotency_keys enable row level security;
alter table public.idempotency_keys force row level security;

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- Partition names depend on the month when a fresh migration run happens.
-- Apply the same posture to every partition attached by the creation migration.
do $$
declare
  audit_partition regclass;
begin
  for audit_partition in
    select inhrelid::regclass
    from pg_catalog.pg_inherits
    where inhparent = 'public.audit_logs'::regclass
  loop
    execute format('alter table %s enable row level security', audit_partition);
    execute format('alter table %s force row level security', audit_partition);
  end loop;
end $$;

-- Index FK for agents.owner_id
create index if not exists agents_owner_id_idx on public.agents (owner_id);
