create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_status') then
    create type deal_status as enum ('NEW', 'ACTIVE', 'EXPIRED', 'REMOVED');
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'deals'
      and column_name = 'id'
  ) then
    alter table public.deals rename column id to deal_id;
  end if;
end $$;

alter table public.deals
  alter column status drop default;

alter table public.deals
  alter column status type deal_status
  using (
    case
      when status is null then 'NEW'
      when lower(status) = 'open' then 'NEW'
      when upper(status) in ('NEW', 'ACTIVE', 'EXPIRED', 'REMOVED') then upper(status)
      else 'NEW'
    end
  )::deal_status;

alter table public.deals
  alter column status set default 'NEW';

alter table public.deals
  add column if not exists source_url text,
  add column if not exists source_url_normalized text,
  add column if not exists source_url_fingerprint text,
  add column if not exists price numeric(12,2),
  add column if not exists currency char(3),
  add column if not exists expires_at timestamptz,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists new_until timestamptz,
  add column if not exists active_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists temperature int,
  add column if not exists votes_up int not null default 0,
  add column if not exists votes_down int not null default 0,
  add column if not exists votes_weighted_up numeric not null default 0,
  add column if not exists votes_weighted_down numeric not null default 0,
  add column if not exists reasons_count int not null default 0,
  add column if not exists creator_agent_id uuid,
  add column if not exists updated_at timestamptz not null default now();

update public.deals
set
  source_url = coalesce(source_url, 'https://example.invalid/deals/' || deal_id),
  source_url_normalized = coalesce(
    source_url_normalized,
    lower(coalesce(source_url, 'https://example.invalid/deals/' || deal_id))
  ),
  source_url_fingerprint = coalesce(
    source_url_fingerprint,
    encode(
      digest(
        coalesce(
          source_url_normalized,
          lower(coalesce(source_url, 'https://example.invalid/deals/' || deal_id))
        ),
        'sha256'
      ),
      'hex'
    )
  ),
  price = coalesce(price, 1),
  currency = coalesce(currency, 'EUR'),
  expires_at = coalesce(expires_at, created_at + interval '1 day'),
  new_until = coalesce(new_until, created_at + interval '10 minutes'),
  creator_agent_id = coalesce(
    creator_agent_id,
    case
      when agent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then agent_id::uuid
      else null
    end,
    gen_random_uuid()
  ),
  updated_at = coalesce(updated_at, created_at);

alter table public.deals
  alter column source_url set not null,
  alter column source_url_normalized set not null,
  alter column source_url_fingerprint set not null,
  alter column price set not null,
  alter column currency set not null,
  alter column expires_at set not null,
  alter column new_until set not null,
  alter column creator_agent_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deals_expires_at_check'
  ) then
    alter table public.deals
      add constraint deals_expires_at_check
      check (expires_at > created_at and expires_at <= created_at + interval '30 days');
  end if;
end $$;

create index if not exists deals_status_created_idx
  on public.deals (status, created_at desc);

create index if not exists deals_status_temperature_idx
  on public.deals (status, temperature desc, created_at desc);

create index if not exists deals_tags_gin_idx
  on public.deals using gin (tags);

create index if not exists deals_source_url_fingerprint_idx
  on public.deals (source_url_fingerprint, created_at desc);

alter table public.deals
  drop column if exists description,
  drop column if exists owner_id,
  drop column if exists agent_id;

alter table public.listings
  drop constraint if exists listings_deal_id_fkey;

alter table public.listings
  add constraint listings_deal_id_fkey
  foreign key (deal_id)
  references public.deals (deal_id)
  on delete set null;
