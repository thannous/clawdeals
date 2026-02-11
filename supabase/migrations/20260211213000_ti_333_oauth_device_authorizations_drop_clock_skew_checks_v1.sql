-- TI-333: remove time ordering checks that can fail under app/db clock skew.

alter table public.oauth_device_authorizations
  drop constraint if exists oauth_device_authorizations_user_code_last_failed_after_created_check,
  drop constraint if exists oauth_device_authorizations_user_code_locked_after_created_check,
  drop constraint if exists oauth_device_authorizations_last_polled_after_created_check;
