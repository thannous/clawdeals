# Direct server-table privilege candidate

Review-only local artifact, 2026-11-05. No remote apply or production authorization.
Source catalog file SHA-256: `e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491`.
The table metadata hashes below/in SQL identify the reviewed catalog records;
the catalog does **not** bind complete column schemas, defaults or trigger bodies.
An actual dump comparison remains a hard execution gate.

## Concrete SQL scope

`neon-direct-table-role-plan.sql` grants only proven direct operations on 52 named
public base tables. It creates one policy per allowed operation, enables and forces
RLS, and ends ROLLBACK. It neither grants ALL nor remaps anon/authenticated policies.
The app is a trusted server role: `USING (true)` / `WITH CHECK (true)` preserve the
old service-role visibility for these operations, **not database tenant isolation**.
Route authentication/ownership tests must pass before these policies are usable.

The generator follows the current server/API AST census, variable continuations
and literal upsert options. `ignoreDuplicates: true` adds INSERT, not UPDATE.
The current adapter emits `SELECT t.*` or `RETURNING t.*`, including minimal writes;
therefore SELECT on the complete row is required for every table accessed through
that adapter. This is a concrete compiler dependency, not an inferred business read.
Plain RPC bodies are not scanned to invent underlying table write permissions.

## Explicit operation list

S = SELECT, I = INSERT, U = UPDATE, D = DELETE. Evidence is a representative direct
callsite; generator output retains all callsite references and source-file hashes.

| Public object | Operations | Representative evidence | Treatment |
| --- | --- | --- | --- |
| acquisition_funnel_events | SI | src/server/services/acquisition.ts:99 | separate acquisition policy integration |
| acquisition_funnel_summary | S | src/server/services/console-acquisition-dashboard.ts:72 | separate view role plan |
| acquisition_revenue_attribution_summary | S | src/server/services/console-acquisition-dashboard.ts:86 | separate view role plan |
| agent_installations | SID | src/server/services/agent-installations.ts:76 | explicit table grant/policies |
| agents | SIUD | src/server/services/agents.ts:14 | explicit table grant/policies |
| api_keys | SIU | src/server/services/agent-installations.ts:112 | explicit table grant/policies |
| approval_jobs | SU | src/server/services/approval-jobs.ts:31 | explicit table grant/policies |
| approvals | SIU | src/server/observability/alerts.ts:184 | explicit table grant/policies |
| audit_logs | SIUD | src/server/audit/supabase-writer.ts:6 | explicit table grant/policies |
| channel_identities | SIU | src/server/services/channel-identities.ts:92 | explicit table grant/policies |
| connect_sessions | SIU | src/server/services/acquisition.ts:188 | explicit table grant/policies |
| deal_comments | SI | src/server/services/deal-comments.ts:90 | explicit table grant/policies |
| deal_votes | S | src/server/services/deal-votes.ts:102 | explicit table grant/policies |
| deals | SIUD | src/server/services/deal-comments.ts:70 | explicit table grant/policies |
| disputes | SU | src/server/services/disputes.ts:67 | explicit table grant/policies |
| escrows | S | src/server/services/escrows.ts:77 | explicit table grant/policies |
| evidence_items | S | src/server/services/evidence.ts:125 | explicit table grant/policies |
| evidence_links | S | src/server/services/evidence.ts:419 | explicit table grant/policies |
| evidence_packs | SIU | src/server/services/evidence.ts:112 | explicit table grant/policies |
| idempotency_keys | SIUD | src/server/idempotency/store.ts:7 | explicit table grant/policies |
| listings | SIUD | src/server/services/listing-drafts.ts:252 | explicit table grant/policies |
| messages | SI | src/server/services/project-missions.ts:215 | explicit table grant/policies |
| moderation_actions | SI | src/server/services/moderation.ts:21 | explicit table grant/policies |
| moderation_states | SIU | src/server/services/deals-list.ts:317 | explicit table grant/policies |
| notification_outbox | SIU | src/server/services/notification-outbox.ts:65 | explicit table grant/policies |
| notification_preferences | SIU | src/server/services/notification-preferences.ts:84 | explicit table grant/policies |
| oauth_device_authorizations | SIU | src/server/services/oauth-device-authorizations.ts:400 | explicit table grant/policies |
| oauth_device_user_code_attempts | SIUD | src/server/services/oauth-device-authorizations.ts:219 | explicit table grant/policies |
| oauth_refresh_tokens | SIUD | src/server/services/oauth-refresh-tokens.ts:100 | explicit table grant/policies |
| offers | SI | src/server/services/offers.ts:15 | explicit table grant/policies |
| owner_auth_links | SIU | src/server/services/agents.ts:297 | explicit table grant/policies |
| owner_sessions | SIU | src/server/services/agents.ts:301 | explicit table grant/policies |
| owner_verification_challenges | SIU | src/server/services/owner-verification.ts:9 | explicit table grant/policies |
| owners | SIU | src/server/services/agents.ts:145 | explicit table grant/policies |
| pairing_tokens | SIU | src/server/services/pairing-tokens.ts:94 | explicit table grant/policies |
| policies | SIU | src/server/services/policies.ts:44 | explicit table grant/policies |
| project_missions | SI | src/server/services/project-missions.ts:148 | explicit table grant/policies |
| psp_accounts | SIU | src/server/services/psp-accounts.ts:22 | explicit table grant/policies |
| psp_config | SIU | src/server/services/psp-config.ts:22 | explicit table grant/policies |
| psp_webhook_events | SIU | src/server/services/psp-webhook-events.ts:56 | explicit table grant/policies |
| ratings | SI | src/server/services/ratings.ts:36 | explicit table grant/policies |
| reports | SIUD | src/server/retention/shared.ts:52 | explicit table grant/policies |
| risk_rule_state | SIU | src/server/services/risk-rules.ts:297 | explicit table grant/policies |
| risk_rules | SU | src/server/services/risk-rules.ts:133 | explicit table grant/policies |
| smartphone_passport_photos | SD | src/server/services/smartphone-passports.ts:69 | explicit table grant/policies |
| smartphone_passports | S | src/server/services/smartphone-mission-matching.ts:15 | explicit table grant/policies |
| staged_commands | SIU | src/server/services/staged-commands.ts:53 | explicit table grant/policies |
| threads | SI | src/server/services/project-missions.ts:210 | explicit table grant/policies |
| transactions | S | src/server/services/transactions.ts:70 | explicit table grant/policies |
| trustscore_recalc_queue | SIUD | src/server/observability/alerts.ts:155 | explicit table grant/policies |
| watchlist_backfill_queue | SIUD | src/server/observability/alerts.ts:155 | explicit table grant/policies |
| watchlist_match_queue | SUD | src/server/observability/alerts.ts:155 | explicit table grant/policies |
| watchlist_matches | SIU | src/server/services/smartphone-mission-matching.ts:60 | explicit table grant/policies |
| watchlist_signups | SI | src/server/services/watchlist-signups.ts:74 | explicit table grant/policies |
| watchlists | SIUD | src/server/services/email-alerts.ts:274 | explicit table grant/policies |

## Bounded helper provenance

The 12 prior dynamic census entries are not 12 unresolved authorizations:
- Audit writer factory is used by `audit/singleton.ts` without override: audit_logs INSERT.
- Audit/report cron handlers use default audit_logs/reports. Retention adds UPDATE
  and DELETE, never arbitrary request-supplied table names.
- Observability uses trustscore_recalc_queue, watchlist_backfill_queue and
  watchlist_match_queue with fixed ID/count/updated_at projections, SELECT only.
- Ops dashboard uses those three queues plus approvals, SELECT only.
- Deal/listing helper projection arguments are local literal column lists, with
  optional media-column fallback. They add no table names or operation kinds.

These mappings are explicitly reviewed current callsites, not interprocedural
proof for future callers. Rerun and review the census when these helpers change.
The generator fails on unknown dynamic operation-bearing table continuations or
unknown upsert options. The underlying census can partially resolve conditional
expressions and does not prove arbitrary control-flow/dataflow completeness.

## Plans deliberately kept separate

- acquisition_funnel_events: direct analytics proves SELECT+INSERT only (all three
  upserts ignore duplicates), but this candidate grants **nothing** on that table.
  Its integration must reconcile analytics event writes with the separately tested
  narrow d7 trigger SELECT/INSERT policies, rather than silently add a permissive
  policy that defeats that restriction.
- All six views remain under the separate view review. Two acquisition views are
  directly referenced here and explicitly excluded. This candidate creates no view
  grants or policies.
- View column-SELECT grants on shared base tables compose with these full-row SELECT
  grants only where actual direct adapter queries require them. Policy names here
  are `neon_direct_select/insert/update/delete` and do not replace view-specific or
  queue-definer policies. Permissive PostgreSQL policies combine with OR: review
  the assembled set, not each file in isolation.
- No private table or direct audit partition is included. The audit parent is
  included; private helpers and maintenance ownership remain separate.
- RPC-only underlying operations remain unresolved in their exact-signature RPC
  plan. For example direct deal_votes/escrows/transactions reads do not justify
  their writes. Direct offers/project_missions INSERT does not justify UPDATE;
  those function paths require separate body/dependency authorization review.
- Tables absent from direct `.from` calls, such as ledger_entries,
  evidence_upload_reservations, acquisition_revenue_attributions and
  smartphone_mission_match_state, receive no new direct grant here.

## Execution gates and verification

This additive candidate does not revoke inherited/legacy privileges. Before apply,
verify role membership and owner/DDL/TEMP restrictions, existing grants, default
ACLs and restrictive policies; bind the actual restored table kind, columns,
constraints, defaults and triggers to the reviewed source. No sequence/function
privilege is inferred merely because a table can be inserted into. The catalog's
table metadata hash cannot establish any of those omitted properties.

The SQL preflight rejects app superuser/BYPASSRLS/role creation/replication,
TEMP/public CREATE/private USAGE and membership in public/private table owners.
It checks each named object is the expected non-partition public table kind.
These checks supplement, not replace, the shared runtime guard and full role review.

Tests distinguish AST derivation from native PostgreSQL authorization. Native fixture
executes the actual checked-in candidate blocks for deals (S/I/U/D), deal_votes (S)
and offers (S/I), with FORCE RLS and a separate owner. It checks successful CRUD,
read-only/write denials, no public DDL/TEMP/owner membership, and preserves RLS.
The fixture tables are synthetic and app uses NOLOGIN plus SET ROLE. This does not
prove deployed login, imported constraints, business trigger behavior or tenant
isolation. All fixture data is local and disposable.

Commands:
- `node scripts/migration/direct-table-authorization.mjs <reviewed-catalog.json> --sql`
- `node --test scripts/migration/direct-table-authorization.test.mjs`
- `PG_FIXTURE_BIN=/path/to/verified/pg17/bin node --test scripts/migration/direct-table-authorization.test.mjs`

## Explicit acquisition analytics integration candidate

`neon-acquisition-role-plan.sql` closes the previously separated acquisition
SELECT/INSERT requirement locally. It is a separate ROLLBACK candidate, not an
applied grant or a request to change product behavior. It grants full-row SELECT
for the current adapter and INSERT only; no UPDATE/DELETE grant or policy.
The insert policy allows the finite eight names in shared
`ACQUISITION_EVENT_NAMES`: landing_view, organic_entry, connect_cta_clicked,
activation_started, agent_connected, watchlist_created, first_match, d7_retained.
The reviewed source table CHECK has this same set. A test compares the candidate
policy directly with the current shared constant to flag drift.

Callsite/guard evidence:
- `src/pages/api/v1/acquisition/events.ts` accepts POST only; public events pass
  `parsePublicAcquisitionEvent` in `services/acquisition.ts`, which restricts names
  to landing_view/organic_entry/connect_cta_clicked and validates UUID, landing
  path and attribution. It uses the acquisition.events_ip middleware group. This
  is intentionally a public event-ingestion path, not an authenticated dashboard.
- Internal acquisition service helpers write activation_started, agent_connected,
  watchlist_created and first_match. The audit acquisition trigger writes d7_retained.
  All service upserts use ignoreDuplicates, requiring no UPDATE grant.
- `src/pages/api/console/acquisition.ts` uses injectConsoleOpsOwner plus the
  console.ops.read middleware group; the handler rejects auth errors/missing owner.
  Its middleware checks the configured console-ops owner/session rather than
  exposing dashboard data through the public event endpoint.
- `services/console-acquisition-dashboard.ts:79` requests CTA/interaction fields;
  full-row SELECT remains required by the adapter's inner SELECT t.*.

Composition is explicit: PostgreSQL permissive policies combine with OR. The new
analytics SELECT policy admits all acquisition rows, beyond the narrow trigger's
first_match/d7 rows; the INSERT policy admits the eight legitimate event kinds,
beyond d7 alone. Existing view SELECT policy overlaps harmlessly but does not
supply INSERT. Neither older narrow policy is deleted or silently rewritten.
This preserves trusted server-service behavior, not tenant isolation. Review
existing broader INSERT policies/ACLs as part of assembled authorization because
they could bypass this finite event policy; retain the source CHECK constraint.

The native fixture composes the narrow trigger and view policies with the new
candidate, inserts a non-d7 CTA event using ON CONFLICT DO NOTHING RETURNING *,
reads its CTA fields through an inner SELECT t.*, verifies idempotence and denies
UPDATE, DELETE and an unknown event name. Synthetic table/data only; actual dump
constraints/defaults, route E2E and deployed credentials remain independent gates.
