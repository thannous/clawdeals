# Smartphone comparison

The comparison helps a buyer choose between two or three smartphone listings
using their advertised prices and seller-provided passports. It adds no payment,
message, offer, external price source or model-provider call.

## Buyer journey

Add candidates with **Compare** on browse cards or a listing detail. The selection
holds at most three public listing identifiers and titles in this browser tab for
24 hours. It survives navigation and reload; prices, photos and passport notes
are read fresh rather than persisted in the selection. Two selections enable the
comparison page. Users can remove a candidate and change the comparison priority.
Cards recognize smartphone titles/categories and also allow electronics candidates
so a generically named phone can be identified through its passport. This is a
broad candidate filter: the API reports unsupported when neither the current
listing nor a passport identifies a smartphone.

The comparison URL contains only listing IDs and the chosen priority. It is readable without signing in;
private, reserved, removed or moderation-hidden listings must expose no listing
or passport payload through the comparison API. A URL is not an access grant.

The interface displays price, declared battery health, the five passport checks,
notes, proof photos, source dates and missing-information questions. Unknown data
remains unknown. Photos document a seller statement and do not certify it.
The existing smartphone passport supplies the underlying evidence.

Each available candidate also offers a [passport-based buying mission](./smartphone-passport-missions.md),
with editable budget, location and structured passport requirements.

## Explicit comparison rules

There is no overall score, hidden weighting or automatic purchase recommendation.
Each priority compares one observable field and explains what it means:

| Priority | Comparison | Missing information |
| --- | --- | --- |
| Budget | Lowest advertised price in the common currency | A missing passport does not hide a known price; its unknown condition remains visible. |
| Battery | Highest declared battery-health percentage | Every candidate needs an applicable, known battery check and a valid percentage. This does not compare runtime or battery capacity between models. |
| Declared condition | Fewest checks marked as an issue | Every candidate needs all five checks answered; explanatory battery N/A is allowed. Counts do not measure the severity of each defect. |

Equal values produce a tie. Different currencies suppress the ranking; this
version performs no exchange-rate conversion. Unavailable/unsupported candidates
block the ranking until removed. Missing information blocks the affected metric
instead of becoming zero defects, zero cost or a positive trust signal. Photos
never affect ordering or break a tie. Defects and unanswered questions remain
visible even on a candidate highlighted for its price.

## API and failure behavior

`GET /api/v1/public/smartphone-comparison?ids=UUID,UUID[,UUID]` accepts one to three
unique UUIDs. Inputs are validated before database work and normalized to lowercase.
The response is `{data: {items}}`, preserving selection order. Each item reports
`available`, `unavailable`, `unsupported` or `error`. Available rows contain a
minimal public listing, its passport (or null), and a separate passport-error flag.
Missing/private rows share the unavailable state and never reveal private metadata.

The server checks LIVE visibility and moderation status before and after reading
the passport. Public output excludes seller identities, contact details and storage
keys. Responses are no-store and rate limited per IP. A partial failure stays
explicit; raw database/provider errors are not sent to the browser. The client
rejects malformed responses and provides a retry, retaining the selected IDs.

The pure comparison logic lives in `src/lib/smartphone-comparison.ts`. API schemas
are documented in [OpenAPI](./openapi-v1.yaml). No database migration is added;
[the smartphone passport migration](./smartphone-passport.md) must already exist.

## Verification

The connected TesterArmy suite uses a native local Supabase stack and the real
application API. Its fixture explicitly refuses nonlocal URLs, creates only its
own synthetic owner/agent/listings/passports, and removes those exact records in
teardown. Redis rate limiting uses the repository's local REST simulator. Browser
API reads are not intercepted in these connected scenarios. Separate client
recovery cases simulate unavailable or malformed responses.

Use [the local backend guide](./local-supabase-development.md) to start the native
stack and set the worktree's environment to its local credentials. With the app
running on localhost:4346 and local Redis configured:

```sh
TESTERARMY_COMPARISON_LIVE=1 \
E2E_BASE_URL=http://localhost:4346 \
TESTERARMY_REDIS_FIXTURE=local-rest-simulator \
PARITY_OUTPUT=.e2e/validation/comparison-live \
mise exec node@24.22.1 -- npm run test:testerarmy
```

Choose a fresh output directory on each run. The default public suite excludes
these database-writing fixtures. Reports retain source identity, assertions and
cleanup evidence. This qualifies a local connected journey, not a production
release. `npm run verify:pr` remains required on the exact commit before push.
Production deployment still requires the owner's go.
