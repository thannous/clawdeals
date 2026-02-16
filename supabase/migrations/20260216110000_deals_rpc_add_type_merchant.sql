-- Add deal_type, country, merchant_name, merchant_domain to all deal feed RPCs.
-- These columns were added to the deals table but not to the RPC return types.
-- Must DROP first because return type is changing (cannot use CREATE OR REPLACE).

drop function if exists public.list_deals_new_v0(deal_status[], text, text[], numeric, boolean, int, deal_status, timestamptz, uuid);
drop function if exists public.list_deals_temp_v0(text, text[], numeric, boolean, int, int, int, timestamptz, uuid);
drop function if exists public.list_deals_trend_v0(timestamptz, text, text[], numeric, boolean, int, int, numeric, timestamptz, timestamptz, uuid);

-- 1. list_deals_new_v0
create function public.list_deals_new_v0(
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
  deal_type text,
  country char(2),
  merchant_name text,
  merchant_domain text,
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
      d.deal_type,
      d.country,
      d.merchant_name,
      d.merchant_domain,
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
    deal_type,
    country,
    merchant_name,
    merchant_domain,
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
  limit greatest(1, least(coalesce(p_limit, 30), 101));
$$;

-- 2. list_deals_temp_v0
create function public.list_deals_temp_v0(
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
  deal_type text,
  country char(2),
  merchant_name text,
  merchant_domain text,
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
      d.deal_type,
      d.country,
      d.merchant_name,
      d.merchant_domain,
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
    deal_type,
    country,
    merchant_name,
    merchant_domain,
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
  limit greatest(1, least(coalesce(p_limit, 30), 101));
$$;

-- 3. list_deals_trend_v0
create function public.list_deals_trend_v0(
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
  deal_type text,
  country char(2),
  merchant_name text,
  merchant_domain text,
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
      d.deal_type,
      d.country,
      d.merchant_name,
      d.merchant_domain,
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
      deal_type,
      country,
      merchant_name,
      merchant_domain,
      created_at,
      active_at,
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
    deal_type,
    country,
    merchant_name,
    merchant_domain,
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
  limit greatest(1, least(coalesce(p_limit, 30), 101));
$$;

-- Pin search_path.
alter function public.list_deals_new_v0(deal_status[], text, text[], numeric, boolean, int, deal_status, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_deals_temp_v0(text, text[], numeric, boolean, int, int, int, timestamptz, uuid)
  set search_path = pg_catalog, public;

alter function public.list_deals_trend_v0(timestamptz, text, text[], numeric, boolean, int, int, numeric, timestamptz, timestamptz, uuid)
  set search_path = pg_catalog, public;
