-- Clawdeals production cleanup (public launch)
-- Date: 2026-02-11
--
-- Scope:
-- 1) Delete clearly non-production owners by email domain.
-- 2) Delete linked agents and dependent graph.
-- 3) Delete deals from known test domains (example.*) and dependents.
-- 4) Delete technical QA listings ("ti-271 dup ...").
--
-- Safety:
-- - Run the DRY RUN block first and confirm counts.
-- - Run EXECUTE block only after review.
-- - Keep this script for auditability and repeatability.

-- ============================================
-- DRY RUN
-- ============================================
with owners_test as (
  select owner_id
  from public.owners
  where lower(split_part(email, '@', 2)) in ('example.com', 'test.local', 'clawdeals.test', 'clawdeals.internal', 't.l')
),
agents_test as (
  select id as agent_id
  from public.agents
  where owner_id in (select owner_id from owners_test)
),
threads_test as (
  select thread_id
  from public.threads t
  where t.buyer_agent_id in (select agent_id from agents_test)
     or t.seller_agent_id in (select agent_id from agents_test)
     or t.control_agent_id in (select agent_id from agents_test)
),
listings_test as (
  select listing_id
  from public.listings l
  where l.seller_agent_id in (select agent_id from agents_test)
),
transactions_test as (
  select tx_id
  from public.transactions tx
  where tx.buyer_agent_id in (select agent_id from agents_test)
     or tx.seller_agent_id in (select agent_id from agents_test)
),
deals_test_domain as (
  select d.deal_id
  from public.deals d
  where lower(regexp_replace(coalesce(d.source_url, ''), '^https?://([^/]+).*$','\1')) in ('example.com', 'example.invalid')
     or lower(regexp_replace(coalesce(d.source_url, ''), '^https?://([^/]+).*$','\1')) like '%.example.com'
),
deals_test_agents as (
  select d.deal_id
  from public.deals d
  where d.creator_agent_id in (select agent_id from agents_test)
),
deals_test as (
  select deal_id from deals_test_domain
  union
  select deal_id from deals_test_agents
)
select *
from (
  select 'owners_test'::text as bucket, count(*)::bigint as rows from owners_test
  union all select 'agents_test', count(*)::bigint from agents_test
  union all select 'listings_test', count(*)::bigint from listings_test
  union all select 'watchlists_by_agent', count(*)::bigint from public.watchlists w where w.agent_id in (select agent_id from agents_test)
  union all select 'watchlist_matches_by_agent', count(*)::bigint from public.watchlist_matches wm where wm.agent_id in (select agent_id from agents_test)
  union all select 'threads_test', count(*)::bigint from threads_test
  union all select 'messages_by_threads_test', count(*)::bigint from public.messages m where m.thread_id in (select thread_id from threads_test)
  union all select 'offers_by_agents', count(*)::bigint from public.offers o where o.buyer_agent_id in (select agent_id from agents_test) or o.seller_agent_id in (select agent_id from agents_test)
  union all select 'transactions_by_agents', count(*)::bigint from transactions_test
  union all select 'escrows_by_agents', count(*)::bigint from public.escrows e where e.buyer_agent_id in (select agent_id from agents_test) or e.seller_agent_id in (select agent_id from agents_test)
  union all select 'ratings_by_agents', count(*)::bigint from public.ratings r where r.rater_agent_id in (select agent_id from agents_test) or r.rated_agent_id in (select agent_id from agents_test)
  union all select 'deals_test_union', count(*)::bigint from deals_test
  union all select 'deal_comments_by_deals_test', count(*)::bigint from public.deal_comments dc where dc.deal_id in (select deal_id from deals_test)
  union all select 'deal_votes_by_deals_or_agents', count(*)::bigint from public.deal_votes dv where dv.deal_id in (select deal_id from deals_test) or dv.agent_id in (select agent_id from agents_test)
  union all select 'api_keys_by_agents', count(*)::bigint from public.api_keys k where k.agent_id in (select agent_id from agents_test)
  union all select 'agent_installations_by_agents', count(*)::bigint from public.agent_installations ai where ai.agent_id in (select agent_id from agents_test)
  union all select 'oauth_refresh_tokens_by_agents', count(*)::bigint from public.oauth_refresh_tokens rt where rt.agent_id in (select agent_id from agents_test)
  union all select 'oauth_device_auth_by_agents', count(*)::bigint from public.oauth_device_authorizations da where da.agent_id in (select agent_id from agents_test)
  union all select 'connect_sessions_by_agents', count(*)::bigint from public.connect_sessions cs where cs.agent_id in (select agent_id from agents_test)
  union all select 'risk_rule_state_by_agents', count(*)::bigint from public.risk_rule_state rrs where rrs.agent_id in (select agent_id from agents_test)
  union all select 'trustscore_queue_by_agents', count(*)::bigint from public.trustscore_recalc_queue q where q.agent_id in (select agent_id from agents_test)
  union all select 'channel_identities_by_owners', count(*)::bigint from public.channel_identities ci where ci.owner_id in (select owner_id from owners_test)
  union all select 'approvals_by_owners', count(*)::bigint from public.approvals ap where ap.owner_id in (select owner_id from owners_test)
  union all select 'approval_jobs_by_owners_approvals', count(*)::bigint from public.approval_jobs aj where aj.approval_id in (select ap.approval_id from public.approvals ap where ap.owner_id in (select owner_id from owners_test))
  union all select 'notification_outbox_by_owners', count(*)::bigint from public.notification_outbox no where no.owner_id in (select owner_id from owners_test)
  union all select 'notification_preferences_by_owners', count(*)::bigint from public.notification_preferences np where np.owner_id in (select owner_id from owners_test)
  union all select 'owner_verification_challenges_by_owners', count(*)::bigint from public.owner_verification_challenges ovc where ovc.owner_id in (select owner_id from owners_test)
  union all select 'pairing_tokens_by_owners', count(*)::bigint from public.pairing_tokens pt where pt.owner_id in (select owner_id from owners_test)
  union all select 'owner_sessions_by_owners', count(*)::bigint from public.owner_sessions os where os.owner_id in (select owner_id from owners_test)
  union all select 'owner_auth_links_by_owners', count(*)::bigint from public.owner_auth_links oal where oal.owner_id in (select owner_id from owners_test)
  union all select 'policies_by_owners', count(*)::bigint from public.policies p where p.owner_id in (select owner_id from owners_test)
  union all select 'psp_accounts_by_owners', count(*)::bigint from public.psp_accounts pa where pa.owner_id in (select owner_id from owners_test)
  union all select 'staged_commands_by_owners', count(*)::bigint from public.staged_commands sc where sc.owner_id in (select owner_id from owners_test)
  union all select 'deal_comments_by_owners', count(*)::bigint from public.deal_comments dc where dc.owner_id in (select owner_id from owners_test)
) s
order by rows desc, bucket asc;

-- ============================================
-- EXECUTE (transactional)
-- ============================================
with owners_test as (
  select owner_id
  from public.owners
  where lower(split_part(email, '@', 2)) in ('example.com', 'test.local', 'clawdeals.test', 'clawdeals.internal', 't.l')
),
agents_test as (
  select id as agent_id
  from public.agents
  where owner_id in (select owner_id from owners_test)
),
deals_test as (
  select d.deal_id
  from public.deals d
  where d.creator_agent_id in (select agent_id from agents_test)
     or lower(regexp_replace(coalesce(d.source_url, ''), '^https?://([^/]+).*$','\1')) in ('example.com', 'example.invalid')
     or lower(regexp_replace(coalesce(d.source_url, ''), '^https?://([^/]+).*$','\1')) like '%.example.com'
),
threads_test as (
  select t.thread_id
  from public.threads t
  where t.buyer_agent_id in (select agent_id from agents_test)
     or t.seller_agent_id in (select agent_id from agents_test)
     or t.control_agent_id in (select agent_id from agents_test)
),
listings_test as (
  select l.listing_id
  from public.listings l
  where l.seller_agent_id in (select agent_id from agents_test)
),
del_ratings as (
  delete from public.ratings r
  where r.rater_agent_id in (select agent_id from agents_test)
     or r.rated_agent_id in (select agent_id from agents_test)
  returning 1
),
del_escrows as (
  delete from public.escrows e
  where e.buyer_agent_id in (select agent_id from agents_test)
     or e.seller_agent_id in (select agent_id from agents_test)
  returning 1
),
del_transactions as (
  delete from public.transactions tx
  where tx.buyer_agent_id in (select agent_id from agents_test)
     or tx.seller_agent_id in (select agent_id from agents_test)
  returning 1
),
del_offers as (
  delete from public.offers o
  where o.buyer_agent_id in (select agent_id from agents_test)
     or o.seller_agent_id in (select agent_id from agents_test)
  returning 1
),
del_threads as (
  delete from public.threads t
  where t.thread_id in (select thread_id from threads_test)
  returning 1
),
del_listings as (
  delete from public.listings l
  where l.listing_id in (select listing_id from listings_test)
  returning 1
),
del_deal_comments as (
  delete from public.deal_comments dc
  where dc.owner_id in (select owner_id from owners_test)
     or dc.deal_id in (select deal_id from deals_test)
  returning 1
),
del_deal_votes as (
  delete from public.deal_votes dv
  where dv.agent_id in (select agent_id from agents_test)
     or dv.deal_id in (select deal_id from deals_test)
  returning 1
),
del_deals as (
  delete from public.deals d
  where d.deal_id in (select deal_id from deals_test)
  returning 1
),
del_connect_sessions as (
  delete from public.connect_sessions cs
  where cs.agent_id in (select agent_id from agents_test)
  returning 1
),
del_oauth_device_auth as (
  delete from public.oauth_device_authorizations oda
  where oda.agent_id in (select agent_id from agents_test)
  returning 1
),
del_oauth_refresh as (
  delete from public.oauth_refresh_tokens ort
  where ort.agent_id in (select agent_id from agents_test)
  returning 1
),
del_api_keys as (
  delete from public.api_keys k
  where k.agent_id in (select agent_id from agents_test)
  returning 1
),
del_agent_installations as (
  delete from public.agent_installations ai
  where ai.agent_id in (select agent_id from agents_test)
  returning 1
),
del_risk_rule_state as (
  delete from public.risk_rule_state rs
  where rs.agent_id in (select agent_id from agents_test)
  returning 1
),
del_watchlists as (
  delete from public.watchlists w
  where w.agent_id in (select agent_id from agents_test)
  returning 1
),
del_watchlist_matches as (
  delete from public.watchlist_matches wm
  where wm.agent_id in (select agent_id from agents_test)
  returning 1
),
del_trustscore_queue as (
  delete from public.trustscore_recalc_queue q
  where q.agent_id in (select agent_id from agents_test)
  returning 1
),
del_agents as (
  delete from public.agents a
  where a.id in (select agent_id from agents_test)
  returning 1
),
del_channel_identities as (
  delete from public.channel_identities ci
  where ci.owner_id in (select owner_id from owners_test)
  returning 1
),
del_owner_sessions as (
  delete from public.owner_sessions os
  where os.owner_id in (select owner_id from owners_test)
  returning 1
),
del_owner_auth_links as (
  delete from public.owner_auth_links oal
  where oal.owner_id in (select owner_id from owners_test)
  returning 1
),
del_owner_verification as (
  delete from public.owner_verification_challenges ovc
  where ovc.owner_id in (select owner_id from owners_test)
  returning 1
),
del_pairing_tokens as (
  delete from public.pairing_tokens pt
  where pt.owner_id in (select owner_id from owners_test)
  returning 1
),
del_policies as (
  delete from public.policies p
  where p.owner_id in (select owner_id from owners_test)
  returning 1
),
del_psp_accounts as (
  delete from public.psp_accounts pa
  where pa.owner_id in (select owner_id from owners_test)
  returning 1
),
del_staged_commands as (
  delete from public.staged_commands sc
  where sc.owner_id in (select owner_id from owners_test)
  returning 1
),
del_notification_outbox as (
  delete from public.notification_outbox no
  where no.owner_id in (select owner_id from owners_test)
  returning 1
),
del_notification_preferences as (
  delete from public.notification_preferences np
  where np.owner_id in (select owner_id from owners_test)
  returning 1
),
del_owners as (
  delete from public.owners o
  where o.owner_id in (select owner_id from owners_test)
  returning 1
)
select *
from (
  select 'owners'::text as table_name, count(*)::bigint as deleted_rows from del_owners
  union all select 'agents', count(*)::bigint from del_agents
  union all select 'deals', count(*)::bigint from del_deals
  union all select 'api_keys', count(*)::bigint from del_api_keys
  union all select 'threads', count(*)::bigint from del_threads
  union all select 'listings', count(*)::bigint from del_listings
  union all select 'offers', count(*)::bigint from del_offers
  union all select 'transactions', count(*)::bigint from del_transactions
  union all select 'escrows', count(*)::bigint from del_escrows
  union all select 'ratings', count(*)::bigint from del_ratings
  union all select 'deal_comments', count(*)::bigint from del_deal_comments
  union all select 'deal_votes', count(*)::bigint from del_deal_votes
  union all select 'connect_sessions', count(*)::bigint from del_connect_sessions
  union all select 'oauth_device_authorizations', count(*)::bigint from del_oauth_device_auth
  union all select 'oauth_refresh_tokens', count(*)::bigint from del_oauth_refresh
  union all select 'agent_installations', count(*)::bigint from del_agent_installations
  union all select 'watchlists', count(*)::bigint from del_watchlists
  union all select 'watchlist_matches', count(*)::bigint from del_watchlist_matches
  union all select 'channel_identities', count(*)::bigint from del_channel_identities
  union all select 'owner_sessions', count(*)::bigint from del_owner_sessions
  union all select 'owner_auth_links', count(*)::bigint from del_owner_auth_links
  union all select 'owner_verification_challenges', count(*)::bigint from del_owner_verification
  union all select 'pairing_tokens', count(*)::bigint from del_pairing_tokens
  union all select 'policies', count(*)::bigint from del_policies
  union all select 'psp_accounts', count(*)::bigint from del_psp_accounts
  union all select 'staged_commands', count(*)::bigint from del_staged_commands
  union all select 'notification_outbox', count(*)::bigint from del_notification_outbox
  union all select 'notification_preferences', count(*)::bigint from del_notification_preferences
  union all select 'risk_rule_state', count(*)::bigint from del_risk_rule_state
  union all select 'trustscore_recalc_queue', count(*)::bigint from del_trustscore_queue
) x
where deleted_rows > 0
order by deleted_rows desc, table_name asc;

-- ============================================
-- Optional: technical listing cleanup
-- ============================================
delete from public.listings
where lower(title) like 'ti-271 dup %';
