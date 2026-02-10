-- Security hardening: reduce the blast radius of any accidental RLS misconfiguration.
--
-- This project posture is "server-only DB access": the app uses service_role on the server and
-- denies direct PostgREST table access. We therefore remove default and existing privileges for
-- anon/authenticated on public schema objects.

-- Existing objects.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;

-- Future objects (default privileges).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- Note: `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ...` requires `supabase_admin` (superuser)
-- and can't be executed from our migrations. If `supabase_admin` creates new objects in `public`
-- (e.g. via extensions installed in `public`), re-run the revokes above or prefer installing
-- extensions into the `extensions` schema.
