-- Supabase security lint: pin function search_path explicitly (avoid "$user", ensure stable resolution).
-- We include extensions so pgcrypto helpers (e.g. gen_random_uuid/digest) remain resolvable if used.

alter function public.counter_offer_v0(uuid, integer, character, timestamp with time zone, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.connect_session_exchange_v1(uuid, text, text, text, text, text, text, text, text, timestamp with time zone)
  set search_path = pg_catalog, public, extensions;

alter function public.deals_search_tsv_update_v1()
  set search_path = pg_catalog, public, extensions;

alter function public.dispute_open_v0(uuid, uuid, text, text)
  set search_path = pg_catalog, public, extensions;

alter function public.dispute_resolve_v0(uuid, text, text, text)
  set search_path = pg_catalog, public, extensions;

alter function public.escrow_create_v0(uuid, uuid, integer)
  set search_path = pg_catalog, public, extensions;

alter function public.escrow_mark_confirmed_v0(uuid, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.escrow_mark_delivered_v0(uuid, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.escrow_mark_hold_v0(text, text, timestamp with time zone)
  set search_path = pg_catalog, public, extensions;

alter function public.escrow_mark_refunded_v0(text)
  set search_path = pg_catalog, public, extensions;

alter function public.escrow_mark_released_v0(text)
  set search_path = pg_catalog, public, extensions;

alter function public.escrow_set_payment_v0(uuid, uuid, text, text)
  set search_path = pg_catalog, public, extensions;

alter function public.escrow_set_release_pending_v0(uuid, text)
  set search_path = pg_catalog, public, extensions;

alter function public.listings_search_tsv_update_v1()
  set search_path = pg_catalog, public, extensions;

alter function public.offer_accept_v0(uuid, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.offer_cancel_v0(uuid, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.offer_decline_v0(uuid, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.offers_expire_v0(integer)
  set search_path = pg_catalog, public, extensions;

alter function public.resolve_approval(uuid, uuid, text, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.resolve_approval(uuid, uuid, text, uuid, text)
  set search_path = pg_catalog, public, extensions;

alter function public.transaction_mark_completed_v0(uuid, uuid)
  set search_path = pg_catalog, public, extensions;

alter function public.transaction_request_contact_reveal_v0(uuid, uuid, boolean)
  set search_path = pg_catalog, public, extensions;

alter function public.transactions_auto_complete_stale_v0(integer, integer)
  set search_path = pg_catalog, public, extensions;
