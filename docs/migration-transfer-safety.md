# Reconstructed transfer safety, 2026-11-05

This is a new reconstruction from behavioral summaries, not recovery of the lost
commits. It is a local tooling milestone, not a completed migration or a release
gate pass. No live source census, provider fingerprint, credential or export is
bundled. Existing `export-supabase-postgres.mjs` production refusal is unchanged.

## Current scope and deliberate limits

`bound-transfer.mjs` implements only explicitly named rehearsal commands. Final
export/import/cutover commands fail closed. The bounded write-freeze validator
requires verified disabled writers, a maximum one-hour window, at least twenty
minutes remaining and a rollback policy preserving post-cutover writes. It is
not connected to a final transfer execution path. Rehearsal never fabricates
freeze evidence and is always final-import/cutover ineligible.

The reconstructed rehearsal SQL executor currently supports a narrow grammar:
application schemas, simple typed tables and COPY FROM stdin. It refuses routines,
views, triggers, extensions, non-enum custom types, expressions and dependencies requiring
separate review. This is an intentional interim capability boundary, not a claim
that actual Clawdeals dumps are restorable. The next phase must review actual
sanitized DDL structurally, its dependencies and privileges; implement explicit
queue/net/Vault/Auth transformations; and validate them on isolated PostgreSQL.
Do not relax these blockers merely to make an import succeed.

The legacy portability transformer strips whole policy statements, not individual
lines, and preserves COPY data and dollar bodies. It is a preparatory tool, not
an authorization sandbox. `catalog-inventory.sql` reads public/private definitions
and extension metadata without data rows. `compare-catalogs.mjs` compares those
objects; it never asserts row parity. Full parity still needs columns, indexes,
constraints, grants, row counts/content, sequences and behavioral verification.

## Secrets and artifacts

Pass JSON only through `--secrets-stdin`; accepted fields are `source_url`,
`target_url`, `artifact_passphrase`. Never put credentials in argv, env files or
logs. URLs may specify only supported sslmode; every PostgreSQL child forces
`verify-full`, preserves explicitly configured `PGSSLROOTCERT`/CRL paths and a
private owned `PGPASSFILE`, and removes other ambient PG settings. Use an official
verified CA when the provider is not trusted by the local root store. Do not
replace verification with `require` or disable it. Password/user/database are
passed in the PostgreSQL child environment, not its argv.

Archives, reviewed SQL and sensitive manifests are GPG AES256 encrypted at rest.
Use one cryptographically random passphrase of at least 32 bytes retained in the
orchestration process across all stages. It is delivered on an anonymous GPG file
descriptor. A short-lived agent uses a private temporary GPG home, no symmetric
key cache, and is explicitly terminated before that owned directory is removed.
Errors suppress subprocess stderr because it can contain secrets or data.
Buffers are wiped best effort; JavaScript strings, OS swap and core dumps prevent
an absolute in-memory erasure guarantee. This is not a hardened secret enclave.

Artifacts stay under `migration-artifacts/`, with private owned directories/files,
no symlinks and exclusive creation. chmod is not encryption. No plaintext dump or
SQL file is written. Reusing an output directory is refused. The bounded memory
limit is 256 MiB and each child has a fifteen-minute timeout; larger exports need
an explicitly reviewed streaming implementation, not removed limits.

Losing the orchestration RAM key loses the rehearsal artifacts. That is acceptable
only while source remains preserved and these are explicitly not durable backups.
Before decommissioning anything, retain an independently recoverable encrypted
backup and verify its durable key recovery. public/private dumps do not constitute
complete provider backups: Auth, storage, secrets, schedules and other schemas
need separate authorized handling.

## Callable workflow

All paths below must refer to private files/directories under migration-artifacts.
A plan digest binds an internally reviewed exact operation; it is not a substitute
for source/data/destination authorization. Planning performs no database access.

1. `node scripts/migration/bound-transfer.mjs rehearsal-plan --source-ref=REF --out-dir=migration-artifacts/NEW_PLAN --secrets-stdin`
   Stdin contains source_url. Writes source-bound rehearsal-plan.json and prints
   its SHA256. Source must be the exact Supabase ref, direct or session pooler5432.
2. `node scripts/migration/bound-transfer.mjs rehearsal-export --plan=migration-artifacts/NEW_PLAN/rehearsal-plan.json --out-dir=migration-artifacts/NEW_EXPORT --execute --approved-plan-sha256=SHA --secrets-stdin`
   Stdin contains source_url and the shared artifact_passphrase, never target_url.
   Without --execute this is dry-run. One read-only custom pg_dump captures a
   coherent public/private snapshot while source writers may continue. Success
   requires decrypt/hash verification, pg_restore --list and encrypted manifest
   parsing roundtrip. It does not prove data restoration or complete backup.
3. Prepare reviewed encrypted SQL and fresh target/isolation evidence. Call
   `rehearsal-import-plan --manifest=.../rehearsal-manifest.json.gpg --prepared-sql=.../reviewed.sql.gpg --target-evidence=.../target.json --rehearsal-evidence=.../isolation.json --out-dir=migration-artifacts/NEW_IMPORT_PLAN --secrets-stdin`
   Stdin contains target_url and shared artifact_passphrase, never source_url.
4. `rehearsal-import --plan=.../rehearsal-import-plan.json.gpg --secrets-stdin`
   is dry-run. Execution additionally requires --execute, exact
   --approved-plan-sha256, fresh --target-evidence and --rehearsal-evidence,
   and a new --out-dir. No source freeze or source credentials are accepted.

Target evidence requires observed_at within fifteen minutes, project_id, branch_id,
host, database, restore_user, isolated_rehearsal:true and a complete runtime_roles
list. The direct Neon endpoint and exact user/database must match. Runtime app
credentials are never accepted as restore administrator credentials.

Isolation evidence requires those project/branch/user identities, observed_at,
source_archive_sha256, reviewed_sql_sha256, runtime_roles, provider_schemas and
true values for isolated_rehearsal, application_writers_disabled,
external_job_runners_disabled, no_outbound_or_scheduled_jobs,
provider_schemas_untouched. These attestations must be verified, not invented.
provider_schemas is empty unless an actual managed neon_auth exists. In that case
supply its verified owner, name:neon_auth, provider_owned_verified:true and
catalog_md5 obtained from PROVIDER_CATALOG_FINGERPRINT_SQL on that exact target.
No owner is assumed from its name. No real provider metadata is currently bundled.

## Atomic execution and uncertainty

A single psql transaction contains an advisory lock, actual empty-target checks,
provider owner/fingerprint check, restore, PUBLIC lockdown, effective runtime-role
checks, and a second provider fingerprint check. Only a specifically verified
neon_auth schema may coexist. Unknown schemas, existing application objects,
extension-owned application objects, non-plpgsql extensions, event triggers,
foreign servers and subscriptions cause refusal. No provider grants are altered.
The fingerprint covers static namespace/relation/column/default/index/type/enum/
sequence/routine/view/constraint/trigger/policy definitions, not user rows or
current sequence values; autovacuum statistics are excluded.

PUBLIC schema/table/sequence/routine grants are revoked before commit. Declared
runtime roles must have no effective application privileges, ownership or elevated
membership pathways, including NOINHERIT membership. Default ACL grants therefore
cause rollback, not temporary exposure. Undeclared external principals are not
covered: require a complete runtime inventory and independently disabled external
runners. Object grants can be reintroduced only in a separately reviewed step.

Before contacting the target, execution creates an uncertainty marker. Success
adds a separate result only after confirmed psql completion. Failure, timeout or
interruption leaves the marker; never infer rollback merely from a client error,
retry blindly, overwrite artifacts or delete target/source data. Inspect actual
transaction outcome before a separately authorized next step.

## Fixture verification

`node --test scripts/migration/transfer-safety.test.mjs scripts/migration/rehearsal-restore.test.mjs scripts/migration/neon-migration-safety.test.mjs`

Set `PG_FIXTURE_BIN` to verified official PostgreSQL binaries for the native isolated
fixture. Without it, the native test is explicitly skipped. The fixture initializes
its own temporary local cluster with no TCP listener, synthetic roles/data, and
stops it/removes only its own directory. It tests rollback, nonempty refusal,
provider preservation and runtime default ACL isolation. GPG tests use only
synthetic data and exercise wrong keys, tampering, private files and no overwrite.
Neither these tests nor syntax/lint checks constitute verify:pr, browser coverage,
actual source restorability or live Neon validation.
