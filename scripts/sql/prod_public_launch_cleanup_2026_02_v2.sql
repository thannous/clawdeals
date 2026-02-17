-- Clawdeals production cleanup v2 (E2E/Integration test data)
-- Date: 2026-02-16
--
-- Objective:
-- - Keep only 3 owners:
--   1) ops console owner
--   2) tester #1
--   3) tester #2
-- - Remove all non-whitelisted owner graphs and related synthetic test data.
-- - Remove deals from known test domains (example.*) even if created by kept owners.
-- - Remove technical QA listings "ti-271 dup %".
-- - Purge technical logs:
--   - idempotency_keys for targeted actors + entries older than 24h
--   - audit_logs* entries for targeted actors/entities + entries older than 24h
--
-- Safety:
-- 1) Run DRY RUN first.
-- 2) Confirm whitelist owners exist.
-- 3) Run EXECUTE section in maintenance window (freeze writers).
-- 4) Re-run DRY RUN and post-check queries after execute.

-- ============================================================
-- DRY RUN
-- ============================================================
with keep_owners as (
  select owner_id
  from (
    values
      ('00000000-0000-4000-a000-000000000000'::uuid), -- ops console
      ('d11dc972-75bb-4cd7-8b1e-7396a8f73658'::uuid), -- tester 1
      ('10ff61d9-8223-4493-a364-37e076bff457'::uuid)  -- tester 2
  ) as v(owner_id)
),
keep_owners_existing as (
  select o.owner_id
  from public.owners o
  where o.owner_id in (select owner_id from keep_owners)
),
owners_target as (
  select o.owner_id
  from public.owners o
  where o.owner_id not in (select owner_id from keep_owners)
),
agents_target as (
  select a.id as agent_id
  from public.agents a
  where a.owner_id in (select owner_id from owners_target)
),
deals_target as (
  select d.deal_id
  from public.deals d
  where d.creator_agent_id in (select agent_id from agents_target)
     or lower(regexp_replace(coalesce(d.source_url, ''), '^https?://([^/]+).*$','\1')) in ('example.com', 'example.invalid')
     or lower(regexp_replace(coalesce(d.source_url, ''), '^https?://([^/]+).*$','\1')) like '%.example.com'
),
listings_target as (
  select l.listing_id
  from public.listings l
  where l.seller_agent_id in (select agent_id from agents_target)
     or lower(coalesce(l.title, '')) like 'ti-271 dup %'
),
threads_target as (
  select t.thread_id
  from public.threads t
  where t.buyer_agent_id in (select agent_id from agents_target)
     or t.seller_agent_id in (select agent_id from agents_target)
     or t.control_agent_id in (select agent_id from agents_target)
     or t.listing_id in (select listing_id from listings_target)
),
offers_target as (
  select o.offer_id
  from public.offers o
  where o.buyer_agent_id in (select agent_id from agents_target)
     or o.seller_agent_id in (select agent_id from agents_target)
     or o.listing_id in (select listing_id from listings_target)
     or o.thread_id in (select thread_id from threads_target)
),
transactions_target as (
  select tx.tx_id
  from public.transactions tx
  where tx.buyer_agent_id in (select agent_id from agents_target)
     or tx.seller_agent_id in (select agent_id from agents_target)
     or tx.listing_id in (select listing_id from listings_target)
     or tx.thread_id in (select thread_id from threads_target)
     or tx.accepted_offer_id in (select offer_id from offers_target)
),
escrows_target as (
  select e.escrow_id
  from public.escrows e
  where e.tx_id in (select tx_id from transactions_target)
     or e.buyer_agent_id in (select agent_id from agents_target)
     or e.seller_agent_id in (select agent_id from agents_target)
),
disputes_target as (
  select d.dispute_id
  from public.disputes d
  where d.escrow_id in (select escrow_id from escrows_target)
),
evidence_packs_target as (
  select ep.evidence_pack_id
  from public.evidence_packs ep
  where ep.dispute_id in (select dispute_id from disputes_target)
),
approval_target as (
  select ap.approval_id
  from public.approvals ap
  where ap.owner_id in (select owner_id from owners_target)
     or ap.created_by_agent_id in (select agent_id from agents_target)
),
psp_webhook_events_target as (
  select p.id
  from public.psp_webhook_events p
  where p.psp_provider = 'mock'
     or p.escrow_id in (select escrow_id from escrows_target)
),
ids_target as (
  select owner_id::text as id from owners_target
  union
  select agent_id::text as id from agents_target
)
select *
from (
  select 'keep_owners_expected'::text as bucket, 3::bigint as rows
  union all select 'keep_owners_existing', count(*)::bigint from keep_owners_existing
  union all select 'owners_target', count(*)::bigint from owners_target
  union all select 'agents_target', count(*)::bigint from agents_target
  union all select 'deals_target', count(*)::bigint from deals_target
  union all select 'listings_target', count(*)::bigint from listings_target
  union all select 'threads_target', count(*)::bigint from threads_target
  union all select 'messages_target', count(*)::bigint from public.messages m where m.thread_id in (select thread_id from threads_target)
  union all select 'offers_target', count(*)::bigint from offers_target
  union all select 'transactions_target', count(*)::bigint from transactions_target
  union all select 'escrows_target', count(*)::bigint from escrows_target
  union all select 'disputes_target', count(*)::bigint from disputes_target
  union all select 'evidence_packs_target', count(*)::bigint from evidence_packs_target
  union all select 'evidence_items_target', count(*)::bigint from public.evidence_items ei where ei.evidence_pack_id in (select evidence_pack_id from evidence_packs_target)
  union all select 'evidence_links_target', count(*)::bigint from public.evidence_links el where el.evidence_pack_id in (select evidence_pack_id from evidence_packs_target)
  union all select 'ledger_entries_target', count(*)::bigint from public.ledger_entries le where le.escrow_id in (select escrow_id from escrows_target)
  union all select 'psp_webhook_events_target', count(*)::bigint from psp_webhook_events_target
  union all select 'deal_comments_target', count(*)::bigint from public.deal_comments dc where dc.deal_id in (select deal_id from deals_target) or dc.owner_id in (select owner_id from owners_target)
  union all select 'deal_votes_target', count(*)::bigint from public.deal_votes dv where dv.deal_id in (select deal_id from deals_target) or dv.agent_id in (select agent_id from agents_target)
  union all select 'watchlists_target', count(*)::bigint from public.watchlists w where w.agent_id in (select agent_id from agents_target)
  union all select 'watchlist_matches_target', count(*)::bigint from public.watchlist_matches wm where wm.agent_id in (select agent_id from agents_target)
  union all select 'ratings_target', count(*)::bigint from public.ratings r where r.rater_agent_id in (select agent_id from agents_target) or r.rated_agent_id in (select agent_id from agents_target)
  union all select 'approvals_target', count(*)::bigint from approval_target
  union all select 'approval_jobs_target', count(*)::bigint from public.approval_jobs aj where aj.approval_id in (select approval_id from approval_target)
  union all select 'api_keys_target', count(*)::bigint from public.api_keys k where k.agent_id in (select agent_id from agents_target)
  union all select 'agent_installations_target', count(*)::bigint from public.agent_installations ai where ai.owner_id in (select owner_id from owners_target) or ai.agent_id in (select agent_id from agents_target)
  union all select 'oauth_refresh_tokens_target', count(*)::bigint from public.oauth_refresh_tokens rt where rt.owner_id in (select owner_id from owners_target) or rt.agent_id in (select agent_id from agents_target)
  union all select 'oauth_device_auth_target', count(*)::bigint from public.oauth_device_authorizations da where da.owner_id in (select owner_id from owners_target) or da.agent_id in (select agent_id from agents_target)
  union all select 'connect_sessions_target', count(*)::bigint from public.connect_sessions cs where cs.owner_id in (select owner_id from owners_target) or cs.agent_id in (select agent_id from agents_target)
  union all select 'risk_rule_state_target', count(*)::bigint from public.risk_rule_state rrs where rrs.agent_id in (select agent_id from agents_target)
  union all select 'trustscore_queue_target', count(*)::bigint from public.trustscore_recalc_queue q where q.agent_id in (select agent_id from agents_target)
  union all select 'channel_identities_target', count(*)::bigint from public.channel_identities ci where ci.owner_id in (select owner_id from owners_target)
  union all select 'owner_sessions_target', count(*)::bigint from public.owner_sessions os where os.owner_id in (select owner_id from owners_target)
  union all select 'owner_auth_links_target', count(*)::bigint from public.owner_auth_links oal where oal.owner_id in (select owner_id from owners_target)
  union all select 'owner_verification_target', count(*)::bigint from public.owner_verification_challenges ovc where ovc.owner_id in (select owner_id from owners_target)
  union all select 'pairing_tokens_target', count(*)::bigint from public.pairing_tokens pt where pt.owner_id in (select owner_id from owners_target)
  union all select 'policies_target', count(*)::bigint from public.policies p where p.owner_id in (select owner_id from owners_target)
  union all select 'psp_accounts_target', count(*)::bigint from public.psp_accounts pa where pa.owner_id in (select owner_id from owners_target)
  union all select 'staged_commands_target', count(*)::bigint from public.staged_commands sc where sc.owner_id in (select owner_id from owners_target) or sc.agent_id in (select agent_id from agents_target)
  union all select 'notification_outbox_target', count(*)::bigint from public.notification_outbox no where no.owner_id in (select owner_id from owners_target)
  union all select 'notification_preferences_target', count(*)::bigint from public.notification_preferences np where np.owner_id in (select owner_id from owners_target)
  union all select 'idempotency_keys_target', count(*)::bigint from public.idempotency_keys ik where (ik.actor_type in ('owner', 'agent') and ik.actor_id in (select id from ids_target)) or ik.created_at < now() - interval '24 hours'
  union all select 'audit_logs_parent_target', count(*)::bigint from public.audit_logs al where al.occurred_at < now() - interval '24 hours' or (al.actor->>'id') in (select id from ids_target) or (al.action->>'entity_id') in (select id from ids_target)
  union all select 'audit_logs_2026_02_target', count(*)::bigint from public.audit_logs_2026_02 al where al.occurred_at < now() - interval '24 hours' or (al.actor->>'id') in (select id from ids_target) or (al.action->>'entity_id') in (select id from ids_target)
) s
order by rows desc, bucket asc;

-- ============================================================
-- EXECUTE (transactional)
-- ============================================================
begin;

create temp table _cleanup_counts (
  table_name text primary key,
  deleted_rows bigint not null default 0
) on commit drop;

create temp table _keep_owners (
  owner_id uuid primary key
) on commit drop;

insert into _keep_owners (owner_id)
values
  ('00000000-0000-4000-a000-000000000000'::uuid), -- ops console
  ('d11dc972-75bb-4cd7-8b1e-7396a8f73658'::uuid), -- tester 1
  ('10ff61d9-8223-4493-a364-37e076bff457'::uuid); -- tester 2

do $$
declare
  keep_count bigint;
begin
  select count(*)::bigint
  into keep_count
  from public.owners
  where owner_id in (select owner_id from pg_temp._keep_owners);

  if keep_count <> 3 then
    raise exception 'Cleanup aborted: expected 3 whitelisted owners to exist, got %', keep_count;
  end if;
end $$;

create temp table _owners_target on commit drop as
select o.owner_id
from public.owners o
where o.owner_id not in (select owner_id from _keep_owners);

create temp table _agents_target on commit drop as
select a.id as agent_id
from public.agents a
where a.owner_id in (select owner_id from _owners_target);

create temp table _deals_target on commit drop as
select d.deal_id
from public.deals d
where d.creator_agent_id in (select agent_id from _agents_target)
   or lower(regexp_replace(coalesce(d.source_url, ''), '^https?://([^/]+).*$','\1')) in ('example.com', 'example.invalid')
   or lower(regexp_replace(coalesce(d.source_url, ''), '^https?://([^/]+).*$','\1')) like '%.example.com';

create temp table _listings_target on commit drop as
select l.listing_id
from public.listings l
where l.seller_agent_id in (select agent_id from _agents_target)
   or lower(coalesce(l.title, '')) like 'ti-271 dup %';

create temp table _threads_target on commit drop as
select t.thread_id
from public.threads t
where t.buyer_agent_id in (select agent_id from _agents_target)
   or t.seller_agent_id in (select agent_id from _agents_target)
   or t.control_agent_id in (select agent_id from _agents_target)
   or t.listing_id in (select listing_id from _listings_target);

create temp table _offers_target on commit drop as
select o.offer_id
from public.offers o
where o.buyer_agent_id in (select agent_id from _agents_target)
   or o.seller_agent_id in (select agent_id from _agents_target)
   or o.listing_id in (select listing_id from _listings_target)
   or o.thread_id in (select thread_id from _threads_target);

create temp table _transactions_target on commit drop as
select tx.tx_id
from public.transactions tx
where tx.buyer_agent_id in (select agent_id from _agents_target)
   or tx.seller_agent_id in (select agent_id from _agents_target)
   or tx.listing_id in (select listing_id from _listings_target)
   or tx.thread_id in (select thread_id from _threads_target)
   or tx.accepted_offer_id in (select offer_id from _offers_target);

create temp table _escrows_target on commit drop as
select e.escrow_id
from public.escrows e
where e.tx_id in (select tx_id from _transactions_target)
   or e.buyer_agent_id in (select agent_id from _agents_target)
   or e.seller_agent_id in (select agent_id from _agents_target);

create temp table _disputes_target on commit drop as
select d.dispute_id
from public.disputes d
where d.escrow_id in (select escrow_id from _escrows_target);

create temp table _evidence_packs_target on commit drop as
select ep.evidence_pack_id
from public.evidence_packs ep
where ep.dispute_id in (select dispute_id from _disputes_target);

create temp table _approvals_target on commit drop as
select ap.approval_id
from public.approvals ap
where ap.owner_id in (select owner_id from _owners_target)
   or ap.created_by_agent_id in (select agent_id from _agents_target);

create temp table _psp_webhook_events_target on commit drop as
select p.id
from public.psp_webhook_events p
where p.psp_provider = 'mock'
   or p.escrow_id in (select escrow_id from _escrows_target);

create temp table _ids_target on commit drop as
select owner_id::text as id from _owners_target
union
select agent_id::text as id from _agents_target;

create index _owners_target_owner_id_idx on _owners_target(owner_id);
create index _agents_target_agent_id_idx on _agents_target(agent_id);
create index _deals_target_deal_id_idx on _deals_target(deal_id);
create index _listings_target_listing_id_idx on _listings_target(listing_id);
create index _threads_target_thread_id_idx on _threads_target(thread_id);
create index _offers_target_offer_id_idx on _offers_target(offer_id);
create index _transactions_target_tx_id_idx on _transactions_target(tx_id);
create index _escrows_target_escrow_id_idx on _escrows_target(escrow_id);
create index _disputes_target_dispute_id_idx on _disputes_target(dispute_id);
create index _evidence_packs_target_pack_id_idx on _evidence_packs_target(evidence_pack_id);
create index _ids_target_id_idx on _ids_target(id);

with
del_evidence_links as (
  delete from public.evidence_links el
  where el.evidence_pack_id in (select evidence_pack_id from _evidence_packs_target)
  returning 1
),
del_evidence_items as (
  delete from public.evidence_items ei
  where ei.evidence_pack_id in (select evidence_pack_id from _evidence_packs_target)
  returning 1
),
del_evidence_packs as (
  delete from public.evidence_packs ep
  where ep.evidence_pack_id in (select evidence_pack_id from _evidence_packs_target)
  returning 1
),
del_disputes as (
  delete from public.disputes d
  where d.dispute_id in (select dispute_id from _disputes_target)
  returning 1
),
del_ledger_entries as (
  delete from public.ledger_entries le
  where le.escrow_id in (select escrow_id from _escrows_target)
  returning 1
),
del_psp_events as (
  delete from public.psp_webhook_events p
  where p.id in (select id from _psp_webhook_events_target)
  returning 1
),
del_ratings as (
  delete from public.ratings r
  where r.tx_id in (select tx_id from _transactions_target)
     or r.rater_agent_id in (select agent_id from _agents_target)
     or r.rated_agent_id in (select agent_id from _agents_target)
  returning 1
),
del_escrows as (
  delete from public.escrows e
  where e.escrow_id in (select escrow_id from _escrows_target)
  returning 1
),
del_transactions as (
  delete from public.transactions tx
  where tx.tx_id in (select tx_id from _transactions_target)
  returning 1
),
del_offers as (
  delete from public.offers o
  where o.offer_id in (select offer_id from _offers_target)
  returning 1
),
del_messages as (
  delete from public.messages m
  where m.thread_id in (select thread_id from _threads_target)
  returning 1
),
del_threads as (
  delete from public.threads t
  where t.thread_id in (select thread_id from _threads_target)
  returning 1
),
del_deal_comments as (
  delete from public.deal_comments dc
  where dc.deal_id in (select deal_id from _deals_target)
     or dc.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_deal_votes as (
  delete from public.deal_votes dv
  where dv.deal_id in (select deal_id from _deals_target)
     or dv.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_listings as (
  delete from public.listings l
  where l.listing_id in (select listing_id from _listings_target)
  returning 1
),
del_deals as (
  delete from public.deals d
  where d.deal_id in (select deal_id from _deals_target)
  returning 1
),
del_watchlist_matches as (
  delete from public.watchlist_matches wm
  where wm.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_watchlists as (
  delete from public.watchlists w
  where w.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_approval_jobs as (
  delete from public.approval_jobs aj
  where aj.approval_id in (select approval_id from _approvals_target)
  returning 1
),
del_approvals as (
  delete from public.approvals ap
  where ap.approval_id in (select approval_id from _approvals_target)
  returning 1
),
del_connect_sessions as (
  delete from public.connect_sessions cs
  where cs.owner_id in (select owner_id from _owners_target)
     or cs.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_oauth_device as (
  delete from public.oauth_device_authorizations da
  where da.owner_id in (select owner_id from _owners_target)
     or da.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_oauth_refresh as (
  delete from public.oauth_refresh_tokens rt
  where rt.owner_id in (select owner_id from _owners_target)
     or rt.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_api_keys as (
  delete from public.api_keys k
  where k.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_agent_installations as (
  delete from public.agent_installations ai
  where ai.owner_id in (select owner_id from _owners_target)
     or ai.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_risk_rule_state as (
  delete from public.risk_rule_state rs
  where rs.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_trustscore_queue as (
  delete from public.trustscore_recalc_queue q
  where q.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_channel_identities as (
  delete from public.channel_identities ci
  where ci.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_owner_sessions as (
  delete from public.owner_sessions os
  where os.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_owner_auth_links as (
  delete from public.owner_auth_links oal
  where oal.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_owner_verification as (
  delete from public.owner_verification_challenges ovc
  where ovc.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_pairing_tokens as (
  delete from public.pairing_tokens pt
  where pt.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_policies as (
  delete from public.policies p
  where p.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_psp_accounts as (
  delete from public.psp_accounts pa
  where pa.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_staged_commands as (
  delete from public.staged_commands sc
  where sc.owner_id in (select owner_id from _owners_target)
     or sc.agent_id in (select agent_id from _agents_target)
  returning 1
),
del_notification_outbox as (
  delete from public.notification_outbox no
  where no.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_notification_preferences as (
  delete from public.notification_preferences np
  where np.owner_id in (select owner_id from _owners_target)
  returning 1
),
del_agents as (
  delete from public.agents a
  where a.id in (select agent_id from _agents_target)
  returning 1
),
del_owners as (
  delete from public.owners o
  where o.owner_id in (select owner_id from _owners_target)
  returning 1
)
insert into _cleanup_counts(table_name, deleted_rows)
select table_name, deleted_rows
from (
  select 'public.evidence_links'::text as table_name, count(*)::bigint as deleted_rows from del_evidence_links
  union all select 'public.evidence_items', count(*)::bigint from del_evidence_items
  union all select 'public.evidence_packs', count(*)::bigint from del_evidence_packs
  union all select 'public.disputes', count(*)::bigint from del_disputes
  union all select 'public.ledger_entries', count(*)::bigint from del_ledger_entries
  union all select 'public.psp_webhook_events', count(*)::bigint from del_psp_events
  union all select 'public.ratings', count(*)::bigint from del_ratings
  union all select 'public.escrows', count(*)::bigint from del_escrows
  union all select 'public.transactions', count(*)::bigint from del_transactions
  union all select 'public.offers', count(*)::bigint from del_offers
  union all select 'public.messages', count(*)::bigint from del_messages
  union all select 'public.threads', count(*)::bigint from del_threads
  union all select 'public.deal_comments', count(*)::bigint from del_deal_comments
  union all select 'public.deal_votes', count(*)::bigint from del_deal_votes
  union all select 'public.listings', count(*)::bigint from del_listings
  union all select 'public.deals', count(*)::bigint from del_deals
  union all select 'public.watchlist_matches', count(*)::bigint from del_watchlist_matches
  union all select 'public.watchlists', count(*)::bigint from del_watchlists
  union all select 'public.approval_jobs', count(*)::bigint from del_approval_jobs
  union all select 'public.approvals', count(*)::bigint from del_approvals
  union all select 'public.connect_sessions', count(*)::bigint from del_connect_sessions
  union all select 'public.oauth_device_authorizations', count(*)::bigint from del_oauth_device
  union all select 'public.oauth_refresh_tokens', count(*)::bigint from del_oauth_refresh
  union all select 'public.api_keys', count(*)::bigint from del_api_keys
  union all select 'public.agent_installations', count(*)::bigint from del_agent_installations
  union all select 'public.risk_rule_state', count(*)::bigint from del_risk_rule_state
  union all select 'public.trustscore_recalc_queue', count(*)::bigint from del_trustscore_queue
  union all select 'public.channel_identities', count(*)::bigint from del_channel_identities
  union all select 'public.owner_sessions', count(*)::bigint from del_owner_sessions
  union all select 'public.owner_auth_links', count(*)::bigint from del_owner_auth_links
  union all select 'public.owner_verification_challenges', count(*)::bigint from del_owner_verification
  union all select 'public.pairing_tokens', count(*)::bigint from del_pairing_tokens
  union all select 'public.policies', count(*)::bigint from del_policies
  union all select 'public.psp_accounts', count(*)::bigint from del_psp_accounts
  union all select 'public.staged_commands', count(*)::bigint from del_staged_commands
  union all select 'public.notification_outbox', count(*)::bigint from del_notification_outbox
  union all select 'public.notification_preferences', count(*)::bigint from del_notification_preferences
  union all select 'public.agents', count(*)::bigint from del_agents
  union all select 'public.owners', count(*)::bigint from del_owners
) s;

with del as (
  delete from public.idempotency_keys ik
  where ik.created_at < now() - interval '24 hours'
     or (ik.actor_type in ('owner', 'agent') and ik.actor_id in (select id from _ids_target))
  returning 1
)
insert into _cleanup_counts(table_name, deleted_rows)
select 'public.idempotency_keys', count(*)::bigint
from del
on conflict (table_name)
do update set deleted_rows = _cleanup_counts.deleted_rows + excluded.deleted_rows;

do $$
declare
  rec record;
  deleted_rows bigint;
begin
  for rec in
    select format('%I.%I', n.nspname, c.relname) as fq_table
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (c.relname = 'audit_logs' or c.relname like 'audit_logs_%')
  loop
    execute format(
      'with del as (
         delete from %s al
         where al.occurred_at < now() - interval ''24 hours''
            or (al.actor->>''id'') in (select id from pg_temp._ids_target)
            or (al.action->>''entity_id'') in (select id from pg_temp._ids_target)
         returning 1
       )
       select count(*)::bigint from del',
      rec.fq_table
    ) into deleted_rows;

    insert into pg_temp._cleanup_counts(table_name, deleted_rows)
    values (rec.fq_table, coalesce(deleted_rows, 0))
    on conflict (table_name)
    do update set deleted_rows = pg_temp._cleanup_counts.deleted_rows + excluded.deleted_rows;
  end loop;
end $$;

select table_name, deleted_rows
from _cleanup_counts
where deleted_rows > 0
order by deleted_rows desc, table_name asc;

commit;
