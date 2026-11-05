# Production Clawdeals schema-only composition, 2026-11-05

## Scope and outcome

This is a local **production-schema-only** integration investigation, not a data
migration, deployment, final restore approval or passing release gate. It does not
apply to the distinct webmcp sandbox. That sandbox has a different schema, including
its own deals image columns and no smartphone_passport_photos table; preserve its
data and obtain its own bound DDL/authorization review. Never apply this candidate
set to it by analogy.

The first expanded test found concrete helper, extension-schema and ownership
gaps. A subsequent exact-object review overlay fixes those observed gaps and the
latest confined composition/smoke test passes. This is not full business-flow or
data-migration approval. Verified stages:
- UTF8 fresh native PostgreSQL 17.11 with official PostGIS 3.3.7, pgcrypto and
  uuid-ossp, installed in extensions by a separate local fixture administrator.
- All source schema objects restored without application rows as actual restricted
  LOGIN schema_restore, not an administrator session with SET ROLE.
- All **84 routine identity/signature/definition hashes match canonical source
  before intentional overlays**, with no drift.
- Queue overlay applied before any business-function smoke, then the seven domain review
  candidates composed: RPC, queue, partition, consent, direct-table, acquisition,
  and view roles. Only the in-memory test copies change final ROLLBACK to COMMIT.
- Actual runtime query extracted from src/server/db/neon.ts passes as app LOGIN:
  all thirteen flags false, including database/table/schema ownership, elevated role
  membership, TEMP, CREATE ROLE/DATABASE, replication, superuser and BYPASSRLS.
- No effective PUBLIC EXECUTE remains on public/private routines. The harness
  revokes PUBLIC privileges on those application objects before exact allowlists;
  it does not touch extension/provider objects.
- Actual watchlist_signups INSERT with UUID/timestamp defaults and RETURNING passes
  in a rolled-back synthetic transaction. The actual queue-depth view also reads.

## Findings and bounded fixes

1. connect_effective_scopes_v1(text[]) lacks runtime EXECUTE after PUBLIC lockdown.
   It is a transitive dependency of connect_session_exchange_v1, not a direct RPC
   census entry. The residual-ownership candidate now grants only that exact reviewed helper/signature.
   offer_accept_v0 similarly calls offer_accept_locked_impl_v0(uuid,uuid), another
   exact helper absent from the direct allowlist. Inspect all nested function and
   trigger paths; pg_depend alone does not capture PL/pgSQL body calls. Do not
   restore PUBLIC EXECUTE to conceal a missing dependency.
2. list_listings_geo_v1 fails with `type geography does not exist`. Its SQL body
   uses unqualified PostGIS names/types, and app extensions-schema USAGE is false.
   Canonical review confirms its existing fixed search_path includes extensions.
   Granting only extensions-schema USAGE to app makes the real geo smoke pass,
   without changing the function body or granting any additional function EXECUTE.
   Do not install pg_net/Vault,
   broadly grant all extension functions or bypass hash mismatches. Preserve the
   pre-overlay canonical equality proof and validate the intentional delta.
3. The first composed state left 63 relations, 18 routines and 33 enums owned by
   the temporary restore LOGIN. The new rollback-only
   neon-residual-ownership-role-plan.sql enumerates precisely those objects, checks
   relation kinds/owners and enum-label/routine-definition hashes, refuses extension
   members, and transfers them to existing NOLOGIN clawdeals_schema_owner. Existing
   maintenance/queue/consent ownership is untouched, and view security_invoker
   properties remain unchanged. Public/private schemas and the explicitly local
   composition database move to that same NOLOGIN owner. Restore grants are revoked
   and its temporary LOGIN disabled. Final target ownership is asserted explicitly.
4. In particular, approvals_apply_side_effects_v1 and
   enqueue_watchlist_match_queue_v1 are now NOLOGIN schema-owner-owned SECURITY DEFINER routines.
   Their non-contact/non-early-return branches need bounded owner privileges/RLS
   and actual trigger fixtures. Successful schema creation alone does not prove
   those operations work under FORCE RLS.

## Confinement and privilege proof

The unchanged OS profile has SHA256
`f4350ece95071edeef719e34591555fc347586de9e0290b1e5780eb527900cf7`.
It denies network operations except the single reviewed PostgreSQL Unix socket.
The prior backend/detached-descendant proof established TCP/UDP IPv4/IPv6 denial,
neighbor/system Unix-socket denial and permitted only that exact socket. This is
network confinement, not a filesystem/Mach security boundary.

The new harness launches Node, initdb, pg_ctl, PostgreSQL backends, clients and
PostGIS below sandbox-exec. It verifies profile hash, protected proof directory,
absence of the exact socket/lock, and OS-level EPERM on a TCP preflight. It creates
a new uniquely named data directory, never reuses the proof cluster or changes the
profile. Cluster bootstrap/extensions use only controlled administrator SQL.

Source DDL uses a separate actual schema_restore LOGIN, NOINHERIT/NOSUPERUSER/
NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS with no explicit memberships.
Both session_user/current_user are checked. Before source DDL, pg_read_file,
COPY PROGRAM and SET ROLE administrator are denied; RESET SESSION AUTHORIZATION
remains the restricted authenticated principal. Every source function/hash probe
also runs through that restricted login. Known reviewed ownership templates use
a separate administrator connection only after schema restoration.

## Inputs and bounded transformations

- Schema review SHA256:
  `278840d0158e3f26895860e96e019265bfec8c3a35e1cf7e270db31bc7693d0d`.
- Canonical current routine metadata SHA256:
  `e8dc9ea399f44d60ce891f842127d2d97ce6bffcf3c1114be1e6a8a55fefc8ef`.
  It proves current pg_catalog,public rendering, not old exporter search_path or
  same-archive DDL derivation.

Two masked functions are reconstructed only using the attested repository literal
at the same literal ordinal. Reconstructed canonical UTF8 bytes must match the
exact canonical SHA **before routine DDL**. A separate restricted probe database
then creates the reviewed repository wrapper and checks native pg_get_functiondef
against that same hash. Evidence-confirmation needs only its composite return-type
identity in that probe; the placeholder is never called or used in full restoration.
The fully qualified repository wrappers are inserted into the schema's in-memory
copy. Directly inserting canonical text would misresolve its unqualified enum types
under pg_dump's empty search_path; no hash or type-resolution guard is bypassed.
No redaction marker reaches restoration. The sole bootstrap schema adjustment is
CREATE SCHEMA public → CREATE SCHEMA IF NOT EXISTS public on the verified fresh DB.
No original source definition or full schema artifact is copied into this repository.

## Reproduction and retained evidence

Run only on the reviewed Mac/proof environment, with explicit local opt-in:
`RUN_CONFINED_SCHEMA_COMPOSITION=1 node --test scripts/migration/neon-schema-composition.native.test.mjs`
The script otherwise skips. It requires the immutable external profile, exact
allowed socket root, official PG binaries and approved schema/canonical input
paths embedded in the fixture. It is not a general importer or remote connection
interface. A failed runtime smoke is intentionally a failed test, not a successful
migration claim. No CI gate configuration or production app is changed.

Metadata-only reports live in the approved local network-fixture backup directory:
- schema-composition-1793898074602.json: schema and seven candidate compositions
  passed, all84 hashes equal; this earlier run did not yet include runtime smokes.
- schema-composition-1793898567601.json: stronger exact-byte prechecks, actual app
  guard, PUBLIC audit, default/view smoke, concrete helper/PostGIS failures and
  residual ownership inventory. Server confirmed stopped.

Intermediate failure reports are retained rather than overwritten. They include
missing probe composite identity and canonical-rendering integration failures that
were corrected explicitly. Reports contain hashes, object/role metadata and short
sanitized errors, never SQL statements, routine bodies, source rows or secrets.
All created clusters are stopped in finally; owned data directories are retained
for parent-reviewed retention/cleanup, not mistaken for production backups.

No source connection, remote write, original encrypted dump access, source data
import, provider scheduler activation or irreversible cleanup occurred. Same-archive
binding, final source recheck after freeze, full synthetic business flows and data/
sequence parity remain required before any real migration or decommissioning.


## Exact ownership/helper overlay result

The residual overlay is deliberately restricted to database `composition`; it is
not approved for a remote target or the sandbox. It requires administrator-owned
DDL because ordinary restore credentials cannot assign objects to unrelated roles.
Only the NOLOGIN schema owner receives schema/database ownership and their implicit
CREATE privileges. Runtime app/consent/function roles gain no schema CREATE or owner
membership. Dedicated audit ownership remains maintenance, and queue/consent
function ownership remains their existing roles. Extension/provider objects are
never transferred. The unused binding-probe database remains a separate stopped
fixture artifact, not part of the composed application target.

Two direct nested helper calls are admitted with exact EXECUTE after canonical
hash checks: connect_effective_scopes_v1(text[]) and
offer_accept_locked_impl_v0(uuid,uuid). Canonical list_deals_trend_v0 contains no
call to list_deals_trend_v1, so no speculative third helper grant is added. The
helper smoke now passes, as does list_listings_geo_v1 after app-only extensions
USAGE. No source public-table default in this reviewed DDL required uuid_generate_v4;
consent/maintenance are not granted speculative extension access. Existing official
extension PUBLIC EXECUTE remains unchanged; application PUBLIC EXECUTE stays empty.

Successful report before the final explicit ownership-assertion addition:
`schema-composition-1793899069016.json`. It shows all84 pre-overlay canonical hashes,
all app guard flags false, no application PUBLIC EXECUTE, zero restore-owned
application relations/routines/enums, and successful actual default/view/helper/geo
smokes. The final rerun/report is reported separately for checkpointing.

Final explicit ownership-assertion run passed:
`schema-composition-1793899201043.json`, server stopped. This run verifies the target
DB/public/private schemas are NOLOGIN schema-owner-owned and schema_restore cannot
log in, in addition to the earlier canonical/runtime/PUBLIC/smoke assertions.

## Stable object inventory evidence

The pre-overlay native catalog is compared against the SHA-bound source catalog:
390 relation identities/kinds (65 tables including the partitioned parent, six views,
319 indexes including partitioned indexes), 208 types including generated arrays and
row types (33 enums, 71 relation composites and their 104 array-name counterparts),
and 56 attachment edges (seven table partitions, 49 index attachments) match exactly. All 31 noninternal
triggers, including seven partition clones, match stable identity, enabled state,
callee signature and definition hash. The 356 internal triggers match a stable
relation/callee/enabled multiset; their OID-derived names and hashes are excluded.

The bound schema-review SQL supplies 175 separate constraint headers and 133 named
inline CHECK constraints: all 308 identities exist, including seven inherited
constraints explicitly emitted by pg_dump. No unexplained noninherited constraint
is accepted. This is identity coverage, not a canonical definition comparison:
the source catalog does not contain normalized table/column/view/index/constraint/
type definitions. Full definition parity remains a separate requirement. The
84 routine hashes and 31 noninternal trigger hashes are the definition comparisons
actually proved. No extension-owned application relation was found; extension
objects outside public/private are separately bootstrapped, not source-restored.

The report records post-overlay added/removed identities separately for relations,
types, attachments, triggers, constraints, routines and policies. Intentional role,
ACL, RLS and routine-body changes are not misrepresented as source equality.
The latest actual app guard is extracted from the implementation, not hardcoded to
ten fields; thirteen false-required flags pass after all ownership overlays.

## Bootstrap roles are not Neon Auth

The local administrator installs official PostGIS/pgcrypto/uuid-ossp in extensions.
Those extension objects are administrator-owned fixture infrastructure, not restored
provider-owned Neon objects. No auth schema, auth.uid shim, Neon Auth service,
credentials or provider API is simulated. The temporary NOLOGIN anon/authenticated/
service_role roles exist solely so source policy definitions can initially restore;
service_role is not BYPASSRLS here.

The exact-source-bound `neon-source-policy-retirement.sql` review candidate checks
58 named policies, their ALL/permissive mode, exact anon/authenticated role set,
and SHA256 of both false expressions, then retires only those policies. ENABLE and
FORCE RLS flags must remain unchanged. Removing permissive false/false policies
adds no access; tables without replacement policies remain default-deny. The
fixture tests changed expression and changed role rejection, applies retirement
after reviewed replacement policies, then drops only the three local bootstrap
roles without CASCADE. These DROP ROLE statements are fixture-only, never part of
the candidate or a remote/provider action. App runtime/default/view/helper/geo
smokes run again with those roles absent. Overlay inventory now records precisely
58 removed source policies and 185 added review policies.

A remaining-routine definition scan reports explicit auth./net./vault. and legacy
role-token references. The latest result is empty. This is textual evidence plus
catalog DROP ROLE dependency enforcement and selected actual app smokes, not proof
against every dynamically assembled identifier or every business call path.

For standard PG17 pg_restore, review an explicit TOC list excluding exactly these
58 bound POLICY entries, matching schema/table/policy identity and archived source
policy definitions. PG17 has no --no-policies option. Do not create fake provider
roles, omit arbitrary policies, disable RLS, or infer archive binding from this
independent schema-review artifact. Same-archive extraction and TOC review remain
required before that separate restore procedure is approved.
