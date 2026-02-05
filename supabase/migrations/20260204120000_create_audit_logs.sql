create extension if not exists "pgcrypto";

create table if not exists public.audit_logs (
  id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  actor jsonb not null default '{}'::jsonb,
  auth jsonb not null default '{}'::jsonb,
  request jsonb not null default '{}'::jsonb,
  action jsonb not null default '{}'::jsonb,
  security jsonb not null default '{}'::jsonb,
  policy jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  rate_limit jsonb,
  idempotency jsonb,
  outcome text not null,
  request_id text,
  ip_full inet,
  user_agent text,
  payload_fingerprint text not null,
  redacted boolean not null default false,
  hash_algo text not null default 'hmac-sha256',
  primary key (id, occurred_at)
) partition by range (occurred_at);

do $$
declare
  start_date date := date_trunc('month', now())::date;
  next_date date := (start_date + interval '1 month')::date;
  next_next date := (start_date + interval '2 month')::date;
begin
  execute format(
    'create table if not exists public.audit_logs_%s partition of public.audit_logs for values from (%L) to (%L);',
    to_char(start_date, 'YYYY_MM'),
    start_date,
    next_date
  );
  execute format(
    'create table if not exists public.audit_logs_%s partition of public.audit_logs for values from (%L) to (%L);',
    to_char(next_date, 'YYYY_MM'),
    next_date,
    next_next
  );
end $$;

create index if not exists audit_logs_occurred_at_idx on public.audit_logs (occurred_at);
create index if not exists audit_logs_outcome_idx on public.audit_logs (outcome);
create index if not exists audit_logs_request_id_idx on public.audit_logs (request_id);
