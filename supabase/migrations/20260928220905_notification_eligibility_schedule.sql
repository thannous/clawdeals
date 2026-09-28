-- Additive rollout: apply before deploying consumers that filter available_at.
alter table public.notification_outbox
  add column available_at timestamptz not null default now(),
  add column schedule_preferences jsonb not null default '{}'::jsonb;
create index notification_outbox_due_idx on public.notification_outbox (available_at, occurred_at, notification_outbox_id) where status = 'PENDING';

-- Only scheduling fields are retained, never channels, addresses or payloads.
create function private.notification_schedule_preferences_v1(p jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'event_types', coalesce(p->'event_types','["watchlist_match"]'::jsonb),
    'mode', coalesce(p->>'mode','DIGEST_HOURLY'), 'timezone', coalesce(p->>'timezone','UTC'),
    'quiet_enabled', coalesce((p->>'quiet_enabled')::boolean,false),
    'quiet_start_min', p->'quiet_start_min', 'quiet_end_min', p->'quiet_end_min',
    'daily_digest_hour', coalesce((p->>'daily_digest_hour')::int,9),
    'last_hourly_digest_at', p->'last_hourly_digest_at', 'last_daily_digest_at', p->'last_daily_digest_at');
$$;

create function private.notification_event_enabled_v1(p jsonb, event text) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select p->>'mode' = 'SILENT' or (
    lower(event) in ('watchlist_match','offer_received','approval_required','transaction_updates') and
    exists(select 1 from jsonb_array_elements_text(coalesce(p->'event_types','["watchlist_match"]'::jsonb)) e
      where lower(btrim(e))=lower(event)));
$$;

-- Walk real UTC minutes rather than converting an ambiguous/nonexistent local
-- wall-clock time. Exit immediately for due work. 49 hours covers a DST-long day
-- plus the next daily window. No eligible window means suspended until prefs change.
create function private.notification_eligible_at_v1(p jsonb, p_now timestamptz) returns timestamptz
language plpgsql stable security invoker set search_path = '' as $$
declare
  zone text := coalesce(nullif(btrim(p->>'timezone'),''),'UTC');
  mode text := coalesce(p->>'mode','DIGEST_HOURLY');
  candidate timestamptz := p_now;
  wall timestamp; minute_of_day int; last_hour timestamp; last_day date;
  quiet boolean := coalesce((p->>'quiet_enabled')::boolean,false);
  quiet_start int := (p->>'quiet_start_min')::int;
  quiet_end int := (p->>'quiet_end_min')::int;
  digest_hour int := coalesce((p->>'daily_digest_hour')::int,9);
  blocked boolean; resolved_zone text; fixed_offset interval := interval '0'; offset_digits text;
begin
  if mode = 'SILENT' then return p_now; end if; -- consumer must suppress, not postpone
  if zone ~ '^[+-](0[0-9]|1[0-9]|2[0-3])(:?[0-5][0-9])?$' then
    offset_digits := replace(substr(zone,2),':','');
    fixed_offset := make_interval(mins => (case when left(zone,1)='-' then -1 else 1 end) *
      (left(offset_digits,2)::int * 60 + coalesce(nullif(substr(offset_digits,3),''),'0')::int));
    zone := 'UTC';
  else
    select name into resolved_zone from pg_catalog.pg_timezone_names where lower(name)=lower(zone) limit 1;
    zone := coalesce(resolved_zone,'UTC');
  end if;
  if quiet and quiet_start is not null and quiet_start = quiet_end then return 'infinity'; end if;
  last_hour := date_trunc('hour', ((p->>'last_hourly_digest_at')::timestamptz at time zone zone) + fixed_offset);
  last_day := (((p->>'last_daily_digest_at')::timestamptz at time zone zone) + fixed_offset)::date;
  for step in 0..2940 loop
    wall := (candidate at time zone zone) + fixed_offset;
    minute_of_day := extract(hour from wall)::int * 60 + extract(minute from wall)::int;
    blocked := quiet and quiet_start is not null and quiet_end is not null and
      case when quiet_start < quiet_end then minute_of_day >= quiet_start and minute_of_day < quiet_end
           else minute_of_day >= quiet_start or minute_of_day < quiet_end end;
    if mode = 'DIGEST_HOURLY' then
      blocked := blocked or coalesce(date_trunc('hour',wall) = last_hour,false);
    elsif mode = 'DIGEST_DAILY' then
      blocked := blocked or coalesce(wall::date = last_day,false) or extract(hour from wall) < digest_hour;
    end if;
    if not blocked then return candidate; end if;
    candidate := date_trunc('minute',candidate) + interval '1 minute';
  end loop;
  return 'infinity';
end;
$$;

create function private.schedule_notification_row_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare prefs jsonb;
begin
  if new.status <> 'PENDING' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status = old.status and new.attempt_count = old.attempt_count and new.owner_id = old.owner_id and new.event_type = old.event_type then return new; end if;
  end if;
  select private.notification_schedule_preferences_v1(to_jsonb(p)) into prefs
    from public.notification_preferences p where p.owner_id=new.owner_id;
  new.schedule_preferences := coalesce(prefs,private.notification_schedule_preferences_v1('{}'));
  new.available_at := case when private.notification_event_enabled_v1(new.schedule_preferences,new.event_type)
    then private.notification_eligible_at_v1(new.schedule_preferences,now()) else 'infinity'::timestamptz end;
  if tg_op = 'UPDATE' then
    if new.attempt_count > old.attempt_count then new.available_at := greatest(new.available_at, now()+interval '15 minutes'); end if;
  end if;
  return new;
end;
$$;
create trigger notification_schedule before insert or update on public.notification_outbox
for each row execute function private.schedule_notification_row_v1();

create function private.reschedule_owner_notifications_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare prefs jsonb; target uuid; due timestamptz;
begin
  if tg_op='DELETE' then target:=old.owner_id; prefs:=private.notification_schedule_preferences_v1('{}');
  else target:=new.owner_id; prefs:=private.notification_schedule_preferences_v1(to_jsonb(new)); end if;
  if tg_op='UPDATE' then
    if prefs = private.notification_schedule_preferences_v1(to_jsonb(old)) then return new; end if;
  end if;
  due := private.notification_eligible_at_v1(prefs,now());
  update public.notification_outbox set available_at=case when private.notification_event_enabled_v1(prefs,event_type) then due else 'infinity'::timestamptz end, schedule_preferences=prefs
    where owner_id=target and status='PENDING' and schedule_preferences is distinct from prefs;
  return coalesce(new,old);
end;
$$;
create trigger notification_preferences_schedule after insert or update or delete on public.notification_preferences
for each row execute function private.reschedule_owner_notifications_v1();

-- Reconcile snapshots missed by concurrent inserts/preference changes. This is
-- SQL-only, including permanently quiet owners: no periodic HTTP just to check prefs.
create function private.reconcile_notification_schedules_v1() returns void
language sql security definer set search_path = '' as $$
  with owners as materialized (
    select distinct o.owner_id, private.notification_schedule_preferences_v1(coalesce(to_jsonb(p),'{}')) prefs
    from public.notification_outbox o left join public.notification_preferences p using(owner_id)
    where o.status='PENDING' and o.schedule_preferences is distinct from private.notification_schedule_preferences_v1(coalesce(to_jsonb(p),'{}'))
  ), schedules as materialized (
    select owner_id,prefs,private.notification_eligible_at_v1(prefs,now()) due from owners
  )
  update public.notification_outbox o set available_at=case when private.notification_event_enabled_v1(s.prefs,o.event_type) then s.due else 'infinity'::timestamptz end,schedule_preferences=s.prefs
    from schedules s where o.owner_id=s.owner_id and o.status='PENDING' and o.schedule_preferences is distinct from s.prefs;
$$;

create or replace function private.wake_queue_consumer_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare queue text;
begin
  queue := case tg_table_name
    when 'watchlist_match_queue' then 'watchlist-match-queue'
    when 'watchlist_backfill_queue' then 'watchlist-backfill-queue'
    when 'trustscore_recalc_queue' then 'trustscore-recalc-queue'
    when 'notification_outbox' then 'notifications-dispatch' end;
  if queue is null then return new; end if;
  if tg_table_name='notification_outbox' then
    if new.status <> 'PENDING' or new.available_at > now() then return new; end if;
    if tg_op='UPDATE' then
      if old.status='PENDING' and old.available_at <= now() then return new; end if;
    end if;
  elsif tg_table_name='watchlist_match_queue' and tg_op='UPDATE' then
    if new.attempt_count > old.attempt_count then return new; end if;
  end if;
  perform private.send_queue_wake_v1(queue);
  return new;
exception when others then
  raise warning 'Queue trigger unavailable (SQLSTATE %)',sqlstate;
  return new;
end;
$$;
create or replace function private.retry_pending_queue_wakes_v1() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.watchlist_match_queue) then perform private.send_queue_wake_v1('watchlist-match-queue'); end if;
  if exists(select 1 from public.watchlist_backfill_queue) then perform private.send_queue_wake_v1('watchlist-backfill-queue'); end if;
  if exists(select 1 from public.trustscore_recalc_queue) then perform private.send_queue_wake_v1('trustscore-recalc-queue'); end if;
  perform private.reconcile_notification_schedules_v1();
  if exists(select 1 from public.notification_outbox where status='PENDING' and available_at <= now())
    then perform private.send_queue_wake_v1('notifications-dispatch'); end if;
end;
$$;
revoke all on function private.notification_event_enabled_v1(jsonb,text), private.notification_schedule_preferences_v1(jsonb), private.notification_eligible_at_v1(jsonb,timestamptz),
  private.schedule_notification_row_v1(),private.reschedule_owner_notifications_v1(),private.reconcile_notification_schedules_v1()
  from public,anon,authenticated,service_role;
-- Existing wake/recovery functions retain their previous restrictive ACLs.
select private.reconcile_notification_schedules_v1();
