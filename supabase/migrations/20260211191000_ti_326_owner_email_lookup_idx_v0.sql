-- TI-326: Speed up owner lookups by normalized email.
-- Note: uniqueness is enforced separately via owners_email_unique_idx on lower(email).

create index if not exists owners_email_lookup_idx
  on public.owners (email)
  where email is not null;

