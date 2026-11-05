# Idempotency response encryption and reader-first rollout

## Local change, not an activated production protection

This schema-free change adds a reader for encrypted response envelopes and an
explicit writer gate: `IDEMPOTENCY_RESPONSE_ENVELOPE_V2=true`. It uses the existing
`IDEMPOTENCY_SECRET`; no new key, database column, key copy or key rotation is
required. This preparation does not change any live configuration or source row.

**With the flag unset or anything other than exactly `true`, legacy writes remain
unchanged, including plaintext credential-capable response headers.** This default
permits a reader-first deployment without breaking retries served by old builds.
It is not a completed mitigation until activation and verification below.

## Storage and replay contract

When enabled, a response containing any of these header names, case-insensitively,
stores its entire body and header object in `response_body_encrypted`:
`Set-Cookie`, `Cookie`, `Authorization`, `Proxy-Authorization`, `X-API-Key`,
`Api-Key`, `X-Auth-Token`. This is a finite header-name classifier, not a guarantee
that arbitrary other headers or body fields contain no secrets.

- The plaintext `response_headers` and `response_body` columns are both `NULL` for
  those new rows. Header names, values and arrays are preserved, not stripped.
- Format: `v2:v1:<iv-base64>:<ciphertext-base64>:<tag-base64>`. The encrypted JSON
  contains `{ version: 2, body, headers }`. The outer version is distinct from all
  legacy bodies, including bodies that happen to contain `version` or `headers`.
- Encryption reuses AES-256-GCM and the existing SHA-256 key derivation. Constant
  additional authenticated data, `clawdeals:idempotency:response:v2`, binds the
  response format to its ciphertext; removing the outer prefix cannot turn it
  into a successfully decrypted legacy body. IVs remain random 12-byte values;
  authentication tags must retain all 16 bytes.
- New readers always support v2, regardless of the writer flag. They also retain
  plaintext legacy rows and v1 body-only ciphertext with plaintext headers.
  Existing body sensitivity detection and safe-header storage remain unchanged.
- Ciphertext is authoritative if present. Malformed/unknown versions, wrong or
  missing decryption keys, failed authentication and malformed envelopes return
  `500 IDEMPOTENCY_REPLAY_FAILED`, with only `Idempotency-Replayed: true`. They do
  not emit stored cookies or other headers, fall back to plaintext shadow fields,
  or execute the handler again. Request-HMAC checks may reject a changed/missing
  key before replay is attempted.
- Successful replay preserves status and exact header names/string arrays,
  including multiple Set-Cookie lines through the existing HTTP sender. The
  existing `Idempotency-Replayed: true` header is still added. v2 preserves falsy
  JSON bodies too. Legacy body defaults and 400/429 nonpersistence are unchanged.
- When v2 encryption cannot run (for example a missing key), finalization throws
  before any response update; no plaintext fallback is written. The existing API
  wrapper sends the original response before finalization and logs finalization
  failures, so the record can remain IN_PROGRESS. This is fail-closed storage,
  not a claim of successful cache persistence or a pre-handler availability gate.

## Activation and rollback requirements

These are future release steps, not authorization to deploy, change environment
values, inspect secrets or modify source data.

1. Deploy the v2-capable reader with the writer flag off. Verify every serving
   instance/deployment and the intended rollback build support v2. Remove old
   readers from request routing, including any other runtime sharing this table.
   Merely deploying one new build or using an empty-table observation is not enough.
2. Verify the existing idempotency key is available and unchanged on those
   runtimes using an authorized synthetic replay test, without retrieving,
   displaying or copying the key. If it is unavailable, resolve it before
   activation. Keep backend/Auth rollback controls independent of this format gate.
3. Only after reader coverage is proven, explicitly enable
   `IDEMPOTENCY_RESPONSE_ENVELOPE_V2=true` on every writer. Activation is mandatory
   **before Auth-first production linking/session bridging or other auth writes**
   that can produce cookie-bearing idempotency records. Verify an authorized
   synthetic original/retry response preserves all cookies and the resulting row
   has NULL plaintext fields plus v2 ciphertext. Do not log token/cookie values.
4. Existing rows are not rewritten. Rerun the count-only source classifier after
   the final verified write freeze and before transfer. A non-NULL encrypted-body
   count includes v2. Reader-first/legacy rows may still contain plaintext
   credentials and require the existing transfer review.
5. Roll back backend/Auth flags only to a **v2-compatible reader build** while v2
   rows exist. An old build cannot decrypt v2; switching the writer flag off does
   not make existing rows readable to it and also resumes plaintext header writes.
   Do not use that flag as an automatic security rollback. Never discard cookies,
   delete rows or rotate the key just to make an old build work.

The normal cache TTL is 24 hours, but legacy routes do not universally enforce
strict replay TTL. Elapsed TTL alone does not establish that an old-reader rollback
is safe. Any later retirement of v2 readers requires a separately reviewed retention
or reconciliation plan and verification that no relevant v2 records can be replayed
and no v2 writers remain. Retain compatible readers until that is established.

## Local verification

The regression suite substitutes only storage/Redis and uses synthetic credentials
with the real AES-GCM implementation, replay middleware and a local HTTP server.
It covers storage confidentiality, cookie arrays/casing, body/status preservation,
legacy fixtures, explicit activation, tampering/version downgrade, malformed
envelopes, key absence/mismatch and error-header suppression. These storage and
corruption cases are not observable reliably through existing browser journeys.

Run:

```sh
npx --no-install vitest run src/server/idempotency/response-encryption.test.ts src/server/idempotency/middleware.test.ts
npx --no-install eslint src/server/idempotency/crypto.ts src/server/idempotency/middleware.ts src/server/idempotency/response-envelope.ts src/server/idempotency/response-encryption.test.ts --max-warnings=0
npm run typecheck
```

This is a reconstruction from retained code and patches, not recovery of the lost
commit or reuse of its test evidence. The fresh Mac test-first run on 2026-11-05
reproduced 32 failures with 16 passing compatibility cases. After reconstruction,
all 48 new cases and 37 existing idempotency, middleware and auth/session cases
passed locally. These tests do not certify deployed routing, reader coverage, live
key availability, source credential counts or production replay continuity.
See [the transfer preflight](neon-sensitive-data-preflight.md) for source-data
handling and [the Auth cutover plan](neon-auth-cutover.md) for the separate release.
