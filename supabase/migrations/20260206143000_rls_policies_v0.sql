-- Clawdeals v0 RLS policy set (Linear: TI-154/TI-170/TI-171/TI-176/TI-177/TI-181/TI-183/TI-175)
--
-- v0 architecture is API-first (agents authenticate via API keys; owners via API surface).
-- The Next.js API uses the Supabase service role key, which bypasses RLS.
--
-- These policies make the default posture explicit: direct access via PostgREST
-- as `anon`/`authenticated` is denied for all v0 tables. This removes Supabase
-- "RLS enabled, no policy" security warnings without changing runtime behavior.

-- Note: policy names are scoped per-table; we can reuse the same name safely.

-- Agents
drop policy if exists deny_all_anon_authenticated on public.agents;
create policy deny_all_anon_authenticated
on public.agents
for all
to anon, authenticated
using (false)
with check (false);

-- API keys (sensitive)
drop policy if exists deny_all_anon_authenticated on public.api_keys;
create policy deny_all_anon_authenticated
on public.api_keys
for all
to anon, authenticated
using (false)
with check (false);

-- Deals (public via API, not via direct DB access in v0)
drop policy if exists deny_all_anon_authenticated on public.deals;
create policy deny_all_anon_authenticated
on public.deals
for all
to anon, authenticated
using (false)
with check (false);

-- Votes
drop policy if exists deny_all_anon_authenticated on public.deal_votes;
create policy deny_all_anon_authenticated
on public.deal_votes
for all
to anon, authenticated
using (false)
with check (false);

-- Policies (owner-scoped, sensitive)
drop policy if exists deny_all_anon_authenticated on public.policies;
create policy deny_all_anon_authenticated
on public.policies
for all
to anon, authenticated
using (false)
with check (false);

-- Approvals queue (owner-scoped, sensitive)
drop policy if exists deny_all_anon_authenticated on public.approvals;
create policy deny_all_anon_authenticated
on public.approvals
for all
to anon, authenticated
using (false)
with check (false);

-- Owners (PII)
drop policy if exists deny_all_anon_authenticated on public.owners;
create policy deny_all_anon_authenticated
on public.owners
for all
to anon, authenticated
using (false)
with check (false);

-- Owner verification challenges (token hashes)
drop policy if exists deny_all_anon_authenticated on public.owner_verification_challenges;
create policy deny_all_anon_authenticated
on public.owner_verification_challenges
for all
to anon, authenticated
using (false)
with check (false);

-- Idempotency keys (payloads/responses)
drop policy if exists deny_all_anon_authenticated on public.idempotency_keys;
create policy deny_all_anon_authenticated
on public.idempotency_keys
for all
to anon, authenticated
using (false)
with check (false);

-- Audit logs (sensitive)
drop policy if exists deny_all_anon_authenticated on public.audit_logs;
create policy deny_all_anon_authenticated
on public.audit_logs
for all
to anon, authenticated
using (false)
with check (false);

-- Audit log partitions are separate tables for the linter; keep them explicit.
drop policy if exists deny_all_anon_authenticated on public.audit_logs_2026_02;
create policy deny_all_anon_authenticated
on public.audit_logs_2026_02
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_all_anon_authenticated on public.audit_logs_2026_03;
create policy deny_all_anon_authenticated
on public.audit_logs_2026_03
for all
to anon, authenticated
using (false)
with check (false);

-- Listings / threads / messages (Phase 3, but tables exist; keep locked down)
drop policy if exists deny_all_anon_authenticated on public.listings;
create policy deny_all_anon_authenticated
on public.listings
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_all_anon_authenticated on public.threads;
create policy deny_all_anon_authenticated
on public.threads
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_all_anon_authenticated on public.messages;
create policy deny_all_anon_authenticated
on public.messages
for all
to anon, authenticated
using (false)
with check (false);

-- Reports / moderation (anti-abuse, sensitive)
drop policy if exists deny_all_anon_authenticated on public.reports;
create policy deny_all_anon_authenticated
on public.reports
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists deny_all_anon_authenticated on public.moderation_states;
create policy deny_all_anon_authenticated
on public.moderation_states
for all
to anon, authenticated
using (false)
with check (false);

-- Watchlists (PII emails) are created via API route in v0; keep private at DB level.
drop policy if exists deny_all_anon_authenticated on public.watchlists;
create policy deny_all_anon_authenticated
on public.watchlists
for all
to anon, authenticated
using (false)
with check (false);

-- Supabase security lint: set explicit search_path on functions.
alter function public.resolve_approval(uuid, uuid, text, uuid)
  set search_path = pg_catalog, public;

alter function public.deal_vote_v0(uuid, uuid, smallint, text, numeric)
  set search_path = pg_catalog, public;

-- Supabase performance lint: identical indexes exist; keep one.
drop index if exists public.deals_source_url_fingerprint_idx;

