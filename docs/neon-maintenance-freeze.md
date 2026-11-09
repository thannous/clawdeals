# Explicit migration maintenance freeze

`CLAWDEALS_MIGRATION_FREEZE=true` blocks dynamic UI, API, Auth and internal cron
requests with 503/private no-store, including prefetch and upstream-router headers.
Static bundles and optimized images remain available. An unknown nonempty flag
fails closed. There is no automatic expiry. Remove it only after explicitly
choosing and verifying the authoritative backend. Default remains off.

This proxy gate is not proof that PostgreSQL is read-only. Before final export,
stop source cron/direct writers, drain in-flight application work and verify
server-side activity and frozen row-count evidence. A coordinator JSON attestation
alone is not that verification. Source data and sandbox must remain intact.

Rehearsal snapshots need not freeze production: they are coherent historical
copies, not cutover-ready state. Keep real-data rehearsal deployments frozen and
without outbound email/storage/provider credentials or queue/scheduler dispatch.
Test jobs only on synthetic fixtures with blocked external transports.

Complete real-account same-origin identity linking before global freeze, because
Auth routes are frozen too. Never copy a production cookie into a preview.
If export/import fails, preserve the source, record uncertain target outcome,
inspect before retry, and explicitly reopen only the verified authoritative side.
Rollback after target writes requires a verified reverse delta or preserving the
new authoritative database; do not blindly switch to an obsolete source snapshot.

Local proxy/matcher tests are not deployed HTTP or writer-quiescence proof.

## Final source-write freeze evidence

The new deployment's flag does not stop older Vercel deployments still reachable
by their immutable URLs, source Supabase cron, external schedulers, jobs already
in flight, direct database clients, or privileged SECURITY DEFINER RPCs. An alias
switch is not a freeze. Revoking ordinary table DML alone does not necessarily
prevent privileged RPCs or trigger-owned writes. Inventory and verify each writer
and its effective execution path before the final snapshot; wait for existing
transactions/jobs to finish and recheck activity during the freeze window.

Any source change to establish that freeze requires its own explicit authorization.
Current preparation and source inventories remain read-only. Do not rotate source
credentials, alter source grants, disable jobs, or change source settings merely
because this document describes a future step. Save the reviewed pre-freeze state
and define explicit failure/reopen steps for the chosen authoritative backend.

Real-account linking requires a valid existing first-party owner session on the
same production origin; an Auth-user row or active database session record does
not prove its holder still has that cookie. Verify the recovery/linking workflow
before removing old sign-in access. Linking is a write and cannot run while the
global freeze is active. Do not copy production cookies to a preview or infer an
existing owner's identity from email alone.
