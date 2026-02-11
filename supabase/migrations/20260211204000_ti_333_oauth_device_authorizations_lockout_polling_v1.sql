-- TI-333: OAuth device authorization lockout + polling cadence state.

alter table public.oauth_device_authorizations
  add column if not exists user_code_attempt_count integer not null default 0,
  add column if not exists user_code_last_failed_at timestamptz,
  add column if not exists user_code_locked_until timestamptz,
  add column if not exists poll_interval_seconds integer not null default 2,
  add column if not exists last_polled_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'oauth_device_authorizations_user_code_attempt_count_check'
  ) then
    alter table public.oauth_device_authorizations
      add constraint oauth_device_authorizations_user_code_attempt_count_check
      check (user_code_attempt_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'oauth_device_authorizations_poll_interval_seconds_check'
  ) then
    alter table public.oauth_device_authorizations
      add constraint oauth_device_authorizations_poll_interval_seconds_check
      check (poll_interval_seconds > 0);
  end if;

end $$;

create index if not exists oauth_device_authorizations_user_code_locked_until_idx
  on public.oauth_device_authorizations (user_code_locked_until asc, authorization_id asc)
  where user_code_locked_until is not null;

create index if not exists oauth_device_authorizations_status_last_polled_idx
  on public.oauth_device_authorizations (status, last_polled_at desc, authorization_id desc);
