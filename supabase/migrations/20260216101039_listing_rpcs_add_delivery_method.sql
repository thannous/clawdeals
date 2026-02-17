-- Add delivery_method to all listing feed RPCs.
-- Must DROP first because return type is changing.

drop function if exists public.list_listings_geo_v1(double precision, double precision, int, boolean, int, double precision, uuid, text, text, text, int, int);
drop function if exists public.list_listings_recent_v1(listing_status, text, text, text, int, int, boolean, int, timestamptz, uuid);
drop function if exists public.list_listings_price_asc_v1(listing_status, text, text, text, int, int, boolean, int, int, uuid);
drop function if exists public.list_listings_price_desc_v1(listing_status, text, text, text, int, int, boolean, int, int, uuid);
drop function if exists public.list_listings_rank_v1(timestamptz, listing_status, text, text, text, int, int, boolean, int, numeric, timestamptz, uuid);

-- 1. list_listings_geo_v1
create function public.list_listings_geo_v1(
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
  delivery_method text,
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
      l.delivery_method,
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
    listing_id, title, category, condition, price_amount, currency, status,
    seller_agent_id, delivery_method, created_at, distance_m
  from base
  where (
    p_cursor_distance_m is null
    or p_cursor_listing_id is null
    or distance_m > p_cursor_distance_m
    or (distance_m = p_cursor_distance_m and listing_id > p_cursor_listing_id)
  )
  order by distance_m asc, listing_id asc
  limit (greatest(1, least(coalesce(p_limit, 50), 100)) + 1);
$$;

-- 2. list_listings_recent_v1
create function public.list_listings_recent_v1(
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
  delivery_method text,
  created_at timestamptz
)
language sql
stable
as $$
  with base as (
    select
      l.listing_id, l.title, l.category, l.condition, l.price_amount, l.currency,
      l.status, l.seller_agent_id, l.delivery_method, l.created_at
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
      and (p_q is null or btrim(p_q) = '' or l.search_tsv @@ websearch_to_tsquery('simple', p_q))
  )
  select listing_id, title, category, condition, price_amount, currency, status,
    seller_agent_id, delivery_method, created_at
  from base
  where (
    p_cursor_created_at is null
    or p_cursor_listing_id is null
    or (base.created_at, base.listing_id) < (p_cursor_created_at, p_cursor_listing_id)
  )
  order by created_at desc, listing_id desc
  limit greatest(1, least(coalesce(p_limit, 50), 101));
$$;

-- 3. list_listings_price_asc_v1
create function public.list_listings_price_asc_v1(
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
  delivery_method text,
  created_at timestamptz
)
language sql
stable
as $$
  with base as (
    select
      l.listing_id, l.title, l.category, l.condition, l.price_amount, l.currency,
      l.status, l.seller_agent_id, l.delivery_method, l.created_at
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
      and (p_q is null or btrim(p_q) = '' or l.search_tsv @@ websearch_to_tsquery('simple', p_q))
  )
  select listing_id, title, category, condition, price_amount, currency, status,
    seller_agent_id, delivery_method, created_at
  from base
  where (
    p_cursor_price_amount is null
    or p_cursor_listing_id is null
    or (
      base.price_amount > p_cursor_price_amount
      or (base.price_amount = p_cursor_price_amount and base.listing_id > p_cursor_listing_id)
    )
  )
  order by price_amount asc, listing_id asc
  limit greatest(1, least(coalesce(p_limit, 50), 101));
$$;

-- 4. list_listings_price_desc_v1
create function public.list_listings_price_desc_v1(
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
  delivery_method text,
  created_at timestamptz
)
language sql
stable
as $$
  with base as (
    select
      l.listing_id, l.title, l.category, l.condition, l.price_amount, l.currency,
      l.status, l.seller_agent_id, l.delivery_method, l.created_at
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
      and (p_q is null or btrim(p_q) = '' or l.search_tsv @@ websearch_to_tsquery('simple', p_q))
  )
  select listing_id, title, category, condition, price_amount, currency, status,
    seller_agent_id, delivery_method, created_at
  from base
  where (
    p_cursor_price_amount is null
    or p_cursor_listing_id is null
    or (
      base.price_amount < p_cursor_price_amount
      or (base.price_amount = p_cursor_price_amount and base.listing_id < p_cursor_listing_id)
    )
  )
  order by price_amount desc, listing_id desc
  limit greatest(1, least(coalesce(p_limit, 50), 101));
$$;

-- 5. list_listings_rank_v1
create function public.list_listings_rank_v1(
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
  delivery_method text,
  created_at timestamptz,
  rank_score numeric
)
language sql
stable
as $$
  with base as (
    select
      l.listing_id, l.title, l.category, l.condition, l.price_amount, l.currency,
      l.status, l.seller_agent_id, l.delivery_method, l.created_at,
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
      and (p_q is null or btrim(p_q) = '' or l.search_tsv @@ websearch_to_tsquery('simple', p_q))
  ),
  scored as (
    select
      listing_id, title, category, condition, price_amount, currency, status,
      seller_agent_id, delivery_method, created_at,
      round(
        100::numeric * 24
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
    listing_id, title, category, condition, price_amount, currency, status,
    seller_agent_id, delivery_method, created_at,
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

-- Pin search_path (include extensions for PostGIS in geo RPC).
alter function public.list_listings_geo_v1(double precision, double precision, int, boolean, int, double precision, uuid, text, text, text, int, int)
  set search_path = pg_catalog, public, extensions;

alter function public.list_listings_recent_v1(listing_status, text, text, text, int, int, boolean, int, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_price_asc_v1(listing_status, text, text, text, int, int, boolean, int, int, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_price_desc_v1(listing_status, text, text, text, int, int, boolean, int, int, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_rank_v1(timestamptz, listing_status, text, text, text, int, int, boolean, int, numeric, timestamptz, uuid)
  set search_path = pg_catalog, public;
