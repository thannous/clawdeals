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
