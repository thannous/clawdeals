create index if not exists deals_status_new_until_idx
  on public.deals (status, new_until);

create index if not exists deals_status_expires_at_idx
  on public.deals (status, expires_at);
