-- TI-270: Remove legacy RPC overloads that cause PostgREST ambiguity.
--
-- Keep only the newest signatures:
-- - list_deals_new_v0(..., p_price_max, p_include_hidden, ...)
-- - list_deals_temp_v0(..., p_price_max, p_include_hidden, ...)
-- - list_deals_trend_v0(..., p_price_max, p_include_hidden, ...)
-- - list_listings_geo_v1(..., p_include_hidden, ...)

drop function if exists public.list_deals_new_v0(
  deal_status[],
  text,
  text[],
  numeric,
  integer,
  deal_status,
  timestamptz,
  uuid
);

drop function if exists public.list_deals_temp_v0(
  text,
  text[],
  numeric,
  integer,
  integer,
  integer,
  timestamptz,
  uuid
);

-- Legacy: no price_max
drop function if exists public.list_deals_trend_v0(
  timestamptz,
  text,
  text[],
  integer,
  integer,
  numeric,
  timestamptz,
  timestamptz,
  uuid
);

-- Legacy: price_max but no include_hidden
drop function if exists public.list_deals_trend_v0(
  timestamptz,
  text,
  text[],
  numeric,
  integer,
  integer,
  numeric,
  timestamptz,
  timestamptz,
  uuid
);

drop function if exists public.list_listings_geo_v1(
  double precision,
  double precision,
  integer,
  integer,
  double precision,
  uuid,
  text,
  text,
  text,
  integer,
  integer
);

-- Trigger schema cache refresh for PostgREST.
select pg_notify('pgrst', 'reload schema');

