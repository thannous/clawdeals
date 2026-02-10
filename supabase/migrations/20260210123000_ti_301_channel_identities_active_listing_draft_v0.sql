-- TI-301: Store active draft listing per channel identity (Telegram attachments pipeline)

alter table public.channel_identities
  add column if not exists active_listing_draft_id uuid references public.listings(listing_id) on delete set null,
  add column if not exists active_listing_draft_updated_at timestamptz;

create index if not exists channel_identities_active_listing_idx
  on public.channel_identities (active_listing_draft_id);

