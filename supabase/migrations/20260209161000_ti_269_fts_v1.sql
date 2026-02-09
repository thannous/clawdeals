-- TI-269: Full-text search v1 (deals + listings) + deals price_max filter + geo listings RPC
--
-- v1 posture: keep existing ordering and cursor semantics; use FTS for filtering only.

create extension if not exists pgcrypto;

-- Deals: search_tsv (title + tags)
alter table public.deals
  add column if not exists search_tsv tsvector;

create or replace function public.deals_search_tsv_update_v1()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(new.tags, ' '), '')), 'B');
  return new;
end;
$$;

drop trigger if exists deals_search_tsv_update_v1_trigger on public.deals;
create trigger deals_search_tsv_update_v1_trigger
before insert or update of title, tags on public.deals
for each row
execute function public.deals_search_tsv_update_v1();

update public.deals
set search_tsv =
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(array_to_string(tags, ' '), '')), 'B')
where search_tsv is null;

create index if not exists deals_search_tsv_gin_idx
  on public.deals using gin (search_tsv);

-- Listings: search_tsv (title + description + category)
alter table public.listings
  add column if not exists search_tsv tsvector;

create or replace function public.listings_search_tsv_update_v1()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.category, '')), 'C');
  return new;
end;
$$;

drop trigger if exists listings_search_tsv_update_v1_trigger on public.listings;
create trigger listings_search_tsv_update_v1_trigger
before insert or update of title, description, category on public.listings
for each row
execute function public.listings_search_tsv_update_v1();

update public.listings
set search_tsv =
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
  setweight(to_tsvector('simple', coalesce(category, '')), 'C')
where search_tsv is null;

create index if not exists listings_search_tsv_gin_idx
  on public.listings using gin (search_tsv);

-- Deals feed RPCs: switch q filter to FTS, add price_max filter. Keep order/cursor semantics unchanged.
create or replace function public.list_deals_new_v0(
  p_statuses deal_status[] default array['NEW', 'ACTIVE']::deal_status[],
  p_q text default null,
  p_tags text[] default null,
  p_price_max numeric default null,
  p_limit int default 30,
  p_cursor_status deal_status default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_deal_id uuid default null
)
returns table (
  deal_id uuid,
  title text,
  source_url text,
  price numeric,
  currency char(3),
  expires_at timestamptz,
  tags text[],
  status deal_status,
  temperature int,
  votes_up int,
  votes_down int,
  created_at timestamptz
)
language sql
stable
as $$
  with base as (
    select
      d.deal_id,
      d.title,
      d.source_url,
      d.price,
      d.currency,
      d.expires_at,
      d.tags,
      d.status,
      coalesce(d.temperature, 50)::int as temperature,
      d.votes_up,
      d.votes_down,
      d.created_at,
      case d.status
        when 'NEW' then 0
        when 'ACTIVE' then 1
        when 'EXPIRED' then 2
        else 3
      end as status_rank
    from public.deals as d
    where d.status = any(p_statuses)
      and (
        p_q is null
        or btrim(p_q) = ''
        or d.search_tsv @@ websearch_to_tsquery('simple', p_q)
      )
      and (p_tags is null or array_length(p_tags, 1) is null or d.tags @> p_tags)
      and (p_price_max is null or d.price <= p_price_max)
  )
  select
    deal_id,
    title,
    source_url,
    price,
    currency,
    expires_at,
    tags,
    status,
    temperature,
    votes_up,
    votes_down,
    created_at
  from base
  where (
    p_cursor_status is null
    or p_cursor_created_at is null
    or p_cursor_deal_id is null
    or (
      base.status_rank >
        case p_cursor_status
          when 'NEW' then 0
          when 'ACTIVE' then 1
          when 'EXPIRED' then 2
          else 3
        end
      or (
        base.status_rank =
          case p_cursor_status
            when 'NEW' then 0
            when 'ACTIVE' then 1
            when 'EXPIRED' then 2
            else 3
          end
        and (base.created_at, base.deal_id) < (p_cursor_created_at, p_cursor_deal_id)
      )
    )
  )
  order by status_rank asc, created_at desc, deal_id desc
  limit greatest(1, least(coalesce(p_limit, 30), 101)); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

create or replace function public.list_deals_temp_v0(
  p_q text default null,
  p_tags text[] default null,
  p_price_max numeric default null,
  p_min_temperature int default 0,
  p_limit int default 30,
  p_cursor_temperature int default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_deal_id uuid default null
)
returns table (
  deal_id uuid,
  title text,
  source_url text,
  price numeric,
  currency char(3),
  expires_at timestamptz,
  tags text[],
  status deal_status,
  temperature int,
  votes_up int,
  votes_down int,
  created_at timestamptz
)
language sql
stable
as $$
  with base as (
    select
      d.deal_id,
      d.title,
      d.source_url,
      d.price,
      d.currency,
      d.expires_at,
      d.tags,
      d.status,
      coalesce(d.temperature, 50)::int as temperature,
      d.votes_up,
      d.votes_down,
      d.created_at
    from public.deals as d
    where d.status = 'ACTIVE'
      and coalesce(d.temperature, 50) >= coalesce(p_min_temperature, 0)
      and (
        p_q is null
        or btrim(p_q) = ''
        or d.search_tsv @@ websearch_to_tsquery('simple', p_q)
      )
      and (p_tags is null or array_length(p_tags, 1) is null or d.tags @> p_tags)
      and (p_price_max is null or d.price <= p_price_max)
  )
  select
    deal_id,
    title,
    source_url,
    price,
    currency,
    expires_at,
    tags,
    status,
    temperature,
    votes_up,
    votes_down,
    created_at
  from base
  where (
    p_cursor_temperature is null
    or p_cursor_created_at is null
    or p_cursor_deal_id is null
    or (
      base.temperature < p_cursor_temperature
      or (
        base.temperature = p_cursor_temperature
        and (base.created_at, base.deal_id) < (p_cursor_created_at, p_cursor_deal_id)
      )
    )
  )
  order by temperature desc, created_at desc, deal_id desc
  limit greatest(1, least(coalesce(p_limit, 30), 101)); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

create or replace function public.list_deals_trend_v0(
  p_as_of timestamptz,
  p_q text default null,
  p_tags text[] default null,
  p_price_max numeric default null,
  p_min_temperature int default 0,
  p_limit int default 30,
  p_cursor_trend_score numeric default null,
  p_cursor_active_at timestamptz default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_deal_id uuid default null
)
returns table (
  deal_id uuid,
  title text,
  source_url text,
  price numeric,
  currency char(3),
  expires_at timestamptz,
  tags text[],
  status deal_status,
  temperature int,
  votes_up int,
  votes_down int,
  created_at timestamptz,
  active_at timestamptz,
  trend_score numeric
)
language sql
stable
as $$
  with base as (
    select
      d.deal_id,
      d.title,
      d.source_url,
      d.price,
      d.currency,
      d.expires_at,
      d.tags,
      d.status,
      coalesce(d.temperature, 50)::int as temperature,
      d.votes_up,
      d.votes_down,
      d.created_at,
      d.active_at,
      round(
        (coalesce(d.temperature, 50)::numeric)
          * 12
          / (12 + greatest(extract(epoch from (p_as_of - d.active_at)) / 3600.0, 0)::numeric),
        6
      ) as trend_score
    from public.deals as d
    where d.status = 'ACTIVE'
      and d.active_at is not null
      and coalesce(d.temperature, 50) >= coalesce(p_min_temperature, 0)
      and (
        p_q is null
        or btrim(p_q) = ''
        or d.search_tsv @@ websearch_to_tsquery('simple', p_q)
      )
      and (p_tags is null or array_length(p_tags, 1) is null or d.tags @> p_tags)
      and (p_price_max is null or d.price <= p_price_max)
  )
  select
    deal_id,
    title,
    source_url,
    price,
    currency,
    expires_at,
    tags,
    status,
    temperature,
    votes_up,
    votes_down,
    created_at,
    active_at,
    trend_score
  from base
  where (
    p_cursor_trend_score is null
    or p_cursor_active_at is null
    or p_cursor_created_at is null
    or p_cursor_deal_id is null
    or (
      base.trend_score < p_cursor_trend_score
      or (base.trend_score = p_cursor_trend_score and base.active_at < p_cursor_active_at)
      or (
        base.trend_score = p_cursor_trend_score
        and base.active_at = p_cursor_active_at
        and base.created_at < p_cursor_created_at
      )
      or (
        base.trend_score = p_cursor_trend_score
        and base.active_at = p_cursor_active_at
        and base.created_at = p_cursor_created_at
        and base.deal_id < p_cursor_deal_id
      )
    )
  )
  order by trend_score desc, active_at desc, created_at desc, deal_id desc
  limit greatest(1, least(coalesce(p_limit, 30), 101)); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

-- Geo listing search RPC (distance sort + stable cursor)
create or replace function public.list_listings_geo_v1(
  p_lat double precision,
  p_lng double precision,
  p_distance_km int default null,
  p_limit int default 50,
  p_cursor_distance_m double precision default null,
  p_cursor_listing_id uuid default null,
  p_q text default null,
  p_category text default null,
  p_condition text default null,
  p_price_min int default null,
  p_price_max int default null
)
returns table (
  listing_id uuid,
  title text,
  category text,
  condition text,
  price_amount int,
  currency char(3),
  status listing_status,
  seller_agent_id uuid,
  created_at timestamptz,
  distance_m double precision
)
language sql
stable
as $$
  with base as (
    select
      l.listing_id,
      l.title,
      l.category,
      l.condition,
      l.price_amount,
      l.currency,
      l.status,
      l.seller_agent_id,
      l.created_at,
      st_distance(l.geo_point, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m
    from public.listings l
    where l.status = 'LIVE'
      and l.geo_point is not null
      and (p_category is null or l.category = p_category)
      and (p_condition is null or l.condition = p_condition)
      and (p_price_min is null or l.price_amount >= p_price_min)
      and (p_price_max is null or l.price_amount <= p_price_max)
      and (
        p_q is null
        or btrim(p_q) = ''
        or l.search_tsv @@ websearch_to_tsquery('simple', p_q)
      )
      and (
        p_distance_km is null
        or st_dwithin(
          l.geo_point,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
          p_distance_km * 1000
        )
      )
  )
  select
    listing_id,
    title,
    category,
    condition,
    price_amount,
    currency,
    status,
    seller_agent_id,
    created_at,
    distance_m
  from base
  where (
    p_cursor_distance_m is null
    or p_cursor_listing_id is null
    or distance_m > p_cursor_distance_m
    or (distance_m = p_cursor_distance_m and listing_id > p_cursor_listing_id)
  )
  order by distance_m asc, listing_id asc
  limit (greatest(1, least(coalesce(p_limit, 50), 100)) + 1); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

