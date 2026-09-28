-- Durable queue rows remain authoritative; pg_net is a best-effort wake-up.
-- Disabled until the dedicated secret exists in Vault. No row payload is sent.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists private.queue_dispatch_state (
  queue_name text primary key check (queue_name in ('watchlist-match-queue', 'watchlist-backfill-queue', 'trustscore-recalc-queue', 'notifications-dispatch')),
  last_wake_at timestamptz not null default '-infinity',
  last_request_id bigint,
  lease_token uuid,
  lease_until timestamptz not null default '-infinity'
);
alter table private.queue_dispatch_state enable row level security;
alter table private.queue_dispatch_state force row level security;
revoke all on private.queue_dispatch_state from public, anon, authenticated, service_role;

-- Bounded, payload-free wake-up. Only internal triggers/recovery can call it.
create or replace function private.send_queue_wake_v1(queue text) returns void
language plpgsql security definer set search_path = '' as $$
declare dispatch_secret text; claimed text; request_id bigint;
begin
  if queue not in ('watchlist-match-queue', 'watchlist-backfill-queue', 'trustscore-recalc-queue', 'notifications-dispatch') then return; end if;
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets
    where name = 'clawdeals_queue_dispatch_secret' limit 1;
  if dispatch_secret is null or length(dispatch_secret) < 16 then return; end if;
  insert into private.queue_dispatch_state(queue_name, last_wake_at)
    values(queue, clock_timestamp())
    on conflict (queue_name) do update set last_wake_at = excluded.last_wake_at
    where private.queue_dispatch_state.last_wake_at < clock_timestamp() - interval '30 seconds'
      and private.queue_dispatch_state.lease_until <= clock_timestamp()
    returning queue_name into claimed;
  if claimed is null then return; end if;
  select net.http_post(
    url := 'https://app.clawdeals.com/api/internal/cron/' || queue,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || dispatch_secret),
    timeout_milliseconds := 65000
  ) into request_id;
  update private.queue_dispatch_state set last_request_id = request_id where queue_name = queue;
exception when others then
  raise warning 'Queue wake unavailable (SQLSTATE %)', sqlstate;
end;
$$;
revoke all on function private.send_queue_wake_v1(text) from public, anon, authenticated, service_role;

-- Only invoked by triggers on service-role-only queue tables, never by users.
create or replace function private.wake_queue_consumer_v1() returns trigger
language plpgsql security definer set search_path = '' as $$
declare queue text;
begin
  queue := case tg_table_name
    when 'watchlist_match_queue' then 'watchlist-match-queue'
    when 'watchlist_backfill_queue' then 'watchlist-backfill-queue'
    when 'trustscore_recalc_queue' then 'trustscore-recalc-queue'
    when 'notification_outbox' then 'notifications-dispatch'
  end;
  if queue is null then return new; end if;
  if tg_table_name = 'notification_outbox' then
    if new.status <> 'PENDING' then return new; end if;
    if tg_op = 'UPDATE' then
      if old.status = 'PENDING' then return new; end if;
    end if;
  elsif tg_table_name = 'watchlist_match_queue' and tg_op = 'UPDATE' then
    if new.attempt_count > old.attempt_count then return new; end if;
  end if;
  perform private.send_queue_wake_v1(queue);
  return new;
exception when others then
  -- Never break a producer transaction. Recovery drains the durable row.
  raise warning 'Queue trigger unavailable (SQLSTATE %)', sqlstate;
  return new;
end;
$$;
revoke all on function private.wake_queue_consumer_v1() from public, anon, authenticated, service_role;

create trigger watchlist_match_event_dispatch after insert or update on public.watchlist_match_queue
for each row execute function private.wake_queue_consumer_v1();
create trigger watchlist_backfill_event_dispatch after insert or update on public.watchlist_backfill_queue
for each row execute function private.wake_queue_consumer_v1();
create trigger trustscore_event_dispatch after insert or update on public.trustscore_recalc_queue
for each row execute function private.wake_queue_consumer_v1();
create trigger notification_event_dispatch after insert or update on public.notification_outbox
for each row execute function private.wake_queue_consumer_v1();

-- A five-minute lease outlives the handlers' explicit sixty-second duration.
create or replace function private.queue_drain_claim_v1(p_queue text, p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare claimed text;
begin
  if p_token is null then return false; end if;
  insert into private.queue_dispatch_state(queue_name, lease_token, lease_until)
    values(p_queue, p_token, clock_timestamp() + interval '5 minutes')
    on conflict (queue_name) do update set lease_token = excluded.lease_token, lease_until = excluded.lease_until
    where private.queue_dispatch_state.lease_until <= clock_timestamp()
    returning queue_name into claimed;
  return claimed is not null;
end;
$$;
create or replace function private.queue_drain_release_v1(p_queue text, p_token uuid) returns void
language sql security definer set search_path = '' as $$
  update private.queue_dispatch_state set lease_token = null, lease_until = '-infinity'
  where queue_name = p_queue and lease_token = p_token;
$$;
create or replace function public.queue_drain_claim_v1(p_queue text, p_token uuid) returns boolean
language sql security invoker set search_path = '' as $$
  select private.queue_drain_claim_v1(p_queue, p_token);
$$;
create or replace function public.queue_drain_release_v1(p_queue text, p_token uuid) returns void
language sql security invoker set search_path = '' as $$
  select private.queue_drain_release_v1(p_queue, p_token);
$$;
revoke all on function private.queue_drain_claim_v1(text, uuid), private.queue_drain_release_v1(text, uuid),
  public.queue_drain_claim_v1(text, uuid), public.queue_drain_release_v1(text, uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.queue_drain_claim_v1(text, uuid), private.queue_drain_release_v1(text, uuid),
  public.queue_drain_claim_v1(text, uuid), public.queue_drain_release_v1(text, uuid) to service_role;

-- Coalesced writes, crashes, full batches and failed HTTP wakes must not wait an
-- hour. These indexed existence checks stay inside Postgres: no HTTP when empty.
create or replace function private.retry_pending_queue_wakes_v1() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.watchlist_match_queue) then perform private.send_queue_wake_v1('watchlist-match-queue'); end if;
  if exists(select 1 from public.watchlist_backfill_queue) then perform private.send_queue_wake_v1('watchlist-backfill-queue'); end if;
  if exists(select 1 from public.trustscore_recalc_queue) then perform private.send_queue_wake_v1('trustscore-recalc-queue'); end if;
  -- PENDING also includes intentionally deferred digests and quiet hours. Do not
  -- increase their polling above the previous fifteen-minute cadence.
  if exists(select 1 from public.notification_outbox where status = 'PENDING')
    and not exists(select 1 from private.queue_dispatch_state where queue_name = 'notifications-dispatch' and last_wake_at > clock_timestamp() - interval '15 minutes')
  then perform private.send_queue_wake_v1('notifications-dispatch'); end if;
end;
$$;
revoke all on function private.retry_pending_queue_wakes_v1() from public, anon, authenticated, service_role;
select cron.schedule('clawdeals-pending-queue-recovery', '*/5 * * * *', 'select private.retry_pending_queue_wakes_v1()');

-- Operational credential rotation, scoped to this single Vault entry. Only the
-- service role may configure it; anonymous/authenticated roles cannot call it.
create or replace function private.configure_queue_dispatch_v1(p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare secret_id uuid;
begin
  if p_secret is null or length(p_secret) < 32 then raise exception 'Invalid queue dispatch credential'; end if;
  select id into secret_id from vault.secrets where name = 'clawdeals_queue_dispatch_secret';
  if secret_id is null then
    perform vault.create_secret(p_secret, 'clawdeals_queue_dispatch_secret', 'Queue wake credential; Vercel QUEUE_DISPATCH_SECRET');
  else
    perform vault.update_secret(secret_id, p_secret);
  end if;
end;
$$;
create or replace function public.configure_queue_dispatch_v1(p_secret text) returns void
language sql security invoker set search_path = '' as $$ select private.configure_queue_dispatch_v1(p_secret); $$;
revoke all on function private.configure_queue_dispatch_v1(text), public.configure_queue_dispatch_v1(text) from public, anon, authenticated;
grant execute on function private.configure_queue_dispatch_v1(text), public.configure_queue_dispatch_v1(text) to service_role;
