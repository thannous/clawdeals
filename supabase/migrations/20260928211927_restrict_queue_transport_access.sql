-- Historical best-effort revocation, applied on 2026-09-28.
-- Hosted Supabase owns these objects as supabase_admin. Its PUBLIC grants
-- remained in place after this migration; success does not prove revocation.
-- The verified boundary is net absent from Data API exposed schemas, NOLOGIN
-- client roles, and no client-executable RPC exposing transport objects.
-- See docs/queue-event-dispatch.md before changing extension privileges.
-- pg_net stores the dedicated wake credential in request headers until delivery.
revoke usage on schema net from public, anon, authenticated;
revoke all on all tables in schema net from public, anon, authenticated;
revoke execute on all functions in schema net from public, anon, authenticated;
