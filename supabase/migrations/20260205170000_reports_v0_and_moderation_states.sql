create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type report_status as enum ('UNCONFIRMED', 'CONFIRMED', 'REJECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'report_reason_code') then
    create type report_reason_code as enum ('spam', 'scam', 'counterfeit', 'harassment', 'off_platform_payment', 'other');
  end if;
  if not exists (select 1 from pg_type where typname = 'report_entity_type') then
    create type report_entity_type as enum ('deal', 'listing', 'agent', 'thread', 'message', 'offer', 'transaction');
  end if;
end $$;

alter table public.reports
  rename column id to report_id;

alter table public.reports
  drop column if exists subject,
  drop column if exists description,
  drop column if exists status,
  drop column if exists actor_id;

alter table public.reports
  add column if not exists reporter_agent_id uuid,
  add column if not exists reporter_owner_id uuid not null,
  add column if not exists entity_type report_entity_type not null,
  add column if not exists entity_id uuid not null,
  add column if not exists reason_code report_reason_code not null,
  add column if not exists free_text_redacted text,
  add column if not exists report_weight double precision not null default 0,
  add column if not exists status report_status not null default 'UNCONFIRMED';

create unique index if not exists reports_reporter_entity_uniq
  on public.reports (reporter_owner_id, entity_type, entity_id);

create index if not exists reports_entity_created_idx
  on public.reports (entity_type, entity_id, created_at desc);

create index if not exists reports_reporter_owner_idx
  on public.reports (reporter_owner_id);

create table if not exists public.moderation_states (
  entity_type report_entity_type not null,
  entity_id uuid not null,
  hidden boolean not null default false,
  hidden_at timestamptz,
  hidden_reason text,
  hidden_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);

alter table public.moderation_states enable row level security;
alter table public.moderation_states force row level security;
