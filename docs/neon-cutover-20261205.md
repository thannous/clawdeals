# Neon cutover: 5 December 2026

Owner direction, 9 November 2026: continue the ClawDeals migration and have it
ready for a production cutover on **5 December 2026**, Europe/Paris. Preparation
does not switch production early. The execution time and final go/no-go must be
confirmed for the cutover window, against the actual candidate and evidence.

## Current baseline

The migration implementation is on `feat/neon-rebuild-20261105`. The 9 November
resumption first incorporated `origin/main` at `ccf90a788c63`, preserving the
previous implementation at `refs/archive/neon-readiness/20261109T150603Z`.
The separate security work in the primary checkout is being carried forward;
the primary checkout and its uncommitted changes remain preserved.

Read-only provider observations on 9 November, not a rehearsal:

- Supabase source `gztfmpuqtpvncdcuhqxy` is active. Its `public` catalogue contains
  63 ordinary tables, one partitioned table and six views. These are catalogue
  object counts, not row counts or a data-equivalence proof.
- Existing Neon project `blue-sky-13227894` (`clawdeals-migration`) is in
  `aws-eu-central-1`, on PostgreSQL 17.
- Planned target branch `br-nameless-meadow-b2wevmak`
  (`clawdeals-prod-migration-20261105`) lists no tables in `neondb`; Neon Auth is
  not enabled there. Project existence does not establish migration readiness.
- On 9 November, Managed Better Auth was enabled on the separate existing QA
  branch `br-soft-smoke-b2syeqry` (`clawdeals-webmcp-migration-20261105`). Email
  verification by OTP and session revocation on password reset are enabled.
  Its public JWKS and anonymous session endpoints returned HTTP 200; the session
  was anonymous and the JWKS exposed an EdDSA signing key. This checks service
  availability, not a successful login or account-linking journey.
- No production import, provider switch, notification, payment or source
  deletion was performed for these observations.

Do not treat the older [reconstruction receipt](./neon-reconstruction-status.md)
or its synthetic checks as a fresh pass on the resumed candidate. The canonical
9 November evidence is under the primary checkout's
`outputs/neon-readiness-20261109/`; it is private and excluded from Git.

## Preparation sequence

These intermediate dates are a proposed execution order within the owner's
5 December target; they are not claims that the work has passed.

| Target | Required result | Acceptance evidence |
| --- | --- | --- |
| 15 November | Candidate includes current main and the existing security corrections; adapter, grants and schema transformation agree. | Exact candidate SHA, independent review, `npm run verify:pr`, source-bound schema and authorization review manifests. |
| 22 November | Restore and rollback rehearsed on an isolated Neon target, with imported queues and external effects blocked. | Encrypted source-bound archive, actual-schema restore, row/key/constraint/sequence/media parity, least-privilege runtime tests, isolated restore receipt. |
| 29 November | Real identity and core journeys qualified against the intended providers. | Existing-owner dual-proof linking, email/Google login, logout/revocation, authorization and tenant isolation, public/private media, listings/deals/transactions and durable queue recovery. Synthetic provider fixtures alone are insufficient. |
| 4 December | Release candidate frozen and cutover/rollback operators ready. | Exact-SHA release gate, inspected deployment configuration, measured export/import/freeze durations, verified durable backup and tested restoration, hourly recovery service and backlog limits. |
| 5 December | Execute the approved cutover window. | Fresh final export and parity, go/no-go receipt, source freeze, approved deployment and selectors, production smoke, observation and a rollback preserving new writes. |

## Go/no-go evidence

Before switching selectors, record all of the following against the final SHA
and exact source/target identities:

1. **Schema and authorization:** actual archive-bound DDL, extensions including
   PostGIS, function and trigger bodies, views, roles, owners, grants, default
   privileges and approved transformations. The security geo migration is part
   of the candidate schema and must be included in this review and rehearsal.
2. **Database and media parity:** stable keys and counts, referential integrity,
   constraints, sequence values, domain behavior and complete object mappings.
   Check public listings and watchlist distances use the current public
   coordinate rules; no private evidence becomes publicly accessible.
3. **Identity continuity:** real Neon Auth configuration and approved origins,
   working Google/email flows and same-origin dual-proof linking. Retain the
   original Supabase identity links for rollback. No account is merged solely
   because email addresses match. QA currently uses Neon's shared Google and
   email configuration; production needs the application's own OAuth credentials
   and SMTP, the intended application name and trusted origins, email
   verification, and localhost access disabled. Follow the
   [Neon Auth production checklist](https://neon.com/docs/auth/production-checklist)
   and verify the resulting configuration on the production target itself.
4. **Operational continuity:** imported queues cannot drain during rehearsal;
   external emails, Telegram, PSP, Redis and other side effects remain blocked.
   The deployed recovery path and its credentials are verified, including the
   agreed hourly fallback and recovery after a missed wake.
5. **Release and recovery:** exact-candidate PR and release checks, an inspected
   preview/deployment, a durable backup that was restored, a measured freeze
   window, an explicit rollback decision and a tested way to retain new writes.

The source remains authoritative until the cutover is accepted. A failed or
unavailable check is a no-go with a named corrective action, not a passed gate.

## Cutover window

1. Confirm the time, exact candidate, service identities, successful evidence and
   operator go. Preserve the current deployment/configuration and backup receipt.
2. Enter the bounded write freeze; verify every writer, webhook, cron and queue
   respects it. Produce the final encrypted export and transfer manifests.
3. Restore the approved target; validate schema, permissions, final deltas, media
   and domain parity before any queue or external effect is enabled.
4. Use the guarded publication procedure and rebuild browser selectors together
   with the server configuration. Runtime-only environment changes cannot update
   the compiled public database/auth selectors.
5. Verify the real core journeys and operational recovery, then lift the freeze
   in the approved order and observe new writes and queue health.
6. If acceptance fails, preserve diagnostics and new writes, stop the affected
   writers and use the rehearsed rollback. A Vercel rollback alone restores
   neither database writes nor object storage nor provider configuration.

Do not cancel Supabase, delete its data, remove credentials or remove the only
restorable backup as part of this preparation or the initial switch.
