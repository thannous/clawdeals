-- TI-270: Ranking v1 (trust-aware + recency) + optional include_hidden for feed RPCs.
--
-- Goals:
-- - Introduce a stable, explainable rank score.
--   deals (trend): temperature + recency - penalties (duplicate, hidden)
--   listings (rank): recency + optional price fit + seller trust band - hidden penalty
-- - Hidden items are filtered out by default (standard clients).
-- - Stable ordering tie-breakers: created_at, id.
--
-- Note: API uses Supabase service role (bypasses RLS), so filtering is enforced at the RPC layer.

create extension if not exists pgcrypto;

-- Deals feed RPCs (include_hidden param; ranking v1 for trend)
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
    left join public.moderation_states ms
      on ms.entity_type = 'deal'::public.report_entity_type
      and ms.entity_id = d.deal_id
    where d.status = any(p_statuses)
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
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
    left join public.moderation_states ms
      on ms.entity_type = 'deal'::public.report_entity_type
      and ms.entity_id = d.deal_id
    where d.status = 'ACTIVE'
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
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
  trend_score numeric,
  rank_score numeric
)
language sql
stable
as $$
  with raw as (
    select
      d.deal_id,
      d.title,
      d.source_url,
      d.source_url_fingerprint,
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
      coalesce(ms.hidden, false) as is_hidden,
      row_number() over (
        partition by d.source_url_fingerprint
        order by d.created_at desc, d.deal_id desc
      ) as dup_rank
    from public.deals as d
    left join public.moderation_states ms
      on ms.entity_type = 'deal'::public.report_entity_type
      and ms.entity_id = d.deal_id
    where d.status = 'ACTIVE'
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
      and coalesce(d.temperature, 50) >= coalesce(p_min_temperature, 0)
      and (
        p_q is null
        or btrim(p_q) = ''
        or d.search_tsv @@ websearch_to_tsquery('simple', p_q)
      )
      and (p_tags is null or array_length(p_tags, 1) is null or d.tags @> p_tags)
      and (p_price_max is null or d.price <= p_price_max)
  ),
  base as (
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
      -- Explainable components:
      -- - temperature: 0..100 (default 50)
      -- - recency: 0..100 (half-life-ish around 12h)
      round(
        100::numeric
          * 12
          / (12 + greatest(extract(epoch from (p_as_of - coalesce(active_at, created_at))) / 3600.0, 0)::numeric),
        6
      ) as recency_score,
      greatest(dup_rank - 1, 0) as dup_index,
      case when is_hidden then 10000 else 0 end as hide_penalty
    from raw
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
    round(
      (temperature::numeric)
      + recency_score
      - (dup_index::numeric * 15)
      - hide_penalty::numeric,
      6
    ) as trend_score,
    round(
      (temperature::numeric)
      + recency_score
      - (dup_index::numeric * 15)
      - hide_penalty::numeric,
      6
    ) as rank_score
  from base
  where (
    p_cursor_trend_score is null
    or p_cursor_created_at is null
    or p_cursor_deal_id is null
    or (
      base.temperature::numeric + base.recency_score - (base.dup_index::numeric * 15) - base.hide_penalty::numeric < p_cursor_trend_score
      or (
        base.temperature::numeric + base.recency_score - (base.dup_index::numeric * 15) - base.hide_penalty::numeric = p_cursor_trend_score
        and (base.created_at, base.deal_id) < (p_cursor_created_at, p_cursor_deal_id)
      )
    )
  )
  order by trend_score desc, created_at desc, deal_id desc
  limit greatest(1, least(coalesce(p_limit, 30), 101)); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

-- Listings RPCs (recent/price/rank) + geo RPC include_hidden.
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
    left join public.moderation_states ms
      on ms.entity_type = 'listing'::public.report_entity_type
      and ms.entity_id = l.listing_id
    where l.status = 'LIVE'
      and l.geo_point is not null
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
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

create or replace function public.list_listings_recent_v1(
  p_status listing_status default null,
  p_q text default null,
  p_category text default null,
  p_condition text default null,
  p_price_min int default null,
  p_price_max int default null,
  p_include_hidden boolean default false,
  p_limit int default 50,
  p_cursor_created_at timestamptz default null,
  p_cursor_listing_id uuid default null
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
  created_at timestamptz
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
      l.created_at
    from public.listings l
    left join public.moderation_states ms
      on ms.entity_type = 'listing'::public.report_entity_type
      and ms.entity_id = l.listing_id
    where (p_status is null or l.status = p_status)
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
      and (p_category is null or l.category = p_category)
      and (p_condition is null or l.condition = p_condition)
      and (p_price_min is null or l.price_amount >= p_price_min)
      and (p_price_max is null or l.price_amount <= p_price_max)
      and (
        p_q is null
        or btrim(p_q) = ''
        or l.search_tsv @@ websearch_to_tsquery('simple', p_q)
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
    created_at
  from base
  where (
    p_cursor_created_at is null
    or p_cursor_listing_id is null
    or (base.created_at, base.listing_id) < (p_cursor_created_at, p_cursor_listing_id)
  )
  order by created_at desc, listing_id desc
  limit greatest(1, least(coalesce(p_limit, 50), 101));
$$;

create or replace function public.list_listings_price_asc_v1(
  p_status listing_status default null,
  p_q text default null,
  p_category text default null,
  p_condition text default null,
  p_price_min int default null,
  p_price_max int default null,
  p_include_hidden boolean default false,
  p_limit int default 50,
  p_cursor_price_amount int default null,
  p_cursor_listing_id uuid default null
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
  created_at timestamptz
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
      l.created_at
    from public.listings l
    left join public.moderation_states ms
      on ms.entity_type = 'listing'::public.report_entity_type
      and ms.entity_id = l.listing_id
    where (p_status is null or l.status = p_status)
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
      and (p_category is null or l.category = p_category)
      and (p_condition is null or l.condition = p_condition)
      and (p_price_min is null or l.price_amount >= p_price_min)
      and (p_price_max is null or l.price_amount <= p_price_max)
      and (
        p_q is null
        or btrim(p_q) = ''
        or l.search_tsv @@ websearch_to_tsquery('simple', p_q)
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
    created_at
  from base
  where (
    p_cursor_price_amount is null
    or p_cursor_listing_id is null
    or (
      base.price_amount > p_cursor_price_amount
      or (
        base.price_amount = p_cursor_price_amount
        and base.listing_id > p_cursor_listing_id
      )
    )
  )
  order by price_amount asc, listing_id asc
  limit greatest(1, least(coalesce(p_limit, 50), 101));
$$;

create or replace function public.list_listings_price_desc_v1(
  p_status listing_status default null,
  p_q text default null,
  p_category text default null,
  p_condition text default null,
  p_price_min int default null,
  p_price_max int default null,
  p_include_hidden boolean default false,
  p_limit int default 50,
  p_cursor_price_amount int default null,
  p_cursor_listing_id uuid default null
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
  created_at timestamptz
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
      l.created_at
    from public.listings l
    left join public.moderation_states ms
      on ms.entity_type = 'listing'::public.report_entity_type
      and ms.entity_id = l.listing_id
    where (p_status is null or l.status = p_status)
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
      and (p_category is null or l.category = p_category)
      and (p_condition is null or l.condition = p_condition)
      and (p_price_min is null or l.price_amount >= p_price_min)
      and (p_price_max is null or l.price_amount <= p_price_max)
      and (
        p_q is null
        or btrim(p_q) = ''
        or l.search_tsv @@ websearch_to_tsquery('simple', p_q)
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
    created_at
  from base
  where (
    p_cursor_price_amount is null
    or p_cursor_listing_id is null
    or (
      base.price_amount < p_cursor_price_amount
      or (
        base.price_amount = p_cursor_price_amount
        and base.listing_id < p_cursor_listing_id
      )
    )
  )
  order by price_amount desc, listing_id desc
  limit greatest(1, least(coalesce(p_limit, 50), 101));
$$;

create or replace function public.list_listings_rank_v1(
  p_as_of timestamptz,
  p_status listing_status default null,
  p_q text default null,
  p_category text default null,
  p_condition text default null,
  p_price_min int default null,
  p_price_max int default null,
  p_include_hidden boolean default false,
  p_limit int default 50,
  p_cursor_rank_score numeric default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_listing_id uuid default null
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
  rank_score numeric
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
      coalesce(ms.hidden, false) as is_hidden,
      coalesce(a.trust_score, 0) as seller_trust_score,
      coalesce(a.trust_flags, '[]'::jsonb) as seller_trust_flags
    from public.listings l
    left join public.moderation_states ms
      on ms.entity_type = 'listing'::public.report_entity_type
      and ms.entity_id = l.listing_id
    left join public.agents a
      on a.id = l.seller_agent_id
    where (p_status is null or l.status = p_status)
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
      and (p_category is null or l.category = p_category)
      and (p_condition is null or l.condition = p_condition)
      and (p_price_min is null or l.price_amount >= p_price_min)
      and (p_price_max is null or l.price_amount <= p_price_max)
      and (
        p_q is null
        or btrim(p_q) = ''
        or l.search_tsv @@ websearch_to_tsquery('simple', p_q)
      )
  ),
  scored as (
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
      round(
        100::numeric
          * 24
          / (24 + greatest(extract(epoch from (p_as_of - created_at)) / 3600.0, 0)::numeric),
        6
      ) as recency_score,
      case
        when (seller_trust_flags ? 'restricted') or (seller_trust_flags ? 'suspended') or (seller_trust_flags ? 'under_review') then -50
        when seller_trust_score >= 80 then 20
        when seller_trust_score >= 50 then 10
        else 0
      end as trust_bonus,
      case
        when p_price_min is not null and p_price_max is not null and p_price_max > p_price_min then
          -- Price fit: closer to center of requested range -> higher.
          round(
            10::numeric
              * (1 - least(
                abs(price_amount::numeric - ((p_price_min + p_price_max)::numeric / 2))
                  / greatest(((p_price_max - p_price_min)::numeric / 2), 1),
                1
              )),
            6
          )
        else 0
      end as price_bonus,
      case when is_hidden then 10000 else 0 end as hide_penalty
    from base
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
    round(recency_score + trust_bonus::numeric + price_bonus - hide_penalty::numeric, 6) as rank_score
  from scored
  where (
    p_cursor_rank_score is null
    or p_cursor_created_at is null
    or p_cursor_listing_id is null
    or (
      round(recency_score + trust_bonus::numeric + price_bonus - hide_penalty::numeric, 6) < p_cursor_rank_score
      or (
        round(recency_score + trust_bonus::numeric + price_bonus - hide_penalty::numeric, 6) = p_cursor_rank_score
        and (created_at, listing_id) < (p_cursor_created_at, p_cursor_listing_id)
      )
    )
  )
  order by rank_score desc, created_at desc, listing_id desc
  limit greatest(1, least(coalesce(p_limit, 50), 101));
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

alter function public.list_listings_recent_v1(listing_status, text, text, text, int, int, boolean, int, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_price_asc_v1(listing_status, text, text, text, int, int, boolean, int, int, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_price_desc_v1(listing_status, text, text, text, int, int, boolean, int, int, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_rank_v1(timestamptz, listing_status, text, text, text, int, int, boolean, int, numeric, timestamptz, uuid)
  set search_path = pg_catalog, public;

