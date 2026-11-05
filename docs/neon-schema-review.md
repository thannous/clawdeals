# Schema-only migration review, 2026-11-05

Reviewed artifact: 449535 bytes, SHA256
`278840d0158e3f26895860e96e019265bfec8c3a35e1cf7e270db31bc7693d0d`.
This is an authorized schema-only, explicitly redacted review artifact. No source
rows, credentials, archive, recovery key or source routine definitions were copied
into this repository. The metadata inventory is `neon-schema-review-inventory.json`.
It contains names, types, hashes, classifications and qualified textual references;
it is neither executable SQL nor proof of complete dependency closure.

## Findings

- 33 enum/type entries; 84 functions; 65 tables; 6 views; 86 constraints;
  89 foreign-key constraints; 233 indexes; 24 triggers; 65 RLS entries; 58 policies.
- Seven audit partition table attachments and 49 partition index attachments must
  remain consistent. The partition months are February/March and September through
  December 2026, plus January 2027. Do not replace the partitioned parent with an
  ordinary table or lose future partition maintenance.
- Fourteen routines use SECURITY DEFINER. Their owner, fixed search_path and
  runtime EXECUTE grants must be reviewed individually. The artifact omits owners
  and privileges (`Owner: -`), so it cannot establish source authorization parity.
- `public.listings` depends on `extensions.geography`, `extensions.st_makepoint`
  and `extensions.st_setsrid`. Confirm PostGIS version/namespace on the actual
  target before restoring types, defaults or indexes. Creating an empty extensions
  schema does not satisfy these dependencies.
- `private.configure_queue_dispatch_v1(text)` depends on Vault;
  `private.send_queue_wake_v1(text)` depends on Vault and pg_net. These require the
  explicit event-driven queue replacement under separate review. Dependent queue
  triggers/routines remain blocked transitively. Do not copy secrets or activate
  outbound HTTP/cron merely to reproduce the source.
- `private.ensure_audit_log_partitions()` has bounded dynamic SQL in the repository
  implementation, not arbitrary caller-supplied SQL: it builds three UTC monthly
  partitions under a lock. Its Supabase-role GRANT/REVOKE statements need an
  explicitly reviewed runtime/maintenance role replacement. Broad dynamic-SQL
  acceptance is unnecessary. Preserve partition creation plus future scheduling,
  test concurrent calls and future-month inserts before accepting a rewrite.
- No textual auth/storage/realtime schema reference was observed in the inspected
  application definitions. That does not migrate Auth identities or prove absence
  of indirect dependencies. Auth/provider objects are outside this export.
- Policies reference authenticated/service_role. RLS stripping by the legacy
  preparation tool is not an authorization migration. Review restricted runtime
  roles, column/table/routine grants and owner/tenant boundaries before activation.

## Two masked literals

`public.begin_evidence_upload_confirmation_v1` matches the function body in
`supabase/migrations/20260713095350_evidence_upload_reservations_v1.sql` after
normalizing whitespace/case and masking literals. The source has 16 literals and
exactly one mismatch, the redacted third literal.

`public.transaction_request_contact_reveal_v1` likewise matches
`supabase/migrations/20260826153000_ti_370_bilateral_contact_reveal.sql`, with
54 literals and exactly one mismatch, the redacted fourth literal.

Both corresponding repository values are 35-character uppercase exception
identifiers used by RAISE EXCEPTION, not credential expressions. They are scanner
false positives based on that repository comparison. The review artifact remains
non-restorable: do not silently turn placeholders into live definitions. A future
reviewed transform can select the exact repository routine and prove its behavior.
No literal values need to be published in this report.

## Bounded local adaptation

Rehearsal admission now supports structurally constrained application enum
creation and table columns referencing enum types explicitly declared in the same
reviewed script. Base/custom type input functions remain refused. Native local
PostgreSQL fixtures verify enum/table creation in the same guarded transaction,
provider preservation, runtime lockdown and failure rollback. This expands a
specific reviewed construct rather than relaxing all routine/expression blockers.

Remaining work is a structured object-by-object admission plan for actual routine
bodies, constraints, expression indexes, views, triggers, partition attachments,
PostGIS dependencies and authorization replacements. `portable-candidate` means
review candidate only. There are no fully adapted/validated real-source objects
in this milestone and no remote restore or source modification was performed.

## Snapshot identity gate

This schema-only review is a separate export from the encrypted rehearsal dump.
Its fingerprint does not identify the DDL inside that dump. Any executable
transformation must bind to the exact DDL extracted from the dump being imported,
or demonstrate structured equivalence with every difference explicitly reviewed.
Masked placeholders must never become invented business constants. A final dump
requires fresh review after the bounded write freeze; an earlier fingerprint does
not prove future source state. Final cutover admission remains separate and closed.

## Exact-object review contract (non-executing)

`scripts/migration/object-transform-manifest.mjs` now provides two pure functions:
`buildObjectTransformManifest(inputs)` and
`validateObjectTransformManifest(manifest, inputs, approvedManifestSha256)`.
They do not read files, connect to databases, emit executable SQL, admit definitions
into the restore path, or turn inventory candidates into approvals.

The caller supplies:

- `source`: `archive_sha256`, `artifact_sha256`, exact `artifact` Buffer,
  `redacted:false`, `metadata_sha256`, and a complete ordered `objects` list.
  Each object has `identity:{schema,kind,name,identity_arguments,parent_identity}`, zero-based byte `start`/exclusive
  `end`, and `definition_sha256` over exactly that byte span. Spans cannot overlap.
  The artifact digest covers all bytes, including preamble, gaps and trailer.
- `replacements`: explicit `{identity,definition,definition_sha256,redacted:false}`
  records. Definition is a Buffer, never included in the output manifest.
- `reviews`: exactly one per source object, containing `source_identity`,
  `source_definition_sha256`, `action` (`keep` or `replace`), `target_identity`,
  `target_definition_sha256`, and a nonsecret `review_reference`.
  Keeping requires unchanged identity/hash. Replacing requires an exact matching
  replacement record. Omissions, implicit approvals, unused replacements and
  duplicate targets are refused. Splits/merges/additions are not supported yet.
- `ordering`: every source identity exactly once, specifying explicit output order.
  Order is bound to the review, not inferred from catalog dependencies.

Retain the resulting canonical SHA256 from `digest(manifest)` independently in the
reviewing orchestrator. Validation rebuilds the expected manifest from current
inputs and compares every field plus this prior digest. Changes to any artifact
byte, archive identity, metadata digest, object, replacement, review reference or
ordering invalidate that prior approval. A digest is a change detector, not a
signature, proof of author identity or substitute for required user authorization.

The supplied structural identities/spans and complete inventory still need a
trusted extraction/review step. This module does not parse PostgreSQL to establish
that a label matches its DDL, detect an omitted object hidden in a byte gap, or
prove dependency/authorization closure. It rejects the current known redaction
markers and requires an explicit non-redacted attestation, but cannot detect every
possible masking convention. These limits are explicit output flags:
`structural_identities_verified:false`, `dependency_closure_verified:false`,
`authorization_closure_verified:false`, `executable:false`,
`restore_eligible:false`, `cutover_eligible:false`.

The real redacted review artifact cannot enter this contract. Missing exact dump
binding and source owner/ACL/dependency metadata remain blockers. After those are
provided, the next smallest step is an independently reviewed structural extractor
and explicit per-object transformation decisions for routines, views, triggers,
defaults and provider replacements, followed by approved role closure. Lifting the
full restore block additionally requires isolated PostgreSQL tests of complete
transformed schema/dependencies, all trigger paths, PostGIS, partition maintenance,
queue replacement, privilege isolation, atomic rollback and archive/schema parity.
Neither manifest validity nor these fixture tests lifts the current restore gate.

Focused tests: `node --test scripts/migration/object-transform-manifest.test.mjs`.

Object identities now require `identity_arguments` explicitly: use PostgreSQL's
identity-argument signature for FUNCTION/PROCEDURE/AGGREGATE, including an empty
string for zero-argument routines; use an empty string for nonroutines. Overloads
with the same schema/name remain distinct. Do not encode arguments into `name`.
`parent_identity` is explicitly null for unscoped objects. TRIGGER, CONSTRAINT,
FK CONSTRAINT, POLICY, RULE, TABLE ATTACH and INDEX ATTACH require a structured
`{schema,name}` parent relation identity. For attachments this is the parent table
or parent index, respectively; the main identity names the child. The extractor
must provide these structural identities; the manifest does not infer them.

## Independent catalog review follow-up

A later read-only catalog snapshot (SHA256
`e00218c5ae94517cafb356b06337539d2a778d275c890687b047795829506491`)
is available outside this repository. It is not bound to the encrypted archive.
It confirms all 84 routines and 390 relation records are owned by postgres,
39 routines have explicit PUBLIC EXECUTE, six default-ACL records differ, and
58 policies target anon/authenticated. Copying these grants or owner roles is not
a valid restricted-runtime migration. Source PostGIS is 3.3.7 in extensions;
target version/namespace compatibility remains to be established. The 31
noninternal triggers versus 24 dump entries are consistent with seven partition
clones but still require explicit reconciliation. Catalog dependency edges do not
prove complete PL/pgSQL body closure: known net/Vault references remain relevant.

The two masked values and normalized routine bodies were compared in memory to
the repository: equality was attested without retaining values. This does not
attest complete CREATE-wrapper equivalence or make the redacted artifact executable.
