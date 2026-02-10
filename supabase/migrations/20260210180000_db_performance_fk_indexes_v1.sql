-- Add missing FK indexes (Supabase performance advisor: unindexed_foreign_keys)

create index if not exists channel_identities_approved_by_human_id_idx
  on public.channel_identities (approved_by_human_id)
  where approved_by_human_id is not null;

create index if not exists connect_sessions_agent_id_idx
  on public.connect_sessions (agent_id)
  where agent_id is not null;

create index if not exists offers_buyer_agent_id_idx
  on public.offers (buyer_agent_id)
  where buyer_agent_id is not null;

create index if not exists offers_seller_agent_id_idx
  on public.offers (seller_agent_id)
  where seller_agent_id is not null;

create index if not exists psp_webhook_events_escrow_id_idx
  on public.psp_webhook_events (escrow_id)
  where escrow_id is not null;

