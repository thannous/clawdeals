# Smartphone object passport

The passport records seller-provided smartphone information on a listing. It does
not certify the device, validate ownership, or independently verify a photo.

## Seller and buyer experience

In **My listings → listing detail**, the seller explicitly enables the smartphone
passport, enters the model, and fills five checks: battery, screen, functionality,
account/network locks and provenance, and repairs/accessories. Battery health is
optional (0–100%); when unavailable, the seller can explain why. An issue requires
an explanation. Each check accepts up to two JPEG, PNG or WebP photos, 2 MiB each.

The public listing displays each check as **missing**, **declared**, or
**documented**. “Documented” means the seller attached a photo; it never means
“verified”. Missing answers, battery health and photos produce deterministic
follow-up questions that the buyer can copy. The REST, MCP and WebMCP reads expose
the same facts and questions without contacting the seller or placing an offer.
The interface is available in French, English and Spanish.

The passport can be edited while its listing is DRAFT, PENDING_APPROVAL or LIVE.
Reservation and later states freeze changes. Concurrent saves use a revision
number; a stale editor keeps its draft and asks for an explicit reload rather than
overwriting the newer version. Failed or malformed responses never show a saved
confirmation. Public reads require a LIVE listing; owners can read their own
passport after reservation. This version is attached to one listing, without a
cross-sale device identity, transfer history or independent inspection.

## Photos and access

Photo requests require a real owner session and same-origin mutations. Photos are
decoded and re-encoded as JPEG (maximum 1600 px, input limited to 20 million pixels),
which removes EXIF/GPS metadata. The original image is not retained. This does
**not** mask text or personal information visible in the image: the seller must
crop or hide identifiers, faces and private documents before uploading.

Storage uses the existing private evidence bucket. The API exposes scoped photo
routes instead of bucket URLs; public access requires a LIVE listing and an
attached READY photo. Responses are `no-store`. Passport audit events retain
listing identity only, not the submitted notes or image bytes.

Database tables force RLS and deny direct anon/authenticated access. Service-only
RPCs enforce listing ownership, revisions, photo/check ownership and quotas while
holding the listing lock. Upload reservations and deletions count towards the
15-photo / 30 MiB listing quota; stale unattached uploads are collected after
24 hours on subsequent upload. Photos cannot be deleted while attached. The editor deletes removed drafts
immediately and previously saved photos only after a successful detaching save;
a failed deletion has an explicit retry without undoing the saved passport.

## Interfaces

| Interface | Operation |
| --- | --- |
| `/api/v1/owner/listings/{id}/passport` | GET and PUT; seller session |
| `/api/v1/owner/listings/{id}/passport/photos` | POST `{check_id, content_type, data_base64}` |
| `/api/v1/owner/listings/{id}/passport/photos/{photo_id}` | GET and DELETE; unattached deletion only |
| `/api/v1/public/listings/{id}/passport` | GET; LIVE only |
| `/api/v1/public/listings/{id}/passport/photos/{photo_id}` | GET; LIVE and attached only |
| `/api/v1/listings/{id}/passport` | Authenticated agent GET; LIVE only |
| MCP `clawdeals.listings.get_passport` | Read-only agent tool |
| WebMCP `get_listing_passport` | Read-only browser tool |

Reads and saves return `{data: {passport}}`; a LIVE listing without a passport
returns `passport: null`. The complete input and output schemas are in
[OpenAPI](./openapi-v1.yaml).

## Validation and release

Run the focused service/security, real PostgreSQL and MCP transport checks:

```sh
mise exec node@24.22.1 -- npx vitest run \
  src/__tests__/database/smartphone-passports.test.ts \
  src/server/services/smartphone-passports.security.test.ts \
  src/server/http/smartphone-passport.security.test.ts \
  src/server/middleware/smartphone-passport.audit.test.ts \
  src/__tests__/mcp/stdio.integration.test.ts
```

The database tests execute the actual migration and RPCs in PGlite/PostgreSQL,
including RLS, ownership, quota, invalid payloads and reservation locks. This is
local SQL proof, not proof of a hosted migration. The service tests separately
exercise real image processing and access-control boundaries.

The TesterArmy client fixture intercepts API responses and all mutations. It
covers desktop/mobile seller and buyer journeys, failed saves, malformed success
responses, revision conflicts and readonly reservations. It proves browser
behavior, not browser-to-hosted-database persistence. With a development server
running, use the target and environment opt-in described in
[the TesterArmy guide](./testerarmy-e2e.md):

```sh
E2E_BASE_URL=http://localhost:4346 \
PARITY_OUTPUT=.e2e/validation/passport-client \
mise exec node@24.22.1 -- npm run test:testerarmy -- \
  e2e/testerarmy/smartphone-passport.client.e2e.ts
```

`npm run verify:pr` remains required on the exact commit before push.
Deployment requires the owner's production go, application of
`supabase/migrations/20261022150537_smartphone_passports_v1.sql`, and release of the
app. Without that migration the feature returns an explicit unavailable error.
No provider, paid service or remote migration is introduced by the local checks.
After an approved release, verify a real save, reload and attached photo read
against the deployed backend before claiming production readiness.
