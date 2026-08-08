-- Add a provider-neutral identity key while preserving every Supabase link.
-- This is additive and rollback-safe: existing callers can continue to use
-- supabase_user_id until Neon Auth has been validated and switched on.

alter table public.owner_auth_links
  add column if not exists auth_provider text,
  add column if not exists auth_subject text;

update public.owner_auth_links
set
  auth_provider = coalesce(auth_provider, 'supabase'),
  auth_subject = coalesce(auth_subject, supabase_user_id::text)
where auth_provider is null or auth_subject is null;

-- Keep the new columns nullable during coexistence so rolling back to the old
-- application remains possible. New code always writes both columns, while a
-- later validation migration can enforce NOT NULL after the rollback window.
alter table public.owner_auth_links
  alter column supabase_user_id drop not null;

alter table public.owner_auth_links
  drop constraint if exists owner_auth_links_auth_provider_format_check;

alter table public.owner_auth_links
  add constraint owner_auth_links_auth_provider_format_check
  check (auth_provider ~ '^[a-z][a-z0-9_-]{1,31}$');

alter table public.owner_auth_links
  drop constraint if exists owner_auth_links_auth_subject_nonempty_check;

alter table public.owner_auth_links
  add constraint owner_auth_links_auth_subject_nonempty_check
  check (length(btrim(auth_subject)) between 1 and 255);

alter table public.owner_auth_links
  drop constraint if exists owner_auth_links_supabase_identity_check;

alter table public.owner_auth_links
  add constraint owner_auth_links_supabase_identity_check
  check (auth_provider <> 'supabase' or supabase_user_id is not null);

create unique index if not exists owner_auth_links_provider_subject_key
  on public.owner_auth_links (auth_provider, auth_subject)
  where auth_provider is not null and auth_subject is not null;

comment on column public.owner_auth_links.auth_provider is
  'External auth provider key, initially supabase and later neon.';

comment on column public.owner_auth_links.auth_subject is
  'Opaque provider user subject. Never derive authorization from mutable profile metadata.';
