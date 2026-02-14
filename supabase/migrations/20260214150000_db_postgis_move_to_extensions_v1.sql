-- Move PostGIS out of public schema to satisfy security advisor.
-- WARNING: this drops PostGIS-dependent objects, then recreates required app objects.

create schema if not exists extensions;

drop extension if exists postgis cascade;
create extension if not exists postgis schema extensions;

alter table public.listings
  add column if not exists geo_point geography(Point, 4326)
  generated always as (
    case
      when geo_lat is not null and geo_lng is not null
        then st_setsrid(st_makepoint(geo_lng, geo_lat), 4326)::geography
      else null
    end
  ) stored;

create index if not exists listings_geo_point_gist_idx
  on public.listings
  using gist (geo_point)
  where geo_point is not null;
