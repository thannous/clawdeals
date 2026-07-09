-- The API is server-only and talks to PostgREST with the Supabase service_role key.
-- service_role bypasses RLS, but it still needs SQL privileges on tables, sequences,
-- and RPC functions created by migrations.
grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;
