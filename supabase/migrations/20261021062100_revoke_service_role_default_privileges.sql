-- Reverses the table and sequence default privileges that
-- 20260708221322_service_role_public_grants.sql set for objects that
-- `postgres` creates in `public`. From 2026-10-30 Supabase revokes them in
-- production; this keeps local databases the same, so a new table without an
-- explicit grant fails locally too (see scripts/lint-migration-grants.mjs).
-- Default privileges only apply to future objects: every existing table and
-- sequence keeps the grants it already has.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from service_role;
