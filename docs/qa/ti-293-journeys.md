# TI-293 — QA Journeys (Listings / Offers / Transactions)

This note documents what was added for **TI-293** and how to run it without launching the entire Playwright suite.

## What Was Added

Integration journeys (API + DB via Supabase service role):
- `e2e/integration/journey-seller-full.spec.ts`
- `e2e/integration/journey-buyer-full.spec.ts`
- `e2e/integration/journey-budget-approval-counter.spec.ts`

These cover the full chain:
- listing publish
- offer create + counter-offer chain
- accept (creates transaction)
- contact reveal (request + ops approve)
- completion (double opt-in)
- rating

Manual console QA checklist (TI-307):
- `docs/ti-307-console-qa-checklist.md`

## How To Run (Fast, By Feature)

These scripts exist to avoid running the full integration battery on every change:

```bash
npm run test:integration:deals
npm run test:integration:listings
npm run test:integration:transactions
npm run test:integration:escrow
npm run test:integration:dispute
```

For TI-293 specifically:

```bash
npm run test:integration:transactions
```

## Direct Runs (One-Off)

```bash
PW_WEB_SERVER_MODE=prod npx playwright test --project=integration \
  e2e/integration/journey-seller-full.spec.ts \
  e2e/integration/journey-buyer-full.spec.ts \
  e2e/integration/journey-budget-approval-counter.spec.ts
```

## Common Failure Mode: Schema Drift

Integration tests assume your Supabase database has all migrations applied.

Symptom:
- 500 with `DATABASE_ERROR` like `column agents_1.suspended_at does not exist`

Fix:
- Apply the missing migration(s) from `supabase/migrations/`.
  - The `suspended_at` columns are added by `supabase/migrations/20260209171000_moderation_v1.sql`.

