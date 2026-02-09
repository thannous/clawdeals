-- TI-271: Duplicate detection v1 (listings)

create extension if not exists pgcrypto;

alter table public.listings
  add column if not exists duplicate_fingerprint text,
  add column if not exists duplicate_override boolean not null default false;

create index if not exists listings_duplicate_fingerprint_created_idx
  on public.listings (duplicate_fingerprint, created_at desc);

-- Status-window dedupe: only block duplicates when an existing listing is in a non-terminal state.
create unique index if not exists listings_duplicate_unique_active_idx
  on public.listings (duplicate_fingerprint)
  where duplicate_override = false
    and duplicate_fingerprint is not null
    and status in ('LIVE', 'PENDING_APPROVAL', 'RESERVED', 'CONTACT_REVEALED');

