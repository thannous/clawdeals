create index if not exists deals_status_active_at_idx
  on public.deals (status, active_at desc, created_at desc);

create or replace function public.list_deals_new_v0(
  p_statuses deal_status[] default array['NEW', 'ACTIVE']::deal_status[],
  p_q text default null,
  p_tags text[] default null,
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
        or p_q = ''
        or d.title ilike (
          '%' ||
          replace(replace(replace(p_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') ||
          '%'
        ) escape E'\\'
      )
      and (p_tags is null or array_length(p_tags, 1) is null or d.tags @> p_tags)
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
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.list_deals_temp_v0(
  p_q text default null,
  p_tags text[] default null,
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
        or p_q = ''
        or d.title ilike (
          '%' ||
          replace(replace(replace(p_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') ||
          '%'
        ) escape E'\\'
      )
      and (p_tags is null or array_length(p_tags, 1) is null or d.tags @> p_tags)
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
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.list_deals_trend_v0(
  p_as_of timestamptz,
  p_q text default null,
  p_tags text[] default null,
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
        or p_q = ''
        or d.title ilike (
          '%' ||
          replace(replace(replace(p_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') ||
          '%'
        ) escape E'\\'
      )
      and (p_tags is null or array_length(p_tags, 1) is null or d.tags @> p_tags)
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
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;
