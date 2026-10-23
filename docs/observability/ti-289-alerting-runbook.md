# Observability: alerts and triage

Use this runbook when API writes fail, rate limits spike or queues stop draining.
Definitions below describe repository behavior, not proof that the deployed cron
or an alert destination is working. Inspect current traffic before declaring an
incident; fictitious development traffic is not an adoption measurement.

## Run the check

`GET|POST /api/internal/cron/observability-alerts` returns JSON and emits
`observability.alert_triggered` for triggered alerts. It accepts a Bearer token
matching `CRON_SECRET` or `INTERNAL_CRON_SECRET`; `x-cron-secret` accepts only
`INTERNAL_CRON_SECRET`. See [cron authentication](../../src/server/internal-cron-auth.ts).

```bash
curl --fail-with-body -sS \
  -H "Authorization: Bearer $CRON_SECRET" \
  -X POST "https://app.clawdeals.com/api/internal/cron/observability-alerts"
```

Inspect `skipped`, `alerts[]` and each check's `triggered` field. Missing
`SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` yields a skipped result, not a healthy
service. Scheduling is documented in [market infrastructure](../launch-eu-fr-gb-es.md#crons-and-plans).

## Implemented checks

The [implementation](../../src/server/observability/alerts.ts) owns all `ALERTING_*`
settings and bounds. Defaults use a 5-minute fast window and a 1-hour slow window.

| Alert | Default trigger |
| --- | --- |
| `slo.burn_rate.v1_write_success` — critical | Success target 99%; burn ≥14.4 fast **and** ≥6 slow, with at least 20/100 requests respectively. |
| `anomaly.5xx_spike.v1` — critical | Fast 5xx rate ≥2%, at least 50 requests and 5 errors; ≥3× slow rate when it is positive. |
| `anomaly.429_spike.v1` — warning | Fast 429 rate ≥1%, at least 50 requests and 10 errors; ≥3× slow rate when it is positive. |
| `queue.depth.trustscore_recalc` | More than 1,000 rows. |
| `queue.depth.watchlist_backfill` | More than 500 rows. |
| `queue.depth.watchlist_match` | More than 500 rows. |
| `queue.depth.approvals_pending` | More than 200 approvals in `PENDING`. |

Write success counts `audit_logs` for `deal.create`, `listing.create` and
`offer.create`: only `outcome=SUCCESS` is good. Burn rate is the bad fraction
divided by `1 - ALERTING_SLO_TARGET`; policy blocks therefore affect it too.
5xx/429 checks use `/api/v1/%` rows with a recorded status code. Queue responses
include oldest timestamps and age, so distinguish a brief backlog from a stall.

## Diagnose and recover

1. Confirm the affected deployment/configuration, window, volume and user impact.
   Check the scheduled invocation itself and retained logs; an empty alert list
   under a minimum-traffic gate is not a reliability measurement.
2. For write failures or 5xx, group audit events by route and inspect Supabase,
   Redis, idempotency and relevant upstream dependencies. Separate policy denials
   from server errors before changing anything.
3. For 429, identify the route and caller in private operational records; check
   client retry/backoff and capacity. Do not raise limits to hide a runaway client.
4. For queue alerts, check consumer execution and `oldest_age_s`. Follow
   [queue recovery](../queue-event-dispatch.md); retain durable rows and inspect
   pending approvals through the authorized console.
5. Mitigate within the approved scope, checking database compatibility before
   an app rollback. Verify the affected journey and subsequent queue/alert
   readings. Record cause, interval, source/deployment and useful evidence.

## Engineering targets

These retained targets are objectives, not measured service levels or customer
SLAs. Establish a representative baseline before using them as release criteria.

| Journey | Target and measurement |
| --- | --- |
| Deal creation | ≥99% success, successful-request p95 ≤1,000 ms over 30 days. |
| Listing / offer creation | ≥99% success, successful-request p95 ≤1,200 ms over 30 days. |
| Human approval resolution | p95 ≤4 hours; ≥95% of resolved approvals within 4 hours over 30 days. Also inspect pending age. |
| SSE, observational | Over 7 days: Redis errors and dropped payloads each <0.1% of publish attempts; gaps <1% of connections. Requires retained, queryable logs. |

API latency uses `audit_logs.request.duration_ms` for status 200–399; exclude
missing durations. Approval timing uses `created_at` and `resolved_at`.
SSE has audit disabled: inspect `sse.redis_error`, `sse.payload_dropped`, `sse.gap`
and connection/replay logs. The cron above does not calculate all these targets.
No-data or missing telemetry must remain explicit.
