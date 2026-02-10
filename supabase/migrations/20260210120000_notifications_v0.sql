create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_mode_enum') then
    create type notification_mode_enum as enum ('REALTIME', 'DIGEST_HOURLY', 'DIGEST_DAILY', 'SILENT');
  end if;
end $$;

create table if not exists public.notification_preferences (
  owner_id uuid primary key references public.owners(owner_id) on delete cascade,
  channel_type channel_type_enum not null default 'telegram',
  channel_identity_id uuid references public.channel_identities(channel_identity_id) on delete set null,
  mode notification_mode_enum not null default 'DIGEST_HOURLY',
  timezone text not null default 'UTC',
  quiet_enabled boolean not null default false,
  quiet_start_min smallint,
  quiet_end_min smallint,
  event_types text[] not null default '{watchlist_match}'::text[],
  filters jsonb not null default '{}'::jsonb,
  daily_digest_hour smallint not null default 9,
  last_hourly_digest_at timestamptz,
  last_daily_digest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notification_preferences_quiet_start_check') then
    alter table public.notification_preferences
      add constraint notification_preferences_quiet_start_check
      check (quiet_start_min is null or (quiet_start_min >= 0 and quiet_start_min <= 1439));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notification_preferences_quiet_end_check') then
    alter table public.notification_preferences
      add constraint notification_preferences_quiet_end_check
      check (quiet_end_min is null or (quiet_end_min >= 0 and quiet_end_min <= 1439));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notification_preferences_daily_hour_check') then
    alter table public.notification_preferences
      add constraint notification_preferences_daily_hour_check
      check (daily_digest_hour >= 0 and daily_digest_hour <= 23);
  end if;
end $$;

create index if not exists notification_preferences_owner_idx
  on public.notification_preferences (owner_id);

create index if not exists notification_preferences_channel_idx
  on public.notification_preferences (channel_type, channel_identity_id);

create table if not exists public.notification_outbox (
  notification_outbox_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.owners(owner_id) on delete cascade,
  channel_type channel_type_enum not null default 'telegram',
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  status text not null default 'PENDING',
  delivered_at timestamptz,
  attempt_count int not null default 0,
  last_error text
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notification_outbox_status_check') then
    alter table public.notification_outbox
      add constraint notification_outbox_status_check
      check (status in ('PENDING', 'DELIVERED', 'SUPPRESSED'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notification_outbox_attempt_count_check') then
    alter table public.notification_outbox
      add constraint notification_outbox_attempt_count_check
      check (attempt_count >= 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notification_outbox_entity_type_check') then
    alter table public.notification_outbox
      add constraint notification_outbox_entity_type_check
      check (entity_type in ('deal', 'listing'));
  end if;
end $$;

create unique index if not exists notification_outbox_dedupe_idx
  on public.notification_outbox (owner_id, channel_type, event_type, entity_type, entity_id);

create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, occurred_at asc, notification_outbox_id asc);

create index if not exists notification_outbox_owner_pending_idx
  on public.notification_outbox (owner_id, status, occurred_at asc, notification_outbox_id asc);

alter table public.notification_preferences enable row level security;
alter table public.notification_preferences force row level security;

alter table public.notification_outbox enable row level security;
alter table public.notification_outbox force row level security;

drop policy if exists deny_all_anon_authenticated on public.notification_preferences;
create policy deny_all_anon_authenticated
on public.notification_preferences
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_all_anon_authenticated on public.notification_outbox;
create policy deny_all_anon_authenticated
on public.notification_outbox
for all
to anon, authenticated
using (false)
with check (false);

