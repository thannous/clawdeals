-- Supabase advisor fixes (safe/idempotent)
-- - Add missing FK indexes
-- - Remove duplicate index reported by advisor

create index if not exists oauth_refresh_tokens_agent_id_idx
  on public.oauth_refresh_tokens (agent_id)
  where agent_id is not null;

create index if not exists oauth_refresh_tokens_rotated_from_token_id_idx
  on public.oauth_refresh_tokens (rotated_from_token_id)
  where rotated_from_token_id is not null;

create index if not exists risk_rule_state_agent_id_idx
  on public.risk_rule_state (agent_id);

create index if not exists staged_commands_approval_id_idx
  on public.staged_commands (approval_id)
  where approval_id is not null;

create index if not exists staged_commands_channel_identity_id_idx
  on public.staged_commands (channel_identity_id)
  where channel_identity_id is not null;

drop index if exists public.owner_auth_links_supabase_user_id_idx;
