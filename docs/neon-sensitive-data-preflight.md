# Idempotency credential-transfer preflight

## Scope of this reconstructed note

This note describes the repository's idempotency storage paths and the checks
required before a future transfer. It does not reproduce a live database review,
recover the lost preflight artifact, or establish current source row counts. No
source rows, production secrets, Auth/Vault contents or live configuration were
read or changed while reconstructing this patch on 2026-11-05.

## Credential-capable storage paths

- `public.idempotency_keys.response_headers` can contain plaintext credentials.
  `src/pages/api/v1/auth/[action].ts` returns owner-session Set-Cookie headers;
  idempotent response finalization can persist them. Legacy/default reader-first
  writes still store headers without encryption or redaction. The locally prepared
  [v2 response envelope](idempotency-response-encryption.md) encrypts headers and
  body only after all readers support it and the explicit writer flag is enabled.
  It does not rewrite old rows or remove the final source recheck requirement.
- `response_body_encrypted` deliberately holds reversible credential ciphertext.
  Both legacy v1 body encryption and v2 response envelopes depend on the external
  `IDEMPOTENCY_SECRET`. Preserve key continuity through the approved runtime
  mechanism; do not copy the key into exports, reports or migration artifacts.
- `response_body` is potentially credential-capable. The body classifier is a
  finite recursive key-name list, not a guarantee about arbitrary strings or old
  data. Safe-looking schema names alone do not certify rows are secret-free.

Excluding Auth/Vault tables does not establish that application tables contain no
usable credentials. Expired cache records would not establish that embedded
credentials themselves expired. Outer archive encryption protects temporary
files but does not authorize credential exposure in a restored database.

## Required checks before transfer

1. Verify the specific source, destination, restore identity and authorized data
   scope. Runtime roles must not gain ownership, BYPASSRLS or restore privileges.
2. Use an authorized count-only classifier to check credential-bearing headers,
   body keys/values and non-NULL encrypted-body fields without returning row
   identifiers, token values or decrypted ciphertext. Non-NULL ciphertext counts
   include v2. Heuristics do not certify arbitrary text elsewhere as secret-free.
3. Recheck after the final verified write freeze and before export. If usable
   credentials are identified, obtain the applicable authorization for those data,
   recipient and purpose before transmission. Do not infer that permission from
   this document or from generic migration authorization.
4. Preserve replay/session continuity separately from row-count validation. Do not
   strip cookies, delete records, rotate keys or invalidate sessions to make an
   import pass. Encrypted v2 rows require compatible readers on rollback too.
5. Keep rehearsal targets isolated from outbound jobs and external side effects.
   Verify restore identity, target permissions and rollback readiness independently.

These are release prerequisites, not completed production checks or authorization
for source reads, credential transmission, configuration changes or deployment.
