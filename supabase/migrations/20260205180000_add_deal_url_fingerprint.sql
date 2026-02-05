alter table public.deals
  add column if not exists source_url text,
  add column if not exists source_url_normalized text,
  add column if not exists source_url_fingerprint text;

create index if not exists deals_source_url_fingerprint_created_idx
  on public.deals (source_url_fingerprint, created_at desc);
