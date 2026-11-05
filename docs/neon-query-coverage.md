# Reconstructed Neon query coverage, 2026-11-05

This Mac worktree rebuild is a new artifact derived from retained conversation
code and the checked-out source, not a byte-identical copy of the lost checkout.
Old commit IDs/test counts do not identify or validate this tree. Supabase remains
the default database; Neon is an explicit independent selector. Authentication and
storage remain independently selected and lazily initialized.

Run `node scripts/migration/audit-query-surface.mjs` for the static AST census of
server/API `.from`/`.rpc` calls, chained builder continuations, projections and
unresolved expressions. Buffer/Array/storage `.from` calls are excluded. Conditional
and identifier-bound literal projections are resolved. Function-parameter table
and projection names remain explicit dynamic review items; this is not proof of
live schema parity. A test fixture deliberately adds unsupported methods and an
unknown relationship to prove the census flags them. Review census changes with
new application queries, not only the aggregate totals.

Supported explicit relationships:
- watchlists → agents (inner owner checks).
- api_keys → agents (left join, whitespace syntax).
- agent_installations → agents and owners (OAuth owner suspension checks).
- agents → owners (trustscore verification).

Unknown relationships and unsupported syntax fail closed. The compiler validates
identifiers and parameterizes values. SQL JSON record conversion preserves defaults,
SQL arrays and JSON arrays. Named RPC arguments use PostgreSQL catalog types;
missing signatures return PGRST202, ambiguous signatures PGRST203. Scalar JSON,
SQL NULL, composite rows and scalar/table sets keep their result shape. RPC writes
remain one SQL function call. Invalid mutation single-cardinality raises inside
the same statement, rolling back the mutation instead of silently choosing a row.

PGlite tests cover these concrete failure modes, count/head/page semantics,
owner-restricted joins, related-field projection, OR filters, JSON paths, arrays,
upsert, aborted requests and injection strings. Mock tests cover lazy independent
provider initialization and role gates. These are local checks, not deployed E2E
or full imported-database parity. SQL role policy and partition DDL checks have
separate artifacts and requirements.

Runtime SQL requires a non-owner principal without SUPERUSER/BYPASSRLS,
CREATEROLE/CREATEDB/replication, elevated memberships, schema CREATE or database
TEMP. Ownership checks use MEMBER, including NOINHERIT SET ROLE memberships.
Source watchlist's direct SQL path shares the guard. TEMP must be revoked for
PUBLIC and the runtime as required by the reviewed role plan. No source fallback
occurs after a Neon error.

Retention, report redaction, partition RPC and observability are separately routed
through the Neon adapter; retained Supabase rollback credentials must not cause
source writes or skipped Neon maintenance. Additional permissions must be reviewed
per domain. Do not grant owner credentials to make tests pass.
