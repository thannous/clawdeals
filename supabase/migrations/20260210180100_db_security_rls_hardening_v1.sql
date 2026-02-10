-- Security hardening: enforce FORCE RLS on app tables where it was missing.
--
-- Note: Supabase-managed extension tables in `public` (e.g. PostGIS `spatial_ref_sys`) are
-- owned by `supabase_admin` and cannot be altered by this project's migration role.
-- Our security posture is server-only DB access; `anon`/`authenticated` privileges are revoked
-- in `20260210180300_db_security_harden_public_grants_v1.sql`.

alter table public.channel_identities enable row level security;
alter table public.channel_identities force row level security;

alter table public.pairing_tokens enable row level security;
alter table public.pairing_tokens force row level security;
