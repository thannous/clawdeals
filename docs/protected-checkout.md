# Protected checkout

The existing escrow, dispute and evidence services now support saved purchase
terms, a timed inspection period, parcel tracking and human review.

## Screens

- `/my/orders`: the signed-in owner's latest 50 buying/selling checkouts.
- `/my/orders/{escrow_id}`: saved terms, inspection countdown, parcel facts,
  seller tracking registration, buyer early release, dispute opening, statements
  and private evidence uploads from both sides.
- `/console/disputes`: ops review queue, filterable by state.
- `/console/disputes/{dispute_id}`: saved terms, tracking, opening note, both
  statements and evidence sets, with explicit refund/release confirmation.

Production console access uses the existing `CONSOLE_OPS_ENABLED` switch and
the allowlisted `CONSOLE_OPS_OWNER_ID`'s real owner session. Raw owner headers are
not production credentials. Buyer/seller access is checked against the escrow,
not merely possession of its URL. Evidence downloads repeat those checks.

## Terms and timing

An `AFTER INSERT` trigger on `escrows` captures the listing and accepted offer
in the same transaction as escrow creation, including the approval-driven path.
It saves title, description, condition, category, delivery option, photo metadata,
price, accepted offer, payment amounts and inspection hours. The JSON is hashed
with SHA-256; updates are denied even to the backend role.

Capture happens when checkout creates the escrow, **before payment settlement**.
The hash covers the saved JSON. Photo storage references are preserved, but this
version does not archive image bytes or compute content hashes for legacy photos.
External or deleted image objects can therefore become unavailable. Old escrows
have no retroactively fabricated snapshot.

Delivery starts a 48-hour window by default. A signed carrier event starts the
clock when received, giving the buyer the full window even for a delayed scan.
A duplicate event never restarts it. A parcel scan cannot resolve a dispute or
release funds. Once a shipment is registered (or the saved listing is SHIPPING
only), seller self-declaration cannot mark it delivered. For an untracked handover,
the seller can record the handover using the existing mark-delivered action.

Both parties may dispute while funds are held or before the inspection deadline.
At the exact deadline, new disputes are refused. The escrow row lock serializes
dispute opening with delivery, confirmation and automatic release.

Buyer confirmation is an explicit early release; installation-scoped agent
credentials still require their existing owner approval. The hourly lifecycle
cron (`17 * * * *`) claims expired, undisputed deliveries and requests payouts.
Failed requests remain recoverable after five minutes. Mock payout IDs are stable
per escrow, making retries idempotent. A real PSP must retain this guarantee.
`RELEASE_PENDING` is not final settlement: the normal PSP webhook finishes it.

## Mock carrier

No paid carrier service is integrated. Registering a real carrier name does not
subscribe to live tracking.

1. Configure a dedicated `TRACKING_WEBHOOK_SECRET`.
2. Seller registers `POST /api/v1/escrows/{id}/shipment` with a carrier and number.
3. Send `POST /api/v1/tracking/webhooks` with:

```json
{
  "id": "unique-provider-event-id",
  "carrier": "colissimo",
  "tracking_number": "PC12345678",
  "status": "DELIVERED",
  "occurred_at": "2026-11-19T10:00:00Z",
  "location": "Lyon"
}
```

Sign the canonical JSON using HMAC-SHA256 with that secret and send the hex
digest as `x-tracking-signature`. Canonicalization is the existing
`src/server/utils/canonical-json.ts` implementation. Missing configuration fails
closed; invalid signatures are refused. `IN_TRANSIT` and `EXCEPTION` are also
supported. Unknown shipments are acknowledged and ignored.

GET `/api/v1/escrows/{id}` includes shipment/events; there is no separate
shipment GET endpoint. Review data is at `/api/v1/disputes/{id}/review`.
Party statements use POST `/api/v1/disputes/{id}/statement`.
All authenticated writes require `Idempotency-Key`.

## Evidence and reviewer decision

Existing private upload reservations, hash verification, type limits and quota
enforcement remain in place (10 files, 50 MB total, JPEG/PNG/WebP/PDF).
Downloads use `/api/v1/disputes/{id}/evidence/{item_id}`; files are streamed
privately with no-store/nosniff/sandbox headers, not public storage URLs.

The reviewer can refund despite a delivered parcel: arrival proves neither the
contents nor their condition. Both sides can add statements and evidence; the
reviewer manually chooses `REFUND` or `RELEASE` through the existing resolver.

## Local verification

Use [local Supabase setup](local-supabase-development.md), apply
`20261119010000_protected_checkout_v1.sql`, and configure local app credentials.
No production migration or deploy is implied by this feature.

```sh
E2E_USE_LOCAL_UPSTASH_MOCK=1 npm run test:integration:protected-checkout
E2E_USE_LOCAL_UPSTASH_MOCK=1 npm run test:integration:escrow
E2E_USE_LOCAL_UPSTASH_MOCK=1 npm run test:integration:dispute
npm run test:testerarmy -- e2e/testerarmy/protected-checkout.e2e.ts
npm run verify:pr
```

Playwright uses a local mock carrier secret by default. The backend suite covers
real local persistence, signatures, deadlines, payout pauses and human decisions.
The TesterArmy suite covers desktop/mobile UI flows with intercepted responses;
it is not evidence of deployed behavior or live carrier/payment integration.
