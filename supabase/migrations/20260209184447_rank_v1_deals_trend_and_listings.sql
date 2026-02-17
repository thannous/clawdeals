-- Ranking v1 RPCs with stable ordering and keyset cursor semantics.
--
-- Deals:
-- - trend ranking v1 drops active_at from ORDER BY + cursor (still used in score calculation).
-- - Clients MUST keep p_as_of constant across pages for stable pagination.
--
-- Listings:
-- - rank RPC supports: recent, price_asc, price_desc.
-- - Adds moderation_states hidden filter (same semantics as feed RPCs).

create extension if not exists pgcrypto;

-- Deals trend ranking v1: stable total ordering = (trend_score desc, created_at desc, deal_id desc).
create or replace function public.list_deals_trend_v1(
  p_as_of timestamptz,
  p_q text default null,
  p_tags text[] default null,
  p_price_max numeric default null,
  p_include_hidden boolean default false,
  p_min_temperature int default 0,
  p_limit int default 30,
  p_cursor_trend_score numeric default null,
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
    or p_cursor_created_at is null
    or p_cursor_deal_id is null
    or (
      base.trend_score < p_cursor_trend_score
      or (base.trend_score = p_cursor_trend_score and base.created_at < p_cursor_created_at)
      or (
        base.trend_score = p_cursor_trend_score
        and base.created_at = p_cursor_created_at
        and base.deal_id < p_cursor_deal_id
      )
    )
  )
  order by trend_score desc, created_at desc, deal_id desc
  limit greatest(1, least(coalesce(p_limit, 30), 101)); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

-- Listings recent sort v1: stable total ordering = (created_at desc, listing_id desc).
create or replace function public.list_listings_recent_v1(
  p_status listing_status default 'LIVE',
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
  where (p_status is null or l.status = p_status)
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
      p_cursor_created_at is null
      or p_cursor_listing_id is null
      or (l.created_at, l.listing_id) < (p_cursor_created_at, p_cursor_listing_id)
    )
  order by l.created_at desc, l.listing_id desc
  limit (greatest(1, least(coalesce(p_limit, 50), 100)) + 1); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

-- Listings price asc v1: stable total ordering = (price_amount asc, listing_id asc).
create or replace function public.list_listings_price_asc_v1(
  p_status listing_status default 'LIVE',
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
  where (p_status is null or l.status = p_status)
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
      p_cursor_price_amount is null
      or p_cursor_listing_id is null
      or l.price_amount > p_cursor_price_amount
      or (l.price_amount = p_cursor_price_amount and l.listing_id > p_cursor_listing_id)
    )
  order by l.price_amount asc, l.listing_id asc
  limit (greatest(1, least(coalesce(p_limit, 50), 100)) + 1); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

-- Listings price desc v1: stable total ordering = (price_amount desc, listing_id desc).
create or replace function public.list_listings_price_desc_v1(
  p_status listing_status default 'LIVE',
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
  where (p_status is null or l.status = p_status)
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
      p_cursor_price_amount is null
      or p_cursor_listing_id is null
      or l.price_amount < p_cursor_price_amount
      or (l.price_amount = p_cursor_price_amount and l.listing_id < p_cursor_listing_id)
    )
  order by l.price_amount desc, l.listing_id desc
  limit (greatest(1, least(coalesce(p_limit, 50), 100)) + 1); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

-- Listings rank v1: stable total ordering = (rank_score desc, created_at desc, listing_id desc).
--
-- rank_score is explainable + deterministic:
-- - recency decay (24h): (d / (d + age_hours)) * 100
-- - trust multiplier (bands + quarantined penalty)
-- - optional price fit bonus, using p_price_max as the target max when provided
-- Hidden rows are excluded by default; when included, they are forced to the end via a large negative score.
create or replace function public.list_listings_rank_v1(
  p_as_of timestamptz,
  p_status listing_status default 'LIVE',
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
      coalesce(a.trust_score, 50)::int as seller_trust_score,
      coalesce(a.trust_flags, '[]'::jsonb) as seller_trust_flags,
      exists (
        select 1
        from public.moderation_states ms
        where ms.entity_type = 'listing'::public.report_entity_type
          and ms.entity_id = l.listing_id
          and ms.hidden
      ) as hidden
    from public.listings l
    left join public.agents a on a.id = l.seller_agent_id
    where (p_status is null or l.status = p_status)
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
      base.*,
      -- Recency: (d / (d + age_hours)) in [0..1], then scaled to ~[0..100]
      round(
        (24::numeric)
          / (24 + greatest(extract(epoch from (p_as_of - base.created_at)) / 3600.0, 0)::numeric),
        6
      ) as recency_norm,
      round(
        (
          case
            when base.seller_trust_score >= 70 then 1.15
            when base.seller_trust_score >= 40 then 1.0
            else 0.85
          end
          * case
              when base.seller_trust_flags ? 'quarantined' then 0.6
              else 1.0
            end
        )::numeric,
        6
      ) as trust_mult,
      case
        when p_price_max is null or p_price_max <= 0 then 0::numeric
        else round(
          least(
            greatest(
              ((p_price_max - base.price_amount)::numeric / nullif(p_price_max::numeric, 0)),
              0
            ),
            1
          ) * 10,
          6
        )
      end as price_bonus
    from base
  ),
  output as (
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
      case
        when hidden then (-1000000000000::numeric)
        else round(((recency_norm * 100) * trust_mult + price_bonus), 6)
      end as rank_score,
      hidden
    from scored
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
    rank_score
  from output
  where (
    p_include_hidden
    or hidden = false
  )
  and (
    p_cursor_rank_score is null
    or p_cursor_created_at is null
    or p_cursor_listing_id is null
    or (
      rank_score < p_cursor_rank_score
      or (rank_score = p_cursor_rank_score and created_at < p_cursor_created_at)
      or (rank_score = p_cursor_rank_score and created_at = p_cursor_created_at and listing_id < p_cursor_listing_id)
    )
  )
  order by rank_score desc, created_at desc, listing_id desc
  limit (greatest(1, least(coalesce(p_limit, 50), 100)) + 1); -- allow (MAX_LIMIT + 1) fetch for cursor pagination
$$;

-- Supabase security lint: pin function search_path explicitly.
alter function public.list_deals_trend_v1(timestamptz, text, text[], numeric, boolean, int, int, numeric, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_recent_v1(listing_status, text, text, text, int, int, boolean, int, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_price_asc_v1(listing_status, text, text, text, int, int, boolean, int, int, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_price_desc_v1(listing_status, text, text, text, int, int, boolean, int, int, uuid)
  set search_path = pg_catalog, public;

alter function public.list_listings_rank_v1(timestamptz, listing_status, text, text, text, int, int, boolean, int, numeric, timestamptz, uuid)
  set search_path = pg_catalog, public;
