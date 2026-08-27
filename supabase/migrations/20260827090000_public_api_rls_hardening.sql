-- Keep internal OAuth lockout state and queue workers inaccessible through the
-- public Data API. These objects are service-role implementation details.

alter table public.oauth_device_user_code_attempts enable row level security;

revoke all on table public.oauth_device_user_code_attempts
  from anon, authenticated;

revoke execute on function public.enqueue_watchlist_match_queue_v1()
  from public, anon, authenticated;
