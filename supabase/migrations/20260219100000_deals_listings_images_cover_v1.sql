alter table public.deals
  add column if not exists images jsonb,
  add column if not exists cover_image_index int;

alter table public.listings
  add column if not exists cover_image_index int;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deals_cover_image_index_range_check'
  ) then
    alter table public.deals
      add constraint deals_cover_image_index_range_check
      check (cover_image_index is null or (cover_image_index >= 0 and cover_image_index <= 7));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listings_cover_image_index_range_check'
  ) then
    alter table public.listings
      add constraint listings_cover_image_index_range_check
      check (cover_image_index is null or (cover_image_index >= 0 and cover_image_index <= 7));
  end if;
end $$;
