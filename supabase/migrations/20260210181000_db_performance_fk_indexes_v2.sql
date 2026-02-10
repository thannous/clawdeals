-- Add missing FK indexes (Supabase performance advisor: unindexed_foreign_keys)

create index if not exists connect_sessions_installation_id_idx
  on public.connect_sessions (installation_id)
  where installation_id is not null;

create index if not exists notification_preferences_channel_identity_id_idx
  on public.notification_preferences (channel_identity_id)
  where channel_identity_id is not null;

create index if not exists oauth_device_authorizations_agent_id_idx
  on public.oauth_device_authorizations (agent_id)
  where agent_id is not null;

