# TI-289 Alerting Runbook (Cron: Observability Alerts)

This repository exposes an internal cron endpoint that computes basic SLO burn rates and a few anomaly checks from recent `audit_logs`, plus queue depth checks for background workers.

Endpoint:

- `GET|POST /api/internal/cron/observability-alerts`
- Auth: header `x-cron-secret: $INTERNAL_CRON_SECRET`

The handler returns JSON and emits structured log lines for any triggered alerts (`observability.alert_triggered`).

## What The Cron Computes

Data sources:

- `audit_logs` (Supabase): used to count v1 API requests and status codes.
- `trustscore_recalc_queue` and `watchlist_backfill_queue` (Supabase): used for queue depth and oldest item age.

Windows (defaults, configurable via env):

- Fast window: 5 minutes (`ALERTING_FAST_WINDOW_SECONDS`)
- Slow window: 60 minutes (`ALERTING_SLOW_WINDOW_SECONDS`)

SLO:

- `v1_api_availability_5xx`: success is “not 5xx”, measured over `/api/v1/%`.
- Burn rate is computed from the 5xx error rate vs the allowed error rate `(1 - SLO_TARGET)`.

## Alerts Implemented

These alert names are emitted in logs and included in the JSON `alerts[]` array when triggered.

1. `slo.burn_rate.v1_5xx` (severity: `critical`)
   - Condition: burn rate is above threshold in both fast and slow windows.
   - Default thresholds:
     - Fast: `ALERTING_SLO_FAST_BURN_THRESHOLD=14.4`
     - Slow: `ALERTING_SLO_SLOW_BURN_THRESHOLD=6`
   - Minimum traffic gates (defaults):
     - `ALERTING_SLO_FAST_MIN_REQUESTS=20`
     - `ALERTING_SLO_SLOW_MIN_REQUESTS=100`

2. `anomaly.5xx_spike.v1` (severity: `critical`)
   - Condition: fast-window 5xx rate crosses an absolute threshold and is “spiky” vs slow window.
   - Defaults:
     - `ALERTING_5XX_SPIKE_RATE_THRESHOLD=0.02` (2%)
     - `ALERTING_5XX_SPIKE_MIN_REQUESTS=50`
     - `ALERTING_5XX_SPIKE_MIN_ERRORS=5`
     - `ALERTING_5XX_SPIKE_MULTIPLIER=3` (fast rate must be >= 3x slow rate when slow rate > 0)

3. `anomaly.429_spike.v1` (severity: `warning`)
   - Condition: fast-window 429 rate crosses an absolute threshold and is “spiky” vs slow window.
   - Defaults:
     - `ALERTING_429_SPIKE_RATE_THRESHOLD=0.01` (1%)
     - `ALERTING_429_SPIKE_MIN_REQUESTS=50`
     - `ALERTING_429_SPIKE_MIN_ERRORS=10`
     - `ALERTING_429_SPIKE_MULTIPLIER=3`

4. `queue.depth.trustscore_recalc` (severity: `warning`)
   - Condition: `trustscore_recalc_queue` row count exceeds threshold.
   - Default: `ALERTING_TRUSTSCORE_QUEUE_DEPTH_THRESHOLD=1000`
   - Includes `oldest_updated_at` and `oldest_age_s` to help detect stuck queues.

5. `queue.depth.watchlist_backfill` (severity: `warning`)
   - Condition: `watchlist_backfill_queue` row count exceeds threshold.
   - Default: `ALERTING_WATCHLIST_BACKFILL_QUEUE_DEPTH_THRESHOLD=500`
   - Includes `oldest_updated_at` and `oldest_age_s`.

6. `queue.depth.approvals_pending` (severity: `warning`)
   - Condition: `approvals` rows with `state=PENDING` exceeds threshold.
   - Default: `ALERTING_APPROVALS_PENDING_DEPTH_THRESHOLD=200`
   - Includes `oldest_created_at` and `oldest_age_s`.

## How To Triage

General first steps:

1. Confirm the cron response: check the returned JSON `alerts[]` plus the per-check `triggered` booleans.
2. Identify whether this is new and acute (fast window) vs sustained (slow window).
3. Check for a recent deploy/config change around the alert start time.

### `slo.burn_rate.v1_5xx`

Meaning:

- The v1 API is producing enough 5xx responses that it is consuming error budget at an unsustainable rate.

Immediate actions:

1. Find the failing route groups:
   - Query `audit_logs` for 5xx in the fast window and group by `action.route_group` and `action.path`.
2. Check upstream dependencies commonly involved in 5xx:
   - Supabase availability and query latency
   - Redis/rate limiting and idempotency paths
   - PSP/webhook integrations (if failures align with payment endpoints)
3. Mitigate quickly:
   - Roll back the last deploy if correlated.
   - Temporarily disable or degrade non-critical features (best effort) if they are causing cascading failures.

After stabilizing:

1. Create an incident note with:
   - Which endpoints failed (route groups), error signatures, and start/end timestamps.
2. Add a follow-up ticket:
   - Fix root cause, add tests, and improve targeted alerting/dashboards.

### `anomaly.5xx_spike.v1`

Meaning:

- Sudden increase in 5xx responses (often regressions, dependency outage, or misconfig).

Actions:

1. Confirm it’s not noise:
   - Ensure the fast-window request volume is meaningful (`total_fast` and `errors_5xx_fast`).
2. Identify blast radius:
   - Are 5xx concentrated in one endpoint (single route group) or broad across the API?
3. Mitigate:
   - Roll back, feature-flag, or isolate the failing dependency path.

### `anomaly.429_spike.v1`

Meaning:

- Rate limiting is actively blocking traffic; could be abusive clients, a runaway integration, or too-low limits after a config change.

Actions:

1. Identify who is being rate-limited:
   - Inspect `audit_logs` for 429s and check `auth.agent_id`, `request.ip`, and `action.route_group`.
2. Decide on response:
   - If abusive: block at edge / revoke key / tighten per-identity rules.
   - If legitimate traffic: raise limits cautiously for the impacted route group and verify capacity.
3. Prevent recurrence:
   - Add targeted limits for hot paths and improve client backoff guidance.

### Queue Depth Alerts

Meaning:

- Background workers are not keeping up (or are stuck), leading to growing backlog.

Actions:

1. Check if the worker cron is running:
   - `POST /api/internal/cron/trustscore-recalc-queue`
   - `POST /api/internal/cron/watchlist-backfill-queue`
2. Check staleness:
   - Use `oldest_age_s` to see if the queue is stuck vs just temporarily behind.
3. For approvals backlog:
   - Look for a sudden jump in `approvals` with `state=PENDING` (often caused by a downstream failure that prevents auto-resolution).
4. Mitigate:
   - Temporarily increase cron frequency or batch limits (via the worker endpoints’ query params where supported).
   - Investigate Supabase errors/timeouts in logs if processing is failing.

## Environment Variables (Optional Tuning)

All variables are optional; defaults are used if unset.

- `ALERTING_SLO_TARGET` (default `0.999`)
- `ALERTING_FAST_WINDOW_SECONDS` (default `300`)
- `ALERTING_SLOW_WINDOW_SECONDS` (default `3600`)
- `ALERTING_SLO_FAST_BURN_THRESHOLD` (default `14.4`)
- `ALERTING_SLO_SLOW_BURN_THRESHOLD` (default `6`)
- `ALERTING_SLO_FAST_MIN_REQUESTS` (default `20`)
- `ALERTING_SLO_SLOW_MIN_REQUESTS` (default `100`)
- `ALERTING_5XX_SPIKE_RATE_THRESHOLD` (default `0.02`)
- `ALERTING_5XX_SPIKE_MIN_REQUESTS` (default `50`)
- `ALERTING_5XX_SPIKE_MIN_ERRORS` (default `5`)
- `ALERTING_5XX_SPIKE_MULTIPLIER` (default `3`)
- `ALERTING_429_SPIKE_RATE_THRESHOLD` (default `0.01`)
- `ALERTING_429_SPIKE_MIN_REQUESTS` (default `50`)
- `ALERTING_429_SPIKE_MIN_ERRORS` (default `10`)
- `ALERTING_429_SPIKE_MULTIPLIER` (default `3`)
- `ALERTING_TRUSTSCORE_QUEUE_DEPTH_THRESHOLD` (default `1000`)
- `ALERTING_WATCHLIST_BACKFILL_QUEUE_DEPTH_THRESHOLD` (default `500`)
- `ALERTING_APPROVALS_PENDING_DEPTH_THRESHOLD` (default `200`)

## Manual Invocation

Example:

```bash
curl -sS \\
  -H "x-cron-secret: $INTERNAL_CRON_SECRET" \\
  -X POST \\
  "https://app.clawdeals.com/api/internal/cron/observability-alerts"
```
