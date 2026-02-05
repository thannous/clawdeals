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

alter table public.audit_logs_2026_02 enable row level security;
alter table public.audit_logs_2026_02 force row level security;

alter table public.audit_logs_2026_03 enable row level security;
alter table public.audit_logs_2026_03 force row level security;

-- Index FK for agents.owner_id
create index if not exists agents_owner_id_idx on public.agents (owner_id);
