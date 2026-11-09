-- Distance search must use the same approximate seller position exposed by
-- listing detail. Exact geography in distance, sorting or radius membership
-- lets callers triangulate the seller even when the coordinate field is rounded.
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
  delivery_method text,
  created_at timestamptz,
  distance_m double precision
)
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  with rounded as (
    select
      l.listing_id, l.title, l.category, l.condition, l.price_amount,
      l.currency, l.status, l.seller_agent_id, l.delivery_method,
      l.created_at,
      st_setsrid(st_makepoint(
        floor(l.geo_lng * 100 + 0.5) / 100,
        floor(l.geo_lat * 100 + 0.5) / 100
      ), 4326)::geography as public_geo_point
    from public.listings l
    left join public.moderation_states ms
      on ms.entity_type = 'listing'::public.report_entity_type
      and ms.entity_id = l.listing_id
    where l.status = 'LIVE'
      and l.geo_point is not null
      and l.geo_lat is not null
      and l.geo_lng is not null
      and (coalesce(p_include_hidden, false) or coalesce(ms.hidden, false) = false)
      and (p_category is null or l.category = p_category)
      and (p_condition is null or l.condition = p_condition)
      and (p_price_min is null or l.price_amount >= p_price_min)
      and (p_price_max is null or l.price_amount <= p_price_max)
      and (p_q is null or btrim(p_q) = '' or l.search_tsv @@ websearch_to_tsquery('simple', p_q))
      -- A one-kilometre margin safely covers two-decimal rounding while
      -- retaining the existing spatial-index prefilter. The final radius
      -- decision below uses only the rounded point.
      and (p_distance_km is null or st_dwithin(
        l.geo_point,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        (p_distance_km + 1) * 1000
      ))
  ), base as (
    select
      listing_id, title, category, condition, price_amount, currency,
      status, seller_agent_id, delivery_method, created_at,
      st_distance(public_geo_point, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m
    from rounded
    where p_distance_km is null
      or st_dwithin(public_geo_point, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_distance_km * 1000)
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
