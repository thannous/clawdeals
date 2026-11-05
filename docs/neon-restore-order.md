# Standard PostgreSQL restore order: bounded evidence

## Required order

For a reviewed, target-compatible custom-format archive, retain PostgreSQL's
**pre-data → data → post-data → reviewed activation/permission overlays** order.
Render the three sections using `pg_restore --section=pre-data`, `--section=data`
and `--section=post-data`, with the reviewed ownership/ACL handling. Apply them
and the overlays through one `psql --single-transaction -v ON_ERROR_STOP=1`
connection. Render successfully before execution; do not pipe a potentially
failing producer into an unchecked consumer. Reject embedded transaction control
or other content that invalidates the single-transaction boundary.

Do **not** install a complete schema, including row/event triggers, and then run a
data-only restore. COPY invokes already-installed triggers. That can mutate
imported records, enqueue work, append audit events, notify consumers or execute
other application behavior. Removing trigger side effects afterward is not an
adequate substitute for correct ordering.

Post-data and overlays may need their own reviewed ordering: target-compatible
function replacements and prerequisites must exist before the trigger definitions
that depend on them. Runtime writers and consumers must remain disconnected until
all post-data, RLS, function-owner, role-membership, ACL and default-privilege
checks succeed. Close permissions **before commit**, not in a second connection.
Use an actual restricted LOGIN principal for execution; no administrator session
with SET ROLE, trigger disabling, replication-role changes or superuser bypass.

## What the native fixture proves

`scripts/migration/restore-section-order.native.test.mjs` builds a fresh synthetic
PostgreSQL cluster. It does not read a source dump, source rows or credentials.
The administrator only creates databases/roles and initial database lockdown.
All fixture DDL, synthetic rows, dump, restore and verification then use a genuine
LOGIN with no superuser, BYPASSRLS, replication, role creation, database creation
or role memberships (including file/program roles).

The fixture uses standard `pg_dump -Fc` and renders standard `pg_restore`
sections. It verifies:

- The pre-data section has no CREATE TRIGGER; catalog assertions before and after
  COPY find zero user triggers on the copied table.
- Two copied payloads are unchanged, the queue stays empty and the audit counter
  stays zero. Stored generated values are reconstructed correctly.
- Post-data installs an ordinarily enabled AFTER INSERT trigger. A new insert
  after successful commit mutates only the new row, enqueues once and increments
  the audit counter once.
- Schema/table/function privileges are closed to an independent outsider and
  PUBLIC before commit; an outsider LOGIN cannot read the restored rows afterward.
- A deliberately failing constraint appended after successful post-data and
  lockdown aborts the entire transaction: no imported schema or objects remain,
  no default-ACL changes remain, and a pre-existing sentinel survives unchanged.

The synthetic cluster listens only on its fresh private Unix socket and is stopped
and removed after the test. It never reuses another worker's socket. This is not
an OS network-denial proof: no broad process sandbox claim is made.

## Expressions still execute without triggers

Section order prevents premature application-trigger execution; it does not make
arbitrary schema or COPY execution safe. Pre-data can install CHECK expressions,
generated expressions, type input functions, domains and functions. Generated
columns are recalculated during COPY. CHECK constraints are evaluated. Defaults
can execute when input omits columns or explicitly uses default behavior; ordinary
pg_dump COPY column lists usually supply stored non-generated column values.
Post-data can execute expressions while building indexes or validating constraints.
Extension installation and function languages introduce additional executable
behavior. Review their dependencies, privileges and effects before execution.

The fixture includes a stored generated expression and a positive-amount CHECK.
Its arithmetic expressions are deliberately harmless. It does not prove that all
expressions in the Clawdeals schema are harmless. Read-only inspection of the
2026-11-05 schema-review artifact (SHA-256
`278840d0158e3f26895860e96e019265bfec8c3a35e1cf7e270db31bc7693d0d`)
confirmed examples such as `gen_random_uuid()`, `now()` and CHECK expressions.
That inspection was not execution or a complete expression/dependency audit.

A database transaction also cannot undo external network/file effects or every
nontransactional effect (for example, sequence advances on existing sequences).
The fixture has no such functions and tests only ordinary transactional DDL/data.
Its rollback result is not evidence that executing arbitrary dump SQL is safe.

## Reproduce and scope

Use independently verified official PostgreSQL 17 binaries, already installed:

```sh
PG_FIXTURE_BIN=/path/to/verified/postgresql17/bin \
  node --test scripts/migration/restore-section-order.native.test.mjs
```

On 2026-11-05 this test passed against PostgreSQL 17.11, one test, zero skips,
using the existing official tool installation on the Mac. The first ordinary
sandbox run failed at initdb's shared-memory allocation (`shmget: Operation not
permitted`); the reviewer-approved local run passed. Syntax checking also passed.
No package installation, telemetry operation, remote connection, source-copy
execution or gate change was performed.

This is a focused standard-tool fixture, **not a new general-purpose importer**.
It does not relax or replace the existing bounded-transfer contract, actual-dump
hash binding, source authorization, schema/object inventory, target principal and
permission closure, external-effect containment, or real import/reconciliation
gates. Source copy remains gated. A full-schema rehearsal with empty tables cannot
substitute for the ordered-copy proof, and this synthetic proof cannot substitute
for the reviewed actual migration.
