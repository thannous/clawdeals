-- A generation is updated_at; checkpoints must never change it or wake the worker.
alter table public.watchlist_backfill_queue
  add column available_at timestamptz not null default clock_timestamp(),
  add column scan_started_at timestamptz,
  add column scan_limit integer,
  add column listing_cursor_created_at timestamptz,
  add column listing_cursor_id uuid,
  add column listings_scanned integer not null default 0,
  add column progress_version bigint not null default 0,
  add constraint watchlist_backfill_scan_bounds check (
    listings_scanned >= 0 and progress_version >= 0 and
    (scan_limit is null or scan_limit between 1 and 5000) and
    (scan_limit is null or listings_scanned <= scan_limit) and
    ((listing_cursor_created_at is null) = (listing_cursor_id is null))
  );
update public.watchlist_backfill_queue set available_at = updated_at;
create index watchlist_backfill_available_idx on public.watchlist_backfill_queue (available_at, watchlist_id);
create index listings_live_backfill_cursor_idx on public.listings (market_code, created_at desc, listing_id desc) where status = 'LIVE';

create or replace function public.reset_watchlist_backfill_progress_v1()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.scan_started_at := null;
  new.scan_limit := null;
  new.listing_cursor_created_at := null;
  new.listing_cursor_id := null;
  new.listings_scanned := 0;
  new.progress_version := 0;
  -- Keep the existing scheduling position when new work replaces this generation.
  new.available_at := old.available_at;
  return new;
end;
$$;
revoke all on function public.reset_watchlist_backfill_progress_v1() from public, anon, authenticated;
grant execute on function public.reset_watchlist_backfill_progress_v1() to service_role;
create trigger watchlist_backfill_reset_progress before update of updated_at
  on public.watchlist_backfill_queue for each row
  execute function public.reset_watchlist_backfill_progress_v1();

-- No watchlist/listing locks are acquired here: the transition RPC has committed
-- before this short queue-only transaction. Version CAS also fences two workers
-- that read the same generation before a lease expires.
create or replace function public.checkpoint_watchlist_backfill_v1(
  p_watchlist_id uuid, p_generation timestamptz, p_progress_version bigint,
  p_scan_started_at timestamptz, p_scan_limit integer,
  p_cursor_created_at timestamptz, p_cursor_id uuid,
  p_listings_scanned integer, p_complete boolean default false
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  changed integer;
begin
  if p_watchlist_id is null or p_generation is null or p_progress_version is null or
    p_progress_version < 0 or p_complete is null or p_listings_scanned is null or
    p_scan_started_at is null or p_scan_limit is null or p_scan_limit not between 1 and 5000 or
    p_listings_scanned not between 0 and p_scan_limit or
    ((p_cursor_created_at is null) <> (p_cursor_id is null)) then
    raise exception 'Invalid backfill checkpoint' using errcode = '22023';
  end if;
  if p_complete then
    delete from public.watchlist_backfill_queue
    where watchlist_id = p_watchlist_id and updated_at = p_generation
      and progress_version = p_progress_version;
  else
    update public.watchlist_backfill_queue
    set scan_started_at = p_scan_started_at, scan_limit = p_scan_limit,
      listing_cursor_created_at = p_cursor_created_at, listing_cursor_id = p_cursor_id,
      listings_scanned = p_listings_scanned, progress_version = progress_version + 1,
      available_at = clock_timestamp()
    where watchlist_id = p_watchlist_id and updated_at = p_generation
      and progress_version = p_progress_version
      and p_listings_scanned between listings_scanned and listings_scanned + 1
      and (scan_started_at is null or scan_started_at = p_scan_started_at)
      and (scan_limit is null or scan_limit = p_scan_limit);
  end if;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.checkpoint_watchlist_backfill_v1(uuid,timestamptz,bigint,timestamptz,integer,timestamptz,uuid,integer,boolean) from public, anon, authenticated;
grant execute on function public.checkpoint_watchlist_backfill_v1(uuid,timestamptz,bigint,timestamptz,integer,timestamptz,uuid,integer,boolean) to service_role;

-- Checkpoints do not create one HTTP wake per listing. Pending work is retried
-- by the existing scheduled queue recovery; an actual enqueue still wakes it.
create or replace trigger watchlist_backfill_event_dispatch
  after insert or update of updated_at on public.watchlist_backfill_queue
  for each row execute function private.wake_queue_consumer_v1();
