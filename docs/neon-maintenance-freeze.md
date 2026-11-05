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
