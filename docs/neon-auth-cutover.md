# Neon Auth cutover: preserve application owners

This is local migration preparation, not a completed production Auth migration.
Supabase remains the default. Do not disable the source until live parity, both
holders' identity access and rollback have been verified. The current aggregate
source inventory supplied by the parent has two linked, nonsuspended owners;
both have Google identities and one also has email/password. This does **not**
imply a mandatory password reset. No real email, signup, OAuth or reset is part of
the local fixture tests.

## Verified identity boundary

Neon mode requires both a cryptographically verified JWT and a currently live
Neon cookie session for the same subject. EdDSA only; issuer, audience, subject,
expiry and issued-at are mandatory, future issued-at and not-before are rejected.
There is no opaque bearer fallback, email-derived identity, or JWT-supplied key URL.
The live session must have a matching user ID, finite future expiry and an unbanned
user. A revoked/missing live session fails even when the JWT signature is valid.
Only `__Secure-neon-auth.*` cookies are forwarded, never ClawDeals owner cookies.
Auth fetches have bounded timeouts, no cache, and reject redirects. JWKS fetching
is bounded, cached briefly in process, restricted to the configured Auth HTTPS
origin, and rejects redirects.

Before enabling, operators must verify and set:

- Matching `CLAWDEALS_AUTH_BACKEND=neon` and `NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND=neon`.
- `NEON_AUTH_BASE_URL`: exact branch Auth HTTPS base URL, no credentials/query/hash.
- `NEON_AUTH_COOKIE_SECRET`: authorized secret of at least 32 characters.
- `NEON_AUTH_JWKS_URL`: verified HTTPS key endpoint on the same Auth origin.
- `NEON_AUTH_JWT_ISSUER` and `NEON_AUTH_JWT_AUDIENCE`: exact reviewed claim values.

JWKS path and claims are intentionally not guessed from an untrusted token. These
values still require live verification. Installed SDK inspection confirms the
client replaces `session.token` with the response `set-auth-jwt` header, then the
Supabase adapter exposes that JWT as `access_token`. Fixture signatures use local
throwaway keys only. Existing Supabase behavior is retained.

## Strict source-owner linking

New Neon links to existing owners require two proofs: a server-validated existing
ClawDeals owner-session cookie and the verified Neon identity. Source cookie is
HMAC-hashed and checked against an ACTIVE, unrevoked, unexpired session and a
nonsuspended owner. Legacy owner headers, body IDs and middleware owner context
are not proof. Verified email alone cannot claim a migrated owner. A different
verified mailbox can be attached only after source proof and if it does not belong
to another existing owner. Original owner/profile and old Supabase link remain.
The provider-subject unique index arbitrates insertion races: same-owner conflict
is idempotent; any different-owner link is rejected.

Normal already-linked Neon login may renew with a stale first-party cookie, since
its own live Neon identity proves the known link. A valid different-owner cookie
or suspended linked owner still blocks it. Infrastructure failures are not treated
as stale cookies. Normal new-owner registration outside the dedicated linking
operation retains its existing policy; operational signup controls are separate.

Repository DDL permits multiple provider subjects for one owner. `owner_id` has a
nonunique index; `(auth_provider, auth_subject)` is unique; `supabase_user_id` is
nullable but remains unique when present. The local PGlite test applies the actual
migration DDL and checks original row preservation and duplicate rejection. This
is not proof that a remote restore has these constraints; inspect them there.

## Disabled-default same-origin continuation

`/settings/neon-link` uses `CLAWDEALS_NEON_ACCOUNT_LINKING=true` plus both matching
Neon backend selectors. Without explicit activation its status operation returns
404 and the UI exposes no provider actions. It never offers signup/reset/email.
The holder must retain the valid old owner cookie on this exact origin. Do not
copy production cookies/tokens into preview or widen host-only cookie boundaries.
If old proof has expired, regain the existing source login through a separately
authorized workflow before cutover; do not infer identity by email.

The page displays current owner/email/ID and signs into an already provisioned
Neon account by password or configured Google. Google returns to this same page,
not the normal bridge callback. The installed adapter handles provider redirect;
its returned `data.url` is the callback and must not be navigated manually.
Callback/load never links automatically. An explicit confirmation is required.
Only a nonsecret pending owner ID is stored in sessionStorage. A changed owner
across interruption/callback blocks continuation. Password state is cleared on
success or failure; Cancel removes only the pending marker, never logs out.

`POST /api/v1/auth/neon:link-status` validates the old cookie and returns its owner.
`POST /api/v1/auth/neon:link` additionally requires Neon identity, displayed
`expected_owner_id`, same-origin Origin and custom `X-Clawdeals-Link: 1` header.
It never creates an owner, falls back to email, overwrites a prior link, changes
owner profile, or replaces/clears the old session cookie. Every replay requires
fresh proof. Normal auth/rate-limit/audit wrappers remain; response-idempotency
caching is disabled for these two actions so a repeated key cannot bypass proof,
activation or origin checks. Same-owner replay is idempotent.

Errors distinguish `OWNER_LINK_PROOF_REQUIRED`, `OWNER_LINK_SESSION_INVALID`,
`OWNER_AUTH_LINK_CONFLICT`, `OWNER_EMAIL_LINK_CONFLICT`, `OWNER_UNAVAILABLE`,
`OWNER_SUSPENDED`, and `LINK_ORIGIN_REQUIRED`. Preserve the existing account and
ask the holder to review/re-authenticate rather than auto-merge on any conflict.

## Validation and remaining release gates

Unit/route/wrapper fixtures and real local PGlite DDL tests are independent of
remote accounts. Browser artifact `e2e/testerarmy/neon-account-link.e2e.ts` covers
stop states, callback, explicit confirmation, interruption, conflict and replay,
including a synthetic HttpOnly owner cookie. It intercepts API/provider traffic;
its success responses do not prove server authentication.

For the browser fixture, use an isolated localhost app bundled with
`NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND=neon`, local-only backend placeholder values,
and an already-installed Chromium. Never use real accounts or shared profiles.
The initial 2026-11-05 rebuild attempt could not launch Chromium under the
outer sandbox. The subsequent escalation was denied due to uncontained runner
telemetry. A separately reviewed OS profile then allowed only localhost:4398 TCP
for the entire runner/Next/Chromium process tree, leaving telemetry enabled and
blocking external egress. Under that unchanged profile, the first browser run
passed three stop paths and failed two continuation paths. Fixes forwarded the
public Neon selector to the managed app, guarded fixture storage initialization
by origin, and resolved the browser SDK's `/api/auth` base URL against the current
origin (the installed SDK rejects relative URLs).

Fresh final confined run `01a1ac70-34fc-7625-a113-6b92d0321be1` passed all five
browser fixtures on Chromium 156.0.8078.4 in 5.61 seconds. It verifies client
success/confirmation, interruption, conflict, callback replay, preserved synthetic
HttpOnly source cookie, and stop paths. It does not prove real Google/provider
sessions, live JWT claims, remote data parity or production cutover. No browser
was installed, no shared profile used, and no telemetry setting changed. The
profile SHA256 remained
`9c81cad4f533327abfb10afe764b10e9c330237c9f1b17d4740bddb64dbd1ab9`.

Live gates remain: authorized Auth/Google configuration and controlled signup;
verified public JWT metadata; same-origin fixture preview testing without source
cookie transfer; source owner-session/secret and data parity; each holder linking
and signing back in; checks that previous Supabase links remain; bounded write
freeze and rollback preserving all new writes. Do not stop Supabase until these
are complete. No mandatory email reset follows solely from the aggregate inventory.
