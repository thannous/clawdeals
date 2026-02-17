-- Filter hidden content in feed RPCs via moderation_states (deals + listings).
--
-- This is enforced at the RPC layer (API uses Supabase service role, bypassing RLS).
-- Hidden means: exists moderation_states row for (entity_type, entity_id) with hidden=true.

create extension if not exists pgcrypto;

-- Cleanup first: Postgres cannot change a function's return type with CREATE OR REPLACE.
-- Drop current/older overloads (both with and without p_include_hidden) to avoid ambiguity.
drop function if exists public.list_deals_new_v0(deal_status[], text, text[], numeric, boolean, int, deal_status, timestamptz, uuid);
drop function if exists public.list_deals_temp_v0(text, text[], numeric, boolean, int, int, int, timestamptz, uuid);
drop function if exists public.list_deals_trend_v0(timestamptz, text, text[], numeric, boolean, int, int, numeric, timestamptz, timestamptz, uuid);
drop function if exists public.list_listings_geo_v1(double precision, double precision, int, boolean, int, double precision, uuid, text, text, text, int, int);
drop function if exists public.list_deals_new_v0(deal_status[], text, text[], numeric, int, deal_status, timestamptz, uuid);
drop function if exists public.list_deals_temp_v0(text, text[], numeric, int, int, int, timestamptz, uuid);
drop function if exists public.list_deals_trend_v0(timestamptz, text, text[], numeric, int, int, numeric, timestamptz, timestamptz, uuid);
drop function if exists public.list_listings_geo_v1(double precision, double precision, int, int, double precision, uuid, text, text, text, int, int);

create or replace function public.list_deals_new_v0(
  p_statuses deal_status[] default array['NEW', 'ACTIVE']::deal_status[],
  p_q text default null,
  p_tags text[] default null,
  p_price_max numeric default null,
  p_include_hidden boolean default false,
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
        p_include_hidden
        or not exists (
          select 1
          from public.moderation_states ms
          where ms.entity_type = 'deal'::public.report_entity_type
            and ms.entity_id = d.deal_id
            and ms.hidden
        )
      )
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
  p_include_hidden boolean default false,
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
      and (
        p_include_hidden
        or not exists (
          select 1
          from public.moderation_states ms
          where ms.entity_type = 'deal'::public.report_entity_type
            and ms.entity_id = d.deal_id
            and ms.hidden
        )
      )
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
  p_include_hidden boolean default false,
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
      and (
        p_include_hidden
        or not exists (
          select 1
          from public.moderation_states ms
          where ms.entity_type = 'deal'::public.report_entity_type
            and ms.entity_id = d.deal_id
            and ms.hidden
        )
      )
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

create or replace function public.list_listings_geo_v1(
  p_lat double precision,
  p_lng double precision,
  p_distance_km int default null,
  p_include_hidden boolean default false,
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
      and (
        p_include_hidden
        or not exists (
          select 1
          from public.moderation_states ms
          where ms.entity_type = 'listing'::public.report_entity_type
            and ms.entity_id = l.listing_id
            and ms.hidden
        )
      )
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

-- Supabase security lint: pin function search_path explicitly.
alter function public.list_deals_new_v0(deal_status[], text, text[], numeric, boolean, int, deal_status, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_deals_temp_v0(text, text[], numeric, boolean, int, int, int, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_deals_trend_v0(timestamptz, text, text[], numeric, boolean, int, int, numeric, timestamptz, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_geo_v1(double precision, double precision, int, boolean, int, double precision, uuid, text, text, text, int, int)
  set search_path = pg_catalog, public;
