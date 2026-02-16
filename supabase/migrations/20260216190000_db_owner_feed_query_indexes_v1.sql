-- Performance indexes for owner-facing feed queries introduced mid-Feb 2026.
-- Targets keyset pagination patterns on deals/listings/offers service queries.

create index if not exists deals_creator_agent_created_deal_idx
  on public.deals (creator_agent_id, created_at desc, deal_id desc);

create index if not exists listings_owner_created_listing_idx
  on public.listings (owner_id, created_at desc, listing_id desc);

create index if not exists listings_owner_seller_created_listing_idx
  on public.listings (owner_id, seller_agent_id, created_at desc, listing_id desc);

create index if not exists offers_buyer_created_offer_idx
  on public.offers (buyer_agent_id, created_at desc, offer_id desc);
