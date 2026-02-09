-- TI-212: Disputes v0 (refund/dispute) - schema upgrade
--
-- Upgrades the `disputes` anchor table introduced in TI-214 to include
-- opener metadata, resolution, and typed statuses.
-- v0 posture: direct PostgREST access via `anon`/`authenticated` is denied.

create extension if not exists "pgcrypto";

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dispute_opened_by') then
    create type dispute_opened_by as enum ('BUYER', 'SELLER', 'OPS', 'SYSTEM');
  end if;

  if not exists (select 1 from pg_type where typname = 'dispute_status') then
    create type dispute_status as enum ('OPEN', 'UNDER_REVIEW', 'RESOLVED');
  end if;

  if not exists (select 1 from pg_type where typname = 'dispute_resolution') then
    create type dispute_resolution as enum ('REFUND', 'RELEASE', 'SPLIT', 'CANCELLED', 'NONE_YET');
  end if;
end $$;

-- Add columns (keep existing PK/FK/unique constraints).
alter table public.disputes
  add column if not exists opened_by dispute_opened_by not null default 'SYSTEM',
  add column if not exists reason_code text not null default 'other',
  add column if not exists resolution dispute_resolution not null default 'NONE_YET',
  add column if not exists opened_notes_redacted text,
  add column if not exists resolution_notes_redacted text,
  add column if not exists opened_at timestamptz not null default now(),
  add column if not exists resolved_at timestamptz;

-- Normalize existing status values for enum conversion.
update public.disputes
   set status = upper(status)
 where status is not null;

update public.disputes
   set status = 'OPEN'
 where status is null or status not in ('OPEN', 'UNDER_REVIEW', 'RESOLVED');

-- Convert status text -> dispute_status enum.
alter table public.disputes
  alter column status drop default;

alter table public.disputes
  alter column status type dispute_status
  using (status::dispute_status);

alter table public.disputes
  alter column status set default 'OPEN'::dispute_status;

-- Enforce reason_code allowlist.
alter table public.disputes
  drop constraint if exists disputes_reason_code_check;

alter table public.disputes
  add constraint disputes_reason_code_check check (
    reason_code in ('item_not_received', 'not_as_described', 'fraud_suspected', 'other')
  );

