# Server authorization transformation review v1

This is a non-executing proposal derived from catalog SHA256
`e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491`,
the separate redacted schema-review inventory, and AST-scanned production server
RPC callsites. `neon-authorization-review.json` contains all 84 signature decisions,
390 relation decisions, 58 policy decisions and six default-ACL decisions.
Raw source metadata, source SQL bodies and literal values are not included.

## Concrete decisions and discrepancies

- 51 public SECURITY INVOKER signatures have static server RPC evidence.
  Their exact signatures are candidate EXECUTE allowlist entries for clawdeals_app,
  not grants. Each records server file/line/hash and qualified table paths where
  present in the separate body review. No name-only bulk GRANT is generated.
- Both `resolve_approval` overloads are mapped: approvals.ts constructs five named
  arguments for the primary call and four named arguments for its explicit legacy
  fallback. Both signatures are candidates; no unrelated same-name overload is
  accepted. AST resolution follows unique literal object variable initializers.
- `transaction_request_contact_reveal_v1(uuid,uuid)` and
  `resolve_contact_reveal_consent_v1(uuid,uuid,text,text)` are called SECURITY
  DEFINER routines. They need a specifically reviewed NOLOGIN/non-bypass owner,
  exact dependency privileges and bilateral consent/wrong actor/approval-side-effect
  fixtures. Do not give the app ownership to avoid solving those requirements.
- `src/server/services/agents.ts` calls `add_agent_trust_flag_v1`, absent from this
  source catalog. Resolve this code/source mismatch explicitly; do not silently
  substitute similarly named add-if-missing/remove functions.
- Remaining routines have no direct static RPC callsite. That does not make them
  unused: private helpers, trigger functions and nested callees need dependency
  closure. Existing queue/partition role plans remain separately reviewed candidate
  replacements; this report neither overrides nor approves them.
- Source PUBLIC EXECUTE is revoked before commit, including 39 source routines
  carrying that grant. Source owners/default ACLs are not copied. Schema ownership
  must be assigned to an explicitly chosen NOLOGIN non-runtime owner. Definer and
  maintenance ownership needs separately bounded roles, not that owner's authority.

## RLS and server semantics

Source service_role bypassed RLS. Its anon/authenticated policies therefore did
not establish tenant isolation for server operations. Target clawdeals_app must
remain server-only: no browser/DataAPI exposure, no bypass, ownership, CREATE ROLE,
schema CREATE or membership/SET ROLE route into owners.

For each reviewed public-table operation, explicit grants and operation-scoped
policies using true/WITH CHECK true as applicable can preserve the source trusted
server model without BYPASSRLS. They do not provide database tenant isolation.
Route/service ownership, actor, token and scope checks remain security boundaries
and must be exercised before mutation and before returning sensitive rows. Never
mechanically rename anon/authenticated policies, copy source default grants or use
the legacy blanket-RLS-stripping preparation path for this review.

Direct runtime access to private tables remains withheld. Only exact reviewed
function-role privileges/policies may cover private queue state. Public relation
proposals remain per-operation, not blanket all-table grants. Six views remain
withheld until exact expressions, owner and security_invoker/barrier semantics are
reviewed with cross-tenant tests; current catalog lacks the required reloptions.

## Specific local validation needed

Each routine record lists concrete fixture requirements and available table paths.
The 68 routines with textual table paths still lack operation/column precision and
complete nested trigger closure. Evidence/upload functions need reservation owner,
submitted_by, expiry, locator and finalization checks. Offer/transaction/escrow
paths need participant authorization, legal state transitions and concurrent
repeat behavior. Connect/installations need token/expiry/scope/revocation tests.
Contact reveal needs bilateral consent and denial of cross-party disclosure.

The AST census excludes tests and scans src/server and src/pages/api. It records
literal RPC names, argument keys when statically available and unresolved dynamic
calls. It does not prove the receiver is the service database client or that route
authorization is correct. Static call evidence is sufficient for a review candidate,
not execution approval. Trigger/nested-call entry points are not inferred absent
structural dependency proof.

## Execution locks

The review builders do not connect to PostgreSQL; the renderer emits rollback-only
SQL proposals that are not integrated into migration execution. No actual
restore admission was widened. Current prepared-SQL/archive hash agreement alone
does not prove derivation: future execution needs DDL extracted from the same
archive, structurally complete object inventory, exact approved replacements and
owner/ACL/RLS/dependency closure. The two redacted bodies remain review-only despite
literal/body equivalence attestations; complete CREATE wrappers are not proven.
Final source recheck after the bounded freeze remains required.

Run `node --test scripts/migration/authorization-review.test.mjs` for focused tests.
They validate review logic and census isolation, not real-source authorization.


## Rollback-only exact RPC candidate

`neon-rpc-role-review.sql`, generated by `render-rpc-role-review.mjs`, contains
49 exact signature/definition-hash entries: the 51 invoker candidates minus the
two queue claim/release wrappers owned by the dedicated queue plan. It requires
preexisting restricted clawdeals_app and NOLOGIN clawdeals_schema_owner, refuses
elevated app membership, resolves each schema/name/identity_arguments in pg_proc,
and checks SHA256 of pg_get_functiondef before any ownership/EXECUTE change.
A missing signature, SECURITY DEFINER change or differing definition aborts.
It proposes function ownership only, revokes PUBLIC/app grants then grants exact
EXECUTE to app; no broad ALL FUNCTIONS grant. Defaults for that named owner deny
PUBLIC/runtime function execution. It always ends ROLLBACK.

Source PG17.6 versus target PG17.11 formatting/search_path can change definition
hashes. A mismatch requires reviewed structural equivalence, never skipped guards.
The candidate does not create roles, grant table writes, strip RLS or prove complete
source-copy derivation. Choosing the proposed schema-owner role and its membership
is still an explicit review item.

Native PostgreSQL fixture executes the actual checked-in
connect_effective_scopes_v1 definition from
20261022090000_connect_exchange_consent_scopes.sql. It proves exact-hash admission,
restricted app EXECUTE, rejection of unapproved scopes, changed-hash refusal and
rollback restoring owner/ACL. It is not evidence for the other 48 routine bodies.

## Contact-consent owner and direct privilege proposal

Propose a separate NOLOGIN, NOINHERIT, NOBYPASSRLS role `clawdeals_consent`, with
no role/database creation and no app membership/SET ROLE path. It would own only
transaction_request_contact_reveal_v1(uuid,uuid) and
resolve_contact_reveal_consent_v1(uuid,uuid,text,text), with runtime EXECUTE only on
those exact signatures and no PUBLIC EXECUTE. Keep their existing fixed
pg_catalog,public search_path only if public CREATE is denied to every untrusted
principal; alternatively review a fully qualified empty-path rewrite.

Their directly inspected repository bodies require:
- SELECT transactions and approvals (rowtype/RETURNING * and locking paths),
  SELECT agents(id,owner_id), SELECT owners(owner_id,email,email_verified_at,
  phone_e164,phone_verified_at).
- INSERT approvals(owner_id,action_type,action_ref,action_ref_id,
  action_payload_redacted,created_by_agent_id,state,created_at).
- UPDATE approvals(state,action_ref,action_payload_redacted,created_by_agent_id,
  created_at,resolved_at,resolved_by_human_id,resolved_reason_text), including
  ON CONFLICT reads and RETURNING paths.
- UPDATE transactions(contact_reveal_state,contact_revealed_at,updated_at,status).
- Consent resolution additionally needs UPDATE listings(status,updated_at) and
  SELECT listings(listing_id) for its predicate.

No direct private schema call was found in these two bodies. This is a direct-body
proposal, not complete privileges: the approvals and listings triggers execute
additional logic. Default-generated approval columns and unique-index dependencies
must also be checked. Before creating a grant SQL candidate, run actual bodies
under this nonowner role with matching operation policies and every approval/
listing trigger enabled. Cover wrong participant/owner, missing verified contacts,
self-dealing, first consent without reveal, second consent reveal, denial/revocation,
reopen/idempotence, concurrent consent and trigger failure rollback. No consent
role grants were applied or assumed tested in this milestone.

## Dedicated completed candidate closures

Queue candidates live in neon-queue-runtime.sql and neon-queue-role-plan.sql;
partition candidates live in neon-partition-role-plan.sql. They retain exact
private retry/configure ownership and revoke runtime private EXECUTE. The partition
candidate's invoker acquisition trigger uses exact five-column SELECT/INSERT on
acquisition_funnel_events, reads first_match/d7_retained, and inserts d7_retained
only. Its native fixtures cover success, duplicate idempotence and absent-INSERT
atomic rollback. Maintenance gets only capture-function EXECUTE for trigger cloning,
not acquisition row grants. Preserve these specific closures when assembling wider
app analytics permissions; do not replace them with generic unresolved or blanket
policy decisions. All candidate files remain rollback-only and need same-archive
binding plus whole-schema role/trigger integration.

### Catalog rendering versus mutation context

The RPC candidate explicitly renders identities and definitions under
`pg_catalog, public`. This is a candidate context, **not an attestation of the
historical exporter's search_path**. Exact identity and exact definition SHA must
both match; mismatches abort without alternative hash acceptance. Historical
context or same-archive extraction should still be recorded for reproducibility.
The renderer requires an explicit bounded context/evidence record rather than an
implicit default. Catalog functions/relations are pg_catalog-qualified. After
validation it switches to empty search_path and obtains a fully qualified
regprocedure signature for ownership/GRANT operations; public objects cannot
shadow those operations. Native fixtures now cover an enum argument, a same-name
text overload, differing caller search_paths, and rejection after changing the
enum-overload body. This fixes rendering-induced mismatches without weakening the
exact-definition guard or treating a matching candidate as archive derivation.
