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
