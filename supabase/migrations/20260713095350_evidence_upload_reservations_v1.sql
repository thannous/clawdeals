-- Security remediation: make evidence upload issuance and confirmation a
-- database-backed, actor-bound, quota-reserved workflow.

create table if not exists public.evidence_upload_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  evidence_pack_id uuid not null references public.evidence_packs(evidence_pack_id) on delete cascade,
  storage_bucket text not null,
  storage_key text not null,
  submitted_by public.evidence_submitted_by not null,
  issued_to_type text not null,
  issued_to_id uuid not null,
  reserved_bytes bigint not null,
  status text not null default 'PENDING',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evidence_upload_reservations_storage_object_unique unique (storage_bucket, storage_key),
  constraint evidence_upload_reservations_actor_type_check check (issued_to_type in ('agent', 'owner')),
  constraint evidence_upload_reservations_reserved_bytes_check check (
    reserved_bytes > 0 and reserved_bytes <= 50 * 1024 * 1024
  ),
  constraint evidence_upload_reservations_status_check check (
    status in ('PENDING', 'VERIFYING', 'CLEANING', 'CONFIRMED', 'REJECTED', 'EXPIRED')
  )
);

create index if not exists evidence_upload_reservations_pack_active_idx
  on public.evidence_upload_reservations (evidence_pack_id, created_at)
  where status in ('PENDING', 'VERIFYING', 'CLEANING');

create index if not exists evidence_upload_reservations_expired_idx
  on public.evidence_upload_reservations (evidence_pack_id, expires_at)
  where status in ('PENDING', 'VERIFYING', 'CLEANING');

alter table public.evidence_upload_reservations enable row level security;
alter table public.evidence_upload_reservations force row level security;

drop policy if exists deny_all_anon_authenticated on public.evidence_upload_reservations;
create policy deny_all_anon_authenticated
on public.evidence_upload_reservations
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table public.evidence_upload_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.evidence_upload_reservations to service_role;

-- Evidence is audit material: never discard historical rows automatically.
-- If the affected deployment already contains replayed storage objects, stop
-- the migration so operators can preserve and investigate them explicitly.
do $$
begin
  if exists (
    select 1
    from public.evidence_items
    group by storage_bucket, storage_key
    having count(*) > 1
  ) then
    raise exception 'EVIDENCE_ITEMS_DUPLICATE_STORAGE_OBJECTS_REQUIRE_REVIEW';
  end if;
end;
$$;

create unique index if not exists evidence_items_storage_object_unique_idx
  on public.evidence_items (storage_bucket, storage_key);

-- Supabase signed upload URLs allow two hours of upload time. Keep the bucket
-- itself bounded even when a client never calls the confirmation endpoint.
update storage.buckets
set
  public = false,
  file_size_limit = 50 * 1024 * 1024,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]::text[]
where id = 'evidence';

create or replace function public.reserve_evidence_upload_v1(
  p_evidence_pack_id uuid,
  p_storage_bucket text,
  p_storage_key text,
  p_submitted_by public.evidence_submitted_by,
  p_issued_to_type text,
  p_issued_to_id uuid,
  p_expires_at timestamptz
)
returns public.evidence_upload_reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pack public.evidence_packs%rowtype;
  v_committed_files bigint;
  v_committed_bytes bigint;
  v_active_files bigint;
  v_active_bytes bigint;
  v_remaining_bytes bigint;
  v_reservation public.evidence_upload_reservations%rowtype;
begin
  select *
  into v_pack
  from public.evidence_packs
  where evidence_pack_id = p_evidence_pack_id
  for update;

  if not found then
    raise exception 'EVIDENCE_PACK_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_storage_bucket <> 'evidence'
     or p_storage_key !~ ('^disputes/' || v_pack.dispute_id::text || '/[0-9a-f-]+$') then
    raise exception 'EVIDENCE_UPLOAD_KEY_INVALID' using errcode = 'P0001';
  end if;

  if p_issued_to_type not in ('agent', 'owner') or p_issued_to_id is null then
    raise exception 'EVIDENCE_UPLOAD_ACTOR_INVALID' using errcode = 'P0001';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '3 hours' then
    raise exception 'EVIDENCE_UPLOAD_EXPIRY_INVALID' using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(bytes), 0)
  into v_committed_files, v_committed_bytes
  from public.evidence_items
  where evidence_pack_id = p_evidence_pack_id;

  select count(*), coalesce(sum(reserved_bytes), 0)
  into v_active_files, v_active_bytes
  from public.evidence_upload_reservations
  where evidence_pack_id = p_evidence_pack_id
    and status in ('PENDING', 'VERIFYING', 'CLEANING');

  v_remaining_bytes := 50 * 1024 * 1024 - v_committed_bytes - v_active_bytes;

  if v_committed_files + v_active_files >= 10 or v_remaining_bytes <= 0 then
    raise exception 'EVIDENCE_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  -- Reserving all remaining bytes intentionally permits only one in-flight
  -- signed upload per dispute. This preserves the existing body-less init API
  -- while preventing unconfirmed uploads from escaping aggregate accounting.
  insert into public.evidence_upload_reservations (
    evidence_pack_id,
    storage_bucket,
    storage_key,
    submitted_by,
    issued_to_type,
    issued_to_id,
    reserved_bytes,
    expires_at
  )
  values (
    p_evidence_pack_id,
    p_storage_bucket,
    p_storage_key,
    p_submitted_by,
    p_issued_to_type,
    p_issued_to_id,
    v_remaining_bytes,
    p_expires_at
  )
  returning * into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.begin_evidence_upload_confirmation_v1(
  p_evidence_pack_id uuid,
  p_storage_bucket text,
  p_storage_key text,
  p_submitted_by public.evidence_submitted_by,
  p_issued_to_type text,
  p_issued_to_id uuid,
  p_bytes bigint
)
returns public.evidence_upload_reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_reservation public.evidence_upload_reservations%rowtype;
begin
  perform 1
  from public.evidence_packs
  where evidence_pack_id = p_evidence_pack_id
  for update;

  if not found then
    raise exception 'EVIDENCE_PACK_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
  into v_reservation
  from public.evidence_upload_reservations
  where evidence_pack_id = p_evidence_pack_id
    and storage_bucket = p_storage_bucket
    and storage_key = p_storage_key
  for update;

  if not found
     or v_reservation.issued_to_type <> p_issued_to_type
     or v_reservation.issued_to_id <> p_issued_to_id
     or v_reservation.submitted_by <> p_submitted_by then
    raise exception 'EVIDENCE_UPLOAD_NOT_ISSUED_TO_ACTOR' using errcode = 'P0001';
  end if;

  if v_reservation.status <> 'PENDING' then
    if v_reservation.status in ('VERIFYING', 'CONFIRMED') then
      raise exception 'EVIDENCE_ALREADY_CONFIRMED' using errcode = 'P0001';
    end if;
    raise exception 'EVIDENCE_UPLOAD_EXPIRED' using errcode = 'P0001';
  end if;

  if v_reservation.expires_at <= now() then
    raise exception 'EVIDENCE_UPLOAD_EXPIRED' using errcode = 'P0001';
  end if;

  if p_bytes <= 0 or p_bytes > v_reservation.reserved_bytes then
    raise exception 'EVIDENCE_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  update public.evidence_upload_reservations
  set status = 'VERIFYING', updated_at = now()
  where reservation_id = v_reservation.reservation_id
  returning * into v_reservation;

  return v_reservation;
end;
$$;

create or replace function public.finalize_evidence_upload_v1(
  p_reservation_id uuid,
  p_issued_to_type text,
  p_issued_to_id uuid,
  p_content_type text,
  p_bytes bigint,
  p_sha256 text
)
returns public.evidence_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_evidence_pack_id uuid;
  v_reservation public.evidence_upload_reservations%rowtype;
  v_item public.evidence_items%rowtype;
begin
  select evidence_pack_id
  into v_evidence_pack_id
  from public.evidence_upload_reservations
  where reservation_id = p_reservation_id;

  if not found then
    raise exception 'EVIDENCE_CONFIRMATION_INVALID' using errcode = 'P0001';
  end if;

  -- Match reserve/begin lock order: stable pack row first, reservation second.
  perform 1
  from public.evidence_packs
  where evidence_pack_id = v_evidence_pack_id
  for update;

  select *
  into v_reservation
  from public.evidence_upload_reservations
  where reservation_id = p_reservation_id
  for update;

  if not found
     or v_reservation.status <> 'VERIFYING'
     or v_reservation.issued_to_type <> p_issued_to_type
     or v_reservation.issued_to_id <> p_issued_to_id then
    raise exception 'EVIDENCE_CONFIRMATION_INVALID' using errcode = 'P0001';
  end if;

  if p_bytes <= 0 or p_bytes > v_reservation.reserved_bytes then
    raise exception 'EVIDENCE_LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;

  insert into public.evidence_items (
    evidence_pack_id,
    submitted_by,
    storage_bucket,
    storage_key,
    content_type,
    bytes,
    sha256
  )
  values (
    v_reservation.evidence_pack_id,
    v_reservation.submitted_by,
    v_reservation.storage_bucket,
    v_reservation.storage_key,
    p_content_type,
    p_bytes,
    p_sha256
  )
  returning * into v_item;

  update public.evidence_upload_reservations
  set status = 'CONFIRMED', updated_at = now()
  where reservation_id = p_reservation_id;

  return v_item;
end;
$$;

create or replace function public.reject_evidence_upload_v1(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.evidence_upload_reservations
  set status = 'REJECTED', updated_at = now()
  where reservation_id = p_reservation_id
    and status in ('PENDING', 'VERIFYING');
  return found;
end;
$$;

create or replace function public.claim_expired_evidence_uploads_v1(
  p_evidence_pack_id uuid,
  p_limit integer default 10
)
returns setof public.evidence_upload_reservations
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select reservation_id
    from public.evidence_upload_reservations
    where evidence_pack_id = p_evidence_pack_id
      and (
        (status in ('PENDING', 'CLEANING') and expires_at <= now())
        or (
          status = 'VERIFYING'
          and expires_at <= now()
          and updated_at <= now() - interval '15 minutes'
        )
      )
    order by created_at asc, reservation_id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.evidence_upload_reservations reservation
  set status = 'CLEANING', updated_at = now()
  from claimed
  where reservation.reservation_id = claimed.reservation_id
  returning reservation.*;
end;
$$;

create or replace function public.finish_evidence_upload_cleanup_v1(
  p_reservation_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.evidence_upload_reservations
  set status = 'EXPIRED', updated_at = now()
  where reservation_id = p_reservation_id
    and status = 'CLEANING';
  return found;
end;
$$;

revoke all on function public.reserve_evidence_upload_v1(uuid, text, text, public.evidence_submitted_by, text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.begin_evidence_upload_confirmation_v1(uuid, text, text, public.evidence_submitted_by, text, uuid, bigint) from public, anon, authenticated;
revoke all on function public.finalize_evidence_upload_v1(uuid, text, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.reject_evidence_upload_v1(uuid) from public, anon, authenticated;
revoke all on function public.claim_expired_evidence_uploads_v1(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_evidence_upload_cleanup_v1(uuid) from public, anon, authenticated;

grant execute on function public.reserve_evidence_upload_v1(uuid, text, text, public.evidence_submitted_by, text, uuid, timestamptz) to service_role;
grant execute on function public.begin_evidence_upload_confirmation_v1(uuid, text, text, public.evidence_submitted_by, text, uuid, bigint) to service_role;
grant execute on function public.finalize_evidence_upload_v1(uuid, text, uuid, text, bigint, text) to service_role;
grant execute on function public.reject_evidence_upload_v1(uuid) to service_role;
grant execute on function public.claim_expired_evidence_uploads_v1(uuid, integer) to service_role;
grant execute on function public.finish_evidence_upload_cleanup_v1(uuid) to service_role;
