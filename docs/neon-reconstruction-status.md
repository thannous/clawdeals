# Neon migration reconstruction

This branch starts from db8f92afe93e9f78174ae8bbc1785b9ceb658ba6 on the Mac on 2026-11-05.
The earlier unpublished cloud working copy is unavailable. This is a new reconstruction,
not recovery of its Git objects; earlier test results do not validate this branch.

## Boundaries

Supabase production and sandbox remain authoritative and must be preserved.
Shapier and Noctalia remain active. No remote import, credential access, deployment,
subscription cancellation or Git publication is part of local reconstruction.
Default application providers remain Supabase until independently verified cutover.

## Work and fresh validation required

- Parameterized Neon query/RPC adapter and restricted runtime authorization.
- Verified Neon JWT/live session and explicit same-origin dual-proof owner linking.
- Durable queues, bounded direct Vercel wakes and approved hourly fallback.
- Restricted partition maintenance and explicit non-expiring maintenance freeze.
- Reader-compatible, opt-in encrypted idempotent response header/body envelope.
- Encrypted source-bound read-only export and isolated atomic rehearsal restore.
- Final freeze, parity/security/journeys, durable backup and rollback gates.

Every committed milestone is backed up as a verified incremental Git bundle against
this available base, with a HEAD/tree/checksum manifest, and persisted separately.
Bundles contain committed implementation only, never environment files, credentials,
source dumps or user data. Publication requires fresh exact-HEAD repository gates.

## Consolidated reference: 2026-11-05

Implementation reference `fd7761eccab04f5127c3f5f1c3e2cc04955af2d1` reconstructs
all listed local components. This is preparation, not a completed migration.
Fresh whole-checkout Vitest run: 263 files passed, 1,350 tests passed and one
skipped. Focused browser fixtures passed 5/5 under an unchanged macOS loopback-only
sandbox profile. Initial runs exposed configuration and SDK base-URL defects;
those failures were retained and corrected. Browser results use synthetic owners
and mocked provider responses, not actual Google or Neon Auth identities.

The adapter/queue/retention subset passed 72 tests; Auth constructor/UI regression
passed seven; v2 idempotence passed 85 targeted tests. These subsets overlap the
full suite and must not be added to its total. Native PostgreSQL/GPG transfer
fixtures and source-schema inventory checks passed separately. Whole-tree
TypeScript and scoped changed-file lint passed before this reference commit.

The exact-HEAD `verify:pr` gate did not pass: native Supabase initialization hit
sandbox shared-memory EPERM. The command was subsequently denied for potential
PostHog run/environment telemetry egress. It was not retried outside the sandbox,
and telemetry was not disabled. SDK registry prerequisites and historical corpus
checks are not established by the focused browser result. Next feedback submission
was separately refused; no feedback was sent. No Git publication is permitted on
this evidence.

### Remaining release blockers

- Actual archive-bound DDL identity/equivalence, original literal equality,
  approval of owner/ACL/default-ACL/role/dependency and extension mappings. Fresh
  metadata is available as an independent snapshot, not dump-bound. The reviewed
  schema-only artifact is separate, redacted and non-executable.
- Complete function/trigger/view/RLS privilege closure and actual-schema native
  restoration. Restricted queue/partition SQL remains a ROLLBACK review template;
  current restore admission intentionally does not admit the full source schema.
- The 12 dynamic census entries were traced to bounded current callsites; none
  identified an unsupported pattern. This does not prove future callers, live
  column/type availability, RPC dependencies or runtime authorization parity.
- Neon Auth activation, validated production Google configuration and same-origin
  dual-proof user validation. Neither email nor OAuth was performed locally.
- Verified deployed hourly recovery service and existing approved secret access;
  no inference of a free operational cron from code or delay acceptance.
- Isolated actual-data rehearsal with all external effects blocked, full parity,
  preview/deployed lifecycle checks, least-privilege runtime grants, and exact
  publication/release gates. No imported queues may be drained automatically.
- Final bounded write freeze, fresh sensitive-data/schema checks, durable
  recoverable backup and rollback preserving new writes. Source and sandbox remain
  authoritative; live migration and cancellation have not occurred.
