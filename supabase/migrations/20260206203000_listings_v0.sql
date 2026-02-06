create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type listing_status as enum (
      'DRAFT',
      'PENDING_APPROVAL',
      'LIVE',
      'RESERVED',
      'CONTACT_REVEALED',
      'COMPLETED',
      'REMOVED',
      'EXPIRED'
    );
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'listing_id'
  ) then
    alter table public.listings rename column id to listing_id;
  end if;
end $$;

alter table public.listings
  add column if not exists seller_agent_id uuid,
  add column if not exists category text,
  add column if not exists condition text,
  add column if not exists price_amount int,
  add column if not exists currency char(3),
  add column if not exists geo_lat double precision,
  add column if not exists geo_lng double precision,
  add column if not exists photos jsonb,
  add column if not exists updated_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists reserved_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.listings
  alter column status drop default;

alter table public.listings
  alter column status type listing_status
  using (
    case
      when status is null then 'LIVE'
      when lower(status) = 'active' then 'LIVE'
      when upper(status) in ('DRAFT', 'PENDING_APPROVAL', 'LIVE', 'RESERVED', 'CONTACT_REVEALED', 'COMPLETED', 'REMOVED', 'EXPIRED')
        then upper(status)
      else 'LIVE'
    end
  )::listing_status;

alter table public.listings
  alter column status set default 'LIVE';

-- Backfill existing rows safely (there are already hundreds of rows).
update public.listings
set
  title = case
    when title is null or btrim(title) = '' then 'Untitled'
    when char_length(title) > 120 then left(title, 120)
    else title
  end,
  description = case
    when description is null then null
    when char_length(description) > 4000 then left(description, 4000)
    else description
  end,
  seller_agent_id = coalesce(
    seller_agent_id,
    case
      when agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then agent_id::uuid
      else null
    end,
    '00000000-0000-4000-a000-000000000001'::uuid
  ),
  category = coalesce(nullif(btrim(category), ''), 'unknown'),
  condition = case
    when condition is null or btrim(condition) = '' then 'GOOD'
    when upper(condition) in ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR') then upper(condition)
    else 'GOOD'
  end,
  price_amount = greatest(coalesce(price_amount, 0), 0),
  currency = case
    when currency is null or btrim(currency) = '' then 'EUR'
    when upper(currency) in ('EUR', 'USD', 'GBP') then upper(currency)
    else 'EUR'
  end,
  updated_at = coalesce(updated_at, created_at);

alter table public.listings
  alter column seller_agent_id set not null,
  alter column category set not null,
  alter column condition set not null,
  alter column price_amount set not null,
  alter column price_amount set default 0,
  alter column currency set not null,
  alter column currency set default 'EUR',
  alter column updated_at set not null,
  alter column updated_at set default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_title_len_check') then
    alter table public.listings
      add constraint listings_title_len_check
      check (char_length(title) between 1 and 120);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_description_len_check') then
    alter table public.listings
      add constraint listings_description_len_check
      check (description is null or char_length(description) <= 4000);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_price_amount_check') then
    alter table public.listings
      add constraint listings_price_amount_check
      check (price_amount >= 0);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_condition_check') then
    alter table public.listings
      add constraint listings_condition_check
      check (condition in ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_currency_check') then
    alter table public.listings
      add constraint listings_currency_check
      check (currency in ('EUR', 'USD', 'GBP'));
  end if;
end $$;

create index if not exists listings_status_created_idx
  on public.listings (status, created_at desc);

create index if not exists listings_category_status_idx
  on public.listings (category, status);

create index if not exists listings_price_amount_idx
  on public.listings (price_amount);

