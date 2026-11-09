# Neon queue wakes and recovery

Reconstructed local artifact, 2026-11-05. Not deployed or live-verified. The user
approved hourly recovery on that date; no free-tier or zero-bill guarantee follows.
Supabase remains default and its scheduler behavior is unchanged unless the new
Neon-specific options are enabled.

## Durable queues and direct Vercel dispatch

Preserve the four public queues, transactional producer triggers, private lease
state, notification eligibility/preferences and SQL functions. Apply the reviewed
Neon-only queue overlay after schema import, never against Supabase. It replaces
pg_net/Vault HTTP with a durable marker and a claim RPC. Do not install the old
five-minute database cron recovery on Neon.

After a successful database mutation/RPC, the app registers discovery/dispatch
with `@vercel/functions` 3.10.6 `waitUntil`. Existing queue consumers and existing
Vercel `QUEUE_DISPATCH_SECRET` are reused. No new Cloudflare broker, endpoint,
service or secret is involved. SQL coalesces claims across instances for 30 seconds
and respects five-minute drain leases. Bodies are `{}`; only four fixed handler
paths are allowed. Consumers suppress recursive wake hooks. Notifications also
reconcile schedules during an external lease claim, including idle recovery.

`CLAWDEALS_QUEUE_WAKE_ORIGIN` must explicitly match the platform-provided
VERCEL_URL or VERCEL_BRANCH_URL. VERCEL=1 and VERCEL_ENV preview/production are
required. Only production may use VERCEL_PROJECT_PRODUCTION_URL; preview rejects
that production origin even if incorrectly duplicated in the branch alias.
Host/Origin/Referer, arbitrary URLs and production defaults never select a target.
HTTPS only; userinfo, path, query, fragment and ports are rejected.

A valid live `getDeadline()` is required before registering work: waitUntil itself
can silently no-op outside request context. Missing/expired/invalid deadlines fail
closed without DB discovery. Discovery and HTTP share a maximum 25-second abort
budget, shortened by remaining invocation lifetime. The response never awaits a
consumer. One attempt per claimed queue, no immediate retries, redirects,
deployment-protection bypass or alternate-origin fallback. 401/403/login redirects
remain an explicit deployment/configuration blocker. Logs contain no credentials,
provider payloads, endpoint URLs or row data.

Invocation lifetime is not durable scheduling. Process shutdown, timeout, failed
wake, full batch or out-of-app SQL leaves rows for the next producer or hourly
recovery. Large backlogs can take multiple cycles; deferred notifications can be
up to an hour later than eligibility, never earlier. Monitor queue age and
`queue.neon_wake_unavailable`. Verify actual deployed getDeadline/waitUntil support
and post-response consumer completion before enabling automatic dispatch.

## Existing Worker scheduling

Opt-in `CLAWDEALS_CRON_PROFILE=neon-hourly` combines Worker database-backed tasks
at minute 2 of each hour. Six-hour expiration joins at 00/06/12/18 UTC; daily
retention/digest jobs join at 02:02 UTC. Other existing Worker triggers do no database
work in this profile. The existing Vercel 03:00 UTC trustscore sweep remains and
normally overlaps 03:02. No Worker secret/configuration is changed by these files.
A production Worker APP_ORIGIN is not isolated-preview recovery.

At 0.25 CU, a five-minute suspend timeout and negligible execution duration:
- Always awake: 0.25×24×30=180 CUh per 30-day month.
- One hourly wake: 0.25×(5/60)×24×30=15 CUh.
- Two distinct hourly wakes: 30 CUh (60 at 0.5 CU, 120 at 1 CU).
- An additional isolated daily wake: 0.625 CUh.
- Five minutes of actual hourly processing plus five to suspend: 30 CUh.

Include real traffic, retries, other branches and execution duration. Verify
current Neon limits, compute size, suspension and actual metrics. Quota exhaustion
can affect availability; these estimates are not a promise of free operation.

## Role policy and security gates

The existing approved app principal is **clawdeals_app**, provisioned separately;
do not create a second runtime role. **clawdeals_functions** is a distinct NOLOGIN,
non-owner, NOBYPASSRLS definer role with no app membership. Private queue state
keeps FORCE RLS. Merely importing Supabase's SECURITY DEFINER helpers does not
establish safe Neon privileges: the source's privileged owner masked this issue.

The queue-only role template ends in ROLLBACK pending full imported privilege
closure review. It defines only these dependencies:
- private.queue_dispatch_state: SELECT/INSERT/UPDATE, explicit policy limited to
  four queue names. No runtime private access and no table ownership.
- Match/backfill/trustscore queues and notification_preferences: SELECT.
- notification_outbox: SELECT, plus UPDATE of available_at/schedule_preferences
  on PENDING rows only.
- Exact wake/lease/schedule helper ownership, fixed empty search_path and three
  public SECURITY DEFINER wrappers. App gets only those specific EXECUTEs.

Review remaining app-table policies, inherited grants, restrictive policies,
TEMP/schema CREATE revocation, maintenance privileges and business RPCs separately.
No blanket RLS disable, owner credential, runtime bypass or unrestricted private
access is a valid workaround. The local SQL fixture imports checked-in source
notification helpers plus the new overlays, exercises restricted wrappers and
rejects private access. It is not a complete live-catalog privilege audit.

## Maintenance and release verification

Audit/report retention and partition maintenance route to the Neon adapter when
selected, without source REST calls. Observability remains active without source
credentials. Missing Neon DATABASE_URL is a hard error, never fallback or skip.
Partition creation requires its own bounded maintenance-owner plan.

Before approved deployment: compare imported catalogs/data; apply reviewed role
and queue overlays on an isolated target; verify quiet hours, retries, concurrent
leases, full batches, failed/aborted wake and an idle hour; verify preview origin,
authorization and protection behavior; confirm existing hourly jobs actually run;
observe suspension/CU usage; preserve source and reversible data delta/freeze.
No historical test count, local fixture or config flag proves migration complete.

References: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
and https://vercel.com/changelog/waituntil-is-now-available-for-vercel-functions .
Modern App Router can use Next.js after; this Pages Router app uses the supported
Vercel runtime helper and still requires deployed lifecycle validation.

### Bounded partition candidate

`scripts/migration/neon-partition-role-plan.sql` is a separate ROLLBACK review
candidate, not an approved apply script. It requires a separately approved
NOLOGIN `clawdeals_maintenance` role, without superuser/BYPASSRLS/role creation or
runtime membership. This role owns only the audit parent and its named direct
partitions and needs CREATE on public to create future children. It is intentionally
separate from the queue role, which owns no tables. The app receives only the fixed,
no-argument public RPC, not private schema access or DDL. Current plus next two UTC
months are the only possible targets; names, attachment and bounds are checked.
Existing children keep FORCE RLS; future children have no direct app grants. App
reads/writes through the parent require its separately reviewed app policy/grants.
The candidate does not settle inherited/legacy grants or other function owners.
Review and revoke inappropriate pre-existing grants before any apply. The local
fixture proves wrapper creation/idempotence, parent insertion, and denial of
private calls, child access, arbitrary arguments and runtime DDL. It does not prove
production ownership transfer, full imported schema closure or deployed operation.

Source review also verified the audit parent's
`capture_acquisition_d7_retention()` trigger. Maintenance needs EXECUTE on this
exact function for PostgreSQL to clone the trigger onto new partitions. The
fixture uses the repository's actual trigger definition and proves creation fails
without this grant, then succeeds with it. Runtime trigger execution still needs
separate acquisition-table grants/policies on the non-early-return path. The
partition function fixes both UTC and ISO/YMD so caller DateStyle cannot change
its bound validation.

## External operational status

The hourly recovery candidate is the repository's Cloudflare edge-router Worker
(`workers/edge-router.ts`), not a presumed free hourly Vercel Cron. Its deployed
existence, current schedule, authenticated connection and secret configuration
have not been verified by this reconstruction. The code is prepared, not deployed
or operationally tested. Acceptance of an approximately one-hour recovery delay
is not permission to transmit CRON_SECRET to Cloudflare or create persistent
access. Verify existing approved configuration; obtain any required approval for
new secret transmission/access before deployment. No restored queue has been
drained. Immediate self-origin Vercel wakes reuse its existing dispatch secret and
do not require a new Cloudflare secret, but cannot replace unattended recovery.

## Reviewed per-signature dependency closure (2026-11-05)

Evidence: separately held source catalog SHA-256
`e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491`,
plus its sanitized schema review. Neither artifact is a restorable dump or proof
that a later dump matches. All three queue/partition SQL files now end ROLLBACK.
Only disposable fixtures explicitly replace that final statement. Missing imported
send/claim/configure signatures fail the queue overlay before replacement.

Exact routine groups and target changes:

| Signatures | Target treatment and direct dependencies |
| --- | --- |
| `private.send_queue_wake_v1(text)` | Replace net/Vault call with bounded queue state INSERT. Nonowner `clawdeals_functions`, SECURITY DEFINER, empty path. |
| `private.wake_queue_consumer_v1()` | Retain reviewed trigger body; calls send, reads NEW/OLD only. Same nonowner definer. |
| `private.queue_drain_claim_v1(text,uuid)` | Replace with state lease INSERT/UPDATE plus notification reconciliation. Same nonowner definer. |
| `private.queue_drain_release_v1(text,uuid)` | Retain token-qualified state UPDATE. Same nonowner definer. |
| `private.notification_schedule_preferences_v1(jsonb)` | Retain pure JSON projection, SECURITY INVOKER; owned by functions role for internal EXECUTE. |
| `private.notification_event_enabled_v1(jsonb,text)` | Retain pure event selection, SECURITY INVOKER; same owner. |
| `private.notification_eligible_at_v1(jsonb,timestamptz)` | Retain scheduling calculation, SECURITY INVOKER; pg_catalog timezone view/functions only, same owner. |
| `private.schedule_notification_row_v1()` | Retain BEFORE trigger; SELECT preferences, pure helpers, edits NEW fields. Nonowner definer. |
| `private.reschedule_owner_notifications_v1()` | Retain preference trigger; helpers plus UPDATE of two schedule columns on PENDING outbox rows. Nonowner definer. |
| `private.reconcile_notification_schedules_v1()` | Retain reconciliation; SELECT outbox/preferences and same two-column UPDATE. Nonowner definer. |
| `private.retry_pending_queue_wakes_v1()` | Retain reviewed body under functions owner; SELECT three queues and due outbox, calls reconcile/send. No runtime EXECUTE, no Neon database cron installation. |
| `private.configure_queue_dispatch_v1(text)` | Replace Vault operation with explicit exception; SECURITY INVOKER, functions owner, no runtime EXECUTE. |
| `public.queue_drain_claim_v1(text,uuid)`, `public.queue_drain_release_v1(text,uuid)` | Existing wrappers become empty-path SECURITY DEFINER owned by functions role; app EXECUTE only. |
| `public.claim_neon_queue_wakes_v1()` | Explicit new app-dispatch wrapper, not a claimed source RPC. Same owner; reconcile plus bounded pending reads/state claim. |
| `private.ensure_audit_log_partitions()`, `public.ensure_audit_log_partitions()` | Bounded replacement plus existing wrapper, maintenance owner, fixed UTC/ISO path and exact capture-trigger EXECUTE. |
| `public.capture_acquisition_d7_retention()` | Retain SECURITY INVOKER and empty path. App needs five-column acquisition SELECT/INSERT; maintenance needs function EXECUTE only for cloning. |

For the acquisition trigger the exact columns are acquisition_id, event_name,
occurred_at, agent_id and market_code. SELECT policy must expose both first_match
and d7_retained: PostgreSQL's ON CONFLICT visibility requires the latter even
though the source SELECT filters first_match. INSERT policy admits d7_retained
only. No sequence, UPDATE, DELETE or maintenance acquisition-table grant is needed.
The UUID default is gen_random_uuid; source table review found no outbound user
trigger on acquisition_funnel_events. This narrow trigger policy does not supply
other app analytics operations and must be reconciled with the generic app grant
review rather than interpreted as a complete analytics policy.

Fresh isolated tests exercise a SUCCESS audit with a real agent ID and old
first_match, duplicate/conflict idempotence, rollback of the audit write without
INSERT privilege, rejection of first_match insertion and deletion by the narrow
role, and retention of SECURITY INVOKER. Queue tests additionally execute real
notification scheduling, permanently quiet preference, preference rescheduling,
attempt backoff and reconciliation under the nonowner definer. These use actual
repository routine bodies and fixture-shaped tables, not the full imported dump.

Remaining precise inputs before apply:
- Bind the actual unredacted dump's routine bodies, ACLs, triggers, table defaults,
  constraints and policies to this reviewed catalog; reject drift or unreviewed
  overloads. PostgreSQL catalog dependencies alone omit PL/pgSQL body references.
- Generic authorization assembly must remove source service_role/anon/authenticated
  grants where present, review owner-role ACLs and inherited membership, and merge
  narrowly added policies without accidentally broadening other app policies.
- Provisioning/approval of NOLOGIN functions and maintenance principals is separate.
  The existing app principal must retain no role membership, private access,
  ownership, schema CREATE or database TEMP privilege.
- Exercise the full restored acquisition constraints/defaults and producer triggers
  on native PostgreSQL, including all four wake triggers and outbox transaction
  rollback. The current fixture proves named paths, not every imported trigger.
- Validate app authorization and actual hosted execution before cutover; no source
  scheduler, role, data or configuration has been changed by this review.

Native PostgreSQL 17 fixture also passed on the existing official local binaries:
`PG_FIXTURE_BIN=/path/to/verified/pg17/bin node --test scripts/migration/neon-queue-partition.native.test.mjs`.
It initializes a synthetic temporary cluster, listens only on a Unix socket and
stops/removes the cluster afterward. The initial sandbox run could not allocate
shared memory; the reviewed escalated run succeeded. It executes the repository
routine bodies and all four source producer triggers, proves transactional marker
rollback, four-queue discovery/coalescence, quiet-to-due rescheduling, the successful
acquisition write/idempotence, missing-grant atomic rollback and role denials.
It does not load the actual dump, reproduce all table constraints/defaults, test
PostGIS or substitute for target restoration. Thus the earlier native-test gate
is reduced to full imported-schema parity and live role/catalog validation, not
availability of PostgreSQL or PostGIS binaries.
