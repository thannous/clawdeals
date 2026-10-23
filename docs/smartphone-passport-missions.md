# Smartphone passport buying missions

This extends the existing buying mission with structured passport requirements.
It uses seller declarations, not a certification or an automatic purchase decision.

## Buyer journey

From a smartphone comparison, **Create a mission** opens the existing mission
form. The model is prefilled from the passport when available. The price becomes
the editable preferred price and ceiling only when it uses the market currency
(EUR for FR/ES, GBP for GB). The visible default city and radius are editable;
they are not inferred from a seller's precise location.

The buyer chooses an exact model, a minimum declared battery-health percentage
and/or passport checks that must be marked **no issue**. At least one criterion
is required when smartphone filtering is enabled. The general budget, currency,
market, radius, expiration and permissions still apply.

The URL contains only a random draft token. The brief remains in the existing
account-scoped tab storage, survives login/reload and is shown before confirmation.
A missing/expired token produces a recovery error rather than silently creating
an ordinary mission. A server response that drops or changes the confirmed
smartphone criteria remains uncertain: the same request body and idempotency key
are retained. WebMCP exposes the same optional criteria and confirmation summary.

Mission details group **compatible** and **to confirm** results separately and
explain each relevant passport fact. The buyer can reopen the public comparator.
Turning smartphone filtering off preserves ordinary mission behavior.

## Matching rules

| Requirement | Eligible | Missing or conflicting information |
| --- | --- | --- |
| Exact model | Unicode NFKC, collapsed spaces and case-insensitive equality | Missing model is unknown; iPhone 13 mini does not match iPhone 13. |
| Minimum battery health | Integer 0–100 at or above the threshold, with an applicable answered battery check | Unknown/N/A or absent percentage is unknown, never zero or a pass. |
| Required passport check | Answer is `ok` | `issue` is incompatible; unknown/N/A/missing is unknown. |

A known mismatch takes precedence over another unknown field. A missing passport
is unknown. Photos and free-text notes never increase eligibility. A battery
threshold alone does not require its condition check to be `ok`; buyers can
select the battery check as an additional requirement.

Smartphone missions use the same Unicode lexical search of listing title,
description and passport model in the result page and matching queue. All search
terms are required. This is separate from exact model equality. Ordinary missions
retain their existing catalogue search behavior.

## Alerts and persistence

Alerts appear **inside ClawDeals**. Creation schedules the existing backfill;
passport saves, listing changes and moderation changes schedule reevaluation.
An alert is created on a transition from noncompatible/unknown to compatible.
It explains first match, changed passport, price or criteria, with the observed
time. Retrying an unchanged compatible event creates no duplicate. A further
price reduction while already compatible does not create another alert.

Hidden/removed listings invalidate their saved match; changing a listing or
mission market/currency also clears its old compatibility and alerts immediately.
Returning to the original market requires a new evaluation and creates a fresh
alert. Listing events only select smartphone missions in the same market.
Paused, expired or suspended missions cannot create eligible alerts. Results and alerts recheck
current mission state, visibility and eligibility before returning. GET reads do
not generate alerts. No seller message, offer, payment, email or push is sent by
this feature.

`criteria.mission.smartphone` is optional and versioned:

```json
{
  "version": 1,
  "model": "iPhone 13",
  "battery_health_min": 90,
  "required_checks": ["screen", "locks"]
}
```

The criteria have canonical nullable model/threshold fields and unique known
check IDs. Invalid or empty criteria fail validation. API/SDK definitions are in
[OpenAPI](./openapi-v1.yaml).

Apply these migrations in order before deploying this code:

- `20261022192326_smartphone_passport_missions_v1.sql`
- `20261023152651_smartphone_mission_market_invalidation.sql`
- `20261023152827_watchlist_backfill_progress_v1.sql`

They add private transition state with RLS, service-only grants, market/currency
invalidation, resumable backfill progress and an atomic recorder. The recorder compares the listing snapshot,
mission criteria and passport revision while holding row locks; stale workers
cannot overwrite newer eligibility. Market/currency edits advance the mission
timestamp even within the same clock tick, preventing a delayed worker from
reusing a pre-edit result. Existing queue/backfill schedules are reused.

Work remains bounded by the existing queue batches and catalogue pagination:
initial backfill examines recent listings (500 by default, at most 5,000), and
a results request reads at most five catalogue pages before returning its cursor.
Matching considers at most 5,000 candidate missions per market and records each smartphone
transition atomically. No large-scale load qualification is claimed. This is not a
promise to scan every historical listing in one request.

Smartphone backfill performs at most **20 transitions across the whole drain**.
The internal `transition_limit` parameter may lower this cap, never raise it.
Each generation fixes a recent-listing window in the mission's market (500 by
default, at most 5,000). It stores the `(created_at, listing_id)` cursor after each
successful transition. Subsequent scheduled drains continue that cursor; a
partial run does not restart at the newest listing. A 30-second work budget and
5-second request limits keep room within the 60-second handler.

Checkpoint writes compare both the queue generation and its progress version.
A newer enqueue resets the cursor; an older worker cannot overwrite or delete
that work. Scheduling rotates attempted missions so one unfinished backfill does
not monopolize later drains. Checkpoints do not emit an HTTP wake per listing;
the existing scheduled recovery continues pending work. Larger initial scans can
therefore need several scheduled passes. Ordinary mission backfill retains its
existing batched path.

Operational limits of this first version:

- The recorder currently retains rejected snapshots, including non-smartphone
  listings. State can therefore grow with listings × active smartphone missions in the same market.
  Before scaling this workload, avoid new states for non-phones while retaining
  reevaluation of any prior state (an item can cease to be a smartphone). A grouped
  lookup would avoid replacing each unnecessary write with an extra query.
- A stale snapshot raises a retryable evaluation error. The listing queue retains
  that event and continues with other listings; its next scheduled pass retries
  the unfinished work. Backfill retains the last committed cursor and retries unfinished work on a
  later scheduled pass. Matches already committed remain persisted and
  deduplicated. Do not clear the
  pending queue to work around a conflict; investigate repeated retries instead.

## Verification

Start an isolated native local Supabase stack with all migrations and configure
the app with its local Auth/service keys and a local Redis REST simulator, using
[the local setup guide](./local-supabase-development.md). Provide a local
`CRON_SECRET`, an `OWNER_SESSION_SECRET`, and
`OWNER_SESSION_COOKIE_SECURE=false` for HTTP. The connected fixture refuses any
nonloopback app or backend, even when a production-test opt-in is present.

With the app running at localhost:4346:

```sh
TESTERARMY_PASSPORT_MISSIONS_LIVE=1 \
E2E_BASE_URL=http://localhost:4346 \
TESTERARMY_REDIS_FIXTURE=local-rest-simulator \
PARITY_OUTPUT=.e2e/validation/passport-missions-live-UNIQUE \
mise exec node@24.22.1 -- npm run test:testerarmy
```

Eight scenarios run on desktop and mobile: comparison/login/reload/creation,
real passport/price updates and queue transitions, private/inactive exclusions,
validation plus ordinary-mission compatibility, category-filter parity across
owner results and workers, exclusion of other-market candidates, market edits
and fresh alerts, and bounded backfill progress across two missions. They use real local Auth,
owner cookies, application APIs, PostgreSQL and queue endpoints. The fixture
cleans up its exact records and records a safe receipt. Traces/video are disabled
around real credentials. Redis is a simulator; external delivery is not invoked.

Client recovery is qualified separately with intercepted responses:

```sh
E2E_BASE_URL=http://localhost:4346 \
PARITY_OUTPUT=.e2e/validation/passport-missions-recovery-UNIQUE \
mise exec node@24.22.1 -- npm run test:testerarmy -- \
  e2e/testerarmy/passport-mission.recovery.e2e.ts
```

Focused shared-evaluator tests cover combinations and ambiguous data that are
impractical to exhaust in a browser. PostgreSQL tests cover stale workers, ordered write interleavings and privilege
boundaries that a sequential browser journey cannot prove.
`npm run verify:pr` on the final commit remains required before push. Local QA
and PR checks do not constitute a production migration or deployment.
