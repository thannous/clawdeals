# Six invoker views: server-role review

Status: local review candidate, not an imported or production privilege closure.
Supabase remains the default. No remote grants, role changes, imports or deployment
were performed by this work. The SQL ends with ROLLBACK deliberately.

## Evidence and target semantics

Reviewed 2026-11-05 against the separately retained source schema review SHA256
`278840d0158e3f26895860e96e019265bfec8c3a35e1cf7e270db31bc7693d0d`
and source catalog review SHA256
`e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491`.
These are redacted, review-only artifacts, not an importable archive. Their raw
contents are not copied into this repository. Actual archive/DDL binding remains
a separate gate; these hashes do not establish restore parity.

All six source views are owned by `postgres` and have
`security_invoker=true`. Their source relation ACLs grant postgres/service_role
`arwdDxtm`; there are no anon/authenticated view grants. All twelve base relations
below are owned by postgres with both ENABLE and FORCE RLS and the same ACLs.
The catalog's column_acl is null (no explicit column ACL entries). Each base
relation has only `deny_all_anon_authenticated`, a permissive ALL policy targeting
anon/authenticated with USING(false) and WITH CHECK(false). None grants visibility
to a new app role. The RLS flags on views themselves are false, as expected: the
security boundary is the invoker's access to underlying relations.

The intended target is a server-only, nonowner, NOSUPERUSER/NOBYPASSRLS/NOINHERIT
`clawdeals_app`. It replaces global service-role reads, not browser access or
per-tenant DB authorization. Keep all views invoker, rather than changing owners
to obtain definer bypass. Exact grants alone produce default-deny empty aggregates
for a new NOBYPASS role. Therefore the candidate adds an explicit named SELECT
policy, `clawdeals_view_app_read USING(true)`, on each reviewed base relation.
Those policies are global server read access, **not tenant isolation**. They
preserve applicable restrictive policies, but permissive policies combine with OR;
a permissive tenant filter alone cannot constrain this global role.

## Per-view dependency and column closure

All names below are in public. Only SELECT is needed by the views. No sequence,
private schema, mutation, custom-function EXECUTE or extension grant is introduced.
Built-in date/JSON/aggregate operators use normal PostgreSQL privileges.

| View | Direct dependencies and required base columns | Semantics and RLS boundary |
| --- | --- | --- |
| acquisition_funnel_summary | acquisition_funnel_events: acquisition_id, occurred_at, event_name, landing_path, locale, market_code, source, medium, campaign, channel, cta_location, interaction_type | Groups visible events by acquisition_id; event FILTER clauses choose milestone timestamps and attribution fields. It does not filter owners/tenants. |
| acquisition_revenue_attribution_summary | acquisition_revenue_attributions: escrow_id, acquisition_id, occurred_at, currency, gross_volume_minor, platform_revenue_minor, attribution_model; plus acquisition_funnel_summary SELECT and its full base dependency above | LEFT JOIN by acquisition_id. Both views remain invoker. Revenue may remain with null funnel attribution if underlying funnel events are restricted. Granting only the outer view is insufficient. |
| ops_obs_market_gauges_v1 | deals: deal_id, market_code; listings: listing_id, market_code; watchlists: market_code, active, deleted_at; watchlist_match_queue: updated_at, entity_type, entity_id; watchlist_matches: matched_at, entity_type, entity_id; notification_outbox: status, last_error, entity_type, entity_id | Fixed FR/GB/ES rows. Counts, queue oldest timestamp, 24h matches and notification counts depend on each relation's visible rows and joins. Zero counts can mean denied rows, not empty source data. |
| ops_obs_queue_depth_gauges_v1 | approvals: state, created_at; trustscore_recalc_queue: updated_at; watchlist_backfill_queue: updated_at; watchlist_match_queue: updated_at | Four queue rows with counts/minimum timestamps; only approvals are filtered to PENDING. Each branch independently applies caller RLS. |
| ops_sli_api_write_journeys_daily_v1 | audit_logs: occurred_at, action, request | Parent-table access; no direct grants on partitions. Groups deal/listing/offer create requests by day/event, excludes missing status codes, computes success and latency. Column grants expose entire action/request JSONB values, not only event/status/duration keys. Malformed numeric JSON values can still raise existing cast errors. |
| ops_sli_approvals_resolve_daily_v1 | approvals: resolved_at, created_at | Excludes unresolved rows; groups by resolution day with p95 duration and four-hour percentage. State is not a filter here. |

The column union is encoded explicitly in
[`neon-view-role-plan.sql`](../scripts/migration/neon-view-role-plan.sql). The
candidate checks all six view identities/invoker flags, all twelve base
ENABLE/FORCE RLS flags, and absence of owner-role membership for the app. It does
not recreate views, disable RLS, change owners, create roles, alter default ACLs,
grant ALL, use ALL TABLES or touch Supabase. Unexpected preexisting same-named
policies fail the transaction rather than being silently replaced.

A grantee can read any granted column directly, subject to the same RLS. The views
are not an aggregate-only access boundary. In particular `last_error`, attribution
columns, and complete audit JSONB require server-only treatment. Extra table-wide,
PUBLIC or inherited grants elsewhere can expand the effective permissions; this
candidate does not revoke unrelated permissions and does not claim to constrain
the union of all migration candidates.

## Callers and overlap

`src/server/services/console-acquisition-dashboard.ts` reads both acquisition views
using the service client. It also reads CTA columns from acquisition_funnel_events
with event/time filters. `src/pages/api/console/acquisition.ts` wraps its GET handler
in `injectConsoleOpsOwner` and middleware route group `console.ops.read`. In
production `console-ops-identity.ts` requires a valid active, unexpired owner
session, a nonsuspended owner, and the configured console-ops owner allowlist.
The dashboard is intentionally global, not scoped to the requesting owner's data.
The four ops views have no direct `src` query caller in this checkout; their source
migration purpose is administrative dashboards.

The direct-table candidate uses separate `neon_direct_*` policies and may need
whole-table SELECT because the adapter emits `SELECT t.*` / `RETURNING t.*`.
That independently reviewed broader access dominates column-only grants on shared
tables. Queue-function policies target a different NOLOGIN function role and do
not themselves authorize app reads. Acquisition direct-query closure needs explicit
integration: a projected CTA query implemented internally with `t.*` may need a
broader acquisition grant or a changed adapter. View-only tests do not settle it.

## Native regression evidence

Run only against verified official PostgreSQL 17 binaries:

```sh
PG_FIXTURE_BIN=/path/to/verified/pg17/bin node --test scripts/migration/neon-views.native.test.mjs
```

The fixture creates a fresh temporary cluster, clears ambient PG connection
settings, listens only on its unique Unix socket, and stops/removes its own
cluster. No CLI authentication, network, telemetry or source rows are used.
It extracts the six repository view bodies from these reviewed migrations:

- 20260810113000_acquisition_revenue_attribution_v1.sql (both acquisition views).
- 20260716101211_launch_markets_fr_gb_es.sql (market gauges).
- 20260709100000_watchlist_match_queue_observability_v1.sql (queue gauges).
- 20260209200000_ti_288_sli_dashboard_views_v1.sql (both daily SLI views).

Source definitions were manually reviewed against those bodies. Synthetic tables
include only required source column types plus visibility/private test fields;
this is not an exact imported schema, dependency OID, partition, trigger or
constraint parity test. The runner sets invoker flags to match the source's later
ALTER VIEW operations. A synthetic owner sees both rows; the nonowner app sees the
rows allowed by its policies.

Verified: ROLLBACK leaves grants absent; wrong definer mode, missing FORCE RLS and
BYPASSRLS roles fail closed; grant-only access stays default-deny; explicit global
server policies expose both synthetic rows; adding applicable restrictive filters
returns one row/count through every view; missing nested-view or dependency-column
SELECT is denied; unauthorized private schema/columns, mutations, public schema
CREATE, TEMP, and anon/authenticated view reads are denied. All six invoker flags
remain true. The ungranted-column assertions apply to this isolated candidate,
not to the broader direct-table grant union.

Outer sandbox shmget restrictions required reviewed execution escalation for the
local fixture. This is host shared-memory permission, not remote access. No
browser QA, application route integration, imported archive restore or production
check is claimed. Before applying elsewhere, bind exact archive/view definitions,
review effective memberships/ACLs and the combined policy union, confirm server
credential isolation and API authorization, and test all dependent runtime queries.
