-- TI-333: track user_code brute-force attempts independently from authorization rows.

create table if not exists public.oauth_device_user_code_attempts (
  user_code_hash text primary key,
  attempt_count integer not null default 0,
  last_failed_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oauth_device_user_code_attempts_attempt_count_check check (attempt_count >= 0)
);

create index if not exists oauth_device_user_code_attempts_locked_until_idx
  on public.oauth_device_user_code_attempts (locked_until asc, user_code_hash asc)
  where locked_until is not null;
