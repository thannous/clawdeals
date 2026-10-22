-- Seller-provided smartphone claims. Only the server can access these tables;
-- API reads check listing visibility and writes derive the actor from auth.
create table public.smartphone_passports (
  listing_id uuid primary key references public.listings(listing_id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  battery_health_percent smallint check (battery_health_percent between 0 and 100),
  checks jsonb not null check (jsonb_typeof(checks) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.smartphone_passport_photos (
  photo_id uuid primary key,
  listing_id uuid not null references public.listings(listing_id) on delete cascade,
  owner_id uuid not null references public.owners(owner_id),
  check_id text not null check (check_id in ('battery', 'screen', 'functionality', 'locks', 'repairs_accessories')),
  storage_bucket text not null check (storage_bucket in ('evidence', 'vercel-blob-private')),
  storage_key text not null unique,
  bytes integer not null check (bytes between 1 and 2097152),
  status text not null default 'UPLOADING' check (status in ('UPLOADING', 'READY', 'DELETING')),
  attached boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smartphone_passport_photo_attachment check (not attached or status = 'READY')
);
create index smartphone_passport_photos_listing_idx on public.smartphone_passport_photos(listing_id);
create index smartphone_passport_photos_owner_idx on public.smartphone_passport_photos(owner_id);

alter table public.smartphone_passports enable row level security;
alter table public.smartphone_passports force row level security;
alter table public.smartphone_passport_photos enable row level security;
alter table public.smartphone_passport_photos force row level security;
create policy deny_client_access on public.smartphone_passports for all to anon, authenticated using (false) with check (false);
create policy deny_client_access on public.smartphone_passport_photos for all to anon, authenticated using (false) with check (false);
revoke all on public.smartphone_passports, public.smartphone_passport_photos from public, anon, authenticated;
grant select, insert, update, delete on public.smartphone_passports, public.smartphone_passport_photos to service_role;

create function public.save_smartphone_passport_v1(
  p_listing_id uuid, p_owner_id uuid, p_expected_revision integer,
  p_model text, p_battery_health_percent integer, p_checks jsonb
) returns public.smartphone_passports
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid;
  v_status text;
  v_revision integer;
  v_check_id text;
  v_check jsonb;
  v_photo_id text;
  v_photo_ids uuid[] := '{}'::uuid[];
  v_result public.smartphone_passports;
begin
  select owner_id, status::text into v_owner, v_status from public.listings where listing_id = p_listing_id for update;
  if not found or p_owner_id is null or v_owner is distinct from p_owner_id then
    raise exception 'PASSPORT_NOT_FOUND';
  end if;
  if v_status not in ('DRAFT', 'PENDING_APPROVAL', 'LIVE') then raise exception 'PASSPORT_LOCKED'; end if;
  select revision into v_revision from public.smartphone_passports where listing_id = p_listing_id;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision <> coalesce(v_revision, 0) then
    raise exception 'PASSPORT_REVISION_CONFLICT';
  end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 120
    or p_battery_health_percent not between 0 and 100
    or p_checks is null or jsonb_typeof(p_checks) <> 'object' then
    raise exception 'PASSPORT_INVALID';
  end if;
  if (select count(*) from jsonb_object_keys(p_checks)) <> 5 then raise exception 'PASSPORT_INVALID'; end if;
  foreach v_check_id in array array['battery','screen','functionality','locks','repairs_accessories'] loop
    v_check := p_checks -> v_check_id;
    if v_check is null or jsonb_typeof(v_check) <> 'object' then raise exception 'PASSPORT_INVALID'; end if;
    if (select count(*) from jsonb_object_keys(v_check)) <> 3
      or jsonb_typeof(v_check->'answer') is distinct from 'string'
      or v_check->>'answer' not in ('unknown','ok','issue','not_applicable')
      or jsonb_typeof(v_check->'notes') is distinct from 'string'
      or char_length(v_check->>'notes') > 800
      or jsonb_typeof(v_check->'photo_ids') is distinct from 'array' then
      raise exception 'PASSPORT_INVALID';
    end if;
    if v_check->>'answer' = 'issue' and char_length(btrim(v_check->>'notes')) = 0 then raise exception 'PASSPORT_INVALID'; end if;
    if v_check->>'answer' = 'not_applicable' and
      (v_check_id <> 'battery' or char_length(btrim(v_check->>'notes')) = 0 or p_battery_health_percent is not null) then
      raise exception 'PASSPORT_INVALID';
    end if;
    if jsonb_array_length(v_check->'photo_ids') > 2 then raise exception 'PASSPORT_INVALID'; end if;
    for v_photo_id in select jsonb_array_elements_text(v_check->'photo_ids') loop
      if v_photo_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'PASSPORT_PHOTO_INVALID'; end if;
      if v_photo_id::uuid = any(v_photo_ids) or not exists (
        select 1 from public.smartphone_passport_photos where photo_id = v_photo_id::uuid
          and listing_id = p_listing_id and owner_id = p_owner_id and check_id = v_check_id and status = 'READY'
      ) then raise exception 'PASSPORT_PHOTO_INVALID'; end if;
      v_photo_ids := array_append(v_photo_ids, v_photo_id::uuid);
    end loop;
  end loop;
  insert into public.smartphone_passports(listing_id, revision, model, battery_health_percent, checks)
    values(p_listing_id, 1, btrim(p_model), p_battery_health_percent, p_checks)
  on conflict(listing_id) do update set revision = public.smartphone_passports.revision + 1,
    model = excluded.model, battery_health_percent = excluded.battery_health_percent,
    checks = excluded.checks, updated_at = now()
  returning * into v_result;
  update public.smartphone_passport_photos set attached = (photo_id = any(v_photo_ids)), updated_at = now()
    where listing_id = p_listing_id and (attached or photo_id = any(v_photo_ids));
  return v_result;
end;
$$;

create function public.reserve_smartphone_passport_photo_v1(
  p_listing_id uuid, p_owner_id uuid, p_photo_id uuid, p_check_id text,
  p_storage_bucket text, p_storage_key text, p_bytes integer
) returns public.smartphone_passport_photos
language plpgsql security invoker set search_path = '' as $$
declare
  v_owner uuid;
  v_status text;
  v_count bigint;
  v_bytes bigint;
  v_result public.smartphone_passport_photos;
begin
  select owner_id, status::text into v_owner, v_status from public.listings where listing_id = p_listing_id for update;
  if not found or p_owner_id is null or v_owner is distinct from p_owner_id then raise exception 'PASSPORT_NOT_FOUND'; end if;
  if v_status not in ('DRAFT', 'PENDING_APPROVAL', 'LIVE') then raise exception 'PASSPORT_LOCKED'; end if;
  if p_storage_key is distinct from ('smartphone-passports/' || p_listing_id::text || '/' || p_photo_id::text || '.jpg') then
    raise exception 'PASSPORT_PHOTO_INVALID';
  end if;
  select count(*), coalesce(sum(bytes), 0) into v_count, v_bytes from public.smartphone_passport_photos where listing_id = p_listing_id;
  -- Include uploads in progress and failed deletions in the quota. Fifteen slots
  -- leave room to replace photos without discarding the saved passport first.
  if v_count >= 15 or v_bytes + p_bytes > 30 * 1024 * 1024 then raise exception 'PASSPORT_PHOTO_LIMIT'; end if;
  insert into public.smartphone_passport_photos(photo_id, listing_id, owner_id, check_id, storage_bucket, storage_key, bytes)
    values(p_photo_id, p_listing_id, p_owner_id, p_check_id, p_storage_bucket, p_storage_key, p_bytes)
  returning * into v_result;
  return v_result;
end;
$$;

create function public.finish_smartphone_passport_photo_v1(p_listing_id uuid, p_owner_id uuid, p_photo_id uuid)
returns public.smartphone_passport_photos
language plpgsql security invoker set search_path = '' as $$
declare v_result public.smartphone_passport_photos;
begin
  perform 1 from public.listings where listing_id = p_listing_id and owner_id = p_owner_id for update;
  if not found then raise exception 'PASSPORT_NOT_FOUND'; end if;
  if not exists (select 1 from public.listings where listing_id = p_listing_id and status::text in ('DRAFT', 'PENDING_APPROVAL', 'LIVE')) then raise exception 'PASSPORT_LOCKED'; end if;
  update public.smartphone_passport_photos set status = 'READY', updated_at = now()
    where photo_id = p_photo_id and listing_id = p_listing_id and owner_id = p_owner_id and status = 'UPLOADING'
  returning * into v_result;
  if not found then raise exception 'PASSPORT_PHOTO_INVALID'; end if;
  return v_result;
end;
$$;

-- Claim before deleting storage so concurrent saves cannot attach the object.
-- NULL photo id performs bounded cleanup of abandoned/detached uploads >24h old.
create function public.claim_smartphone_passport_photo_deletion_v1(p_listing_id uuid, p_owner_id uuid, p_photo_id uuid default null)
returns setof public.smartphone_passport_photos
language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.listings where listing_id = p_listing_id and owner_id = p_owner_id for update;
  if not found then raise exception 'PASSPORT_NOT_FOUND'; end if;
  if p_photo_id is not null and exists (
    select 1 from public.smartphone_passport_photos where photo_id = p_photo_id and listing_id = p_listing_id and attached
  ) then raise exception 'PASSPORT_PHOTO_IN_USE'; end if;
  return query update public.smartphone_passport_photos set status = 'DELETING', updated_at = now()
    where listing_id = p_listing_id and owner_id = p_owner_id and not attached
      and ((p_photo_id is not null and photo_id = p_photo_id) or
        (p_photo_id is null and updated_at < now() - interval '24 hours'))
    returning *;
end;
$$;

revoke all on function public.save_smartphone_passport_v1(uuid,uuid,integer,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.reserve_smartphone_passport_photo_v1(uuid,uuid,uuid,text,text,text,integer) from public,anon,authenticated;
revoke all on function public.finish_smartphone_passport_photo_v1(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_smartphone_passport_photo_deletion_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_smartphone_passport_v1(uuid,uuid,integer,text,integer,jsonb) to service_role;
grant execute on function public.reserve_smartphone_passport_photo_v1(uuid,uuid,uuid,text,text,text,integer) to service_role;
grant execute on function public.finish_smartphone_passport_photo_v1(uuid,uuid,uuid) to service_role;
grant execute on function public.claim_smartphone_passport_photo_deletion_v1(uuid,uuid,uuid) to service_role;
