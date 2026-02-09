# SLO/SLI v1 + Error Budget Policy

Owner: Platform/Ops
Last updated: 2026-02-09
Status: v1 (draft; iterate after baselines)

Related docs:
- `public/heartbeat.md` (public-facing status + SLOs v0)
- `docs/ops-middleware.md` (runtime/env + internal cron endpoints)

## 1) Scope (what this covers)

This document defines **v1 SLOs** for Clawdeals’ critical user journeys and the **error budget policy** used to decide:
- when to slow down / stop feature work,
- when to run an incident,
- what operational actions are mandatory.

In scope (v1):
- API core write journeys (deal, listing, offer) on `app.clawdeals.com` (`/api/v1/*`)
- Approvals operational latency (manual/ops queue)
- SSE stream best-effort delivery (ops + agents)

Out of scope (v1):
- Marketing site (`www.clawdeals.com`) availability/latency
- Non-critical reads (browse/search) SLOs (to add in v1.1 once core writes are stable)

## 2) Definitions (short and strict)

- **SLI (Service Level Indicator):** the measured metric (ex: success rate, p95 latency).
- **SLO (Service Level Objective):** the target for an SLI over a window (ex: 99.0% over 30 days).
- **Error budget:** `1 - SLO`. The allowed amount of “bad” events in the window.
- **Burn rate:** `current_bad_rate / allowed_bad_rate`. Burn rate `2.0` means we burn budget twice as fast.
- **Window:** default is **rolling 30 days** unless specified otherwise.

## 3) Measurement Sources (what we can query today)

### 3.1 API SLIs: `public.audit_logs`

Core write journeys are auditable through `public.audit_logs`:
- Filter by `action->>'event'` (stable semantic name, preferred)
- Use `outcome`:
  - `SUCCESS`: request completed successfully
  - `FAILURE`: request failed (any 4xx/5xx)
  - `BLOCKED`: blocked by middleware (rate limit, idempotency gate, policy)

Limitations (important):
- `request.status_code` and `request.duration_ms` are stored in the audit payload (added in TI-288).
- Historical rows (before TI-288) may have `status_code/duration_ms = null` and should be excluded from latency calculations.

Helper views (optional, in-repo):
- `public.ops_sli_api_write_journeys_daily_v1`
- `public.ops_sli_approvals_resolve_daily_v1`

### 3.2 Approvals SLIs: `public.approvals`

`public.approvals` contains `created_at` and `resolved_at` enabling resolution-latency measurement.

### 3.3 SSE SLIs: structured logs (best-effort)

`/api/v1/events/stream` currently runs with `enableAudit: false`, so SSE cannot be measured from `audit_logs`.

Signals currently emitted as structured logs:
- `sse.client_connected`, `sse.client_disconnected`
- `sse.redis_error`, `sse.payload_dropped`, `sse.event_skipped`, `sse.event_sent`
- `sse.gap`, `sse.replay_hit`, `sse.replay_miss`

If logs are not retained/queriable in prod, SSE SLOs are “best effort” until we wire log-based metrics or lightweight counters.

## 4) SLO Catalog (v1)

Each SLO below includes:
- **What:** user journey
- **SLI(s):** how we measure
- **Target:** objective + window
- **Error budget:** what “bad” means and what’s allowed

### SLO-API-01 — Create Deal (write journey)

What:
- “Create deal” request completes successfully.
- API: `POST /api/v1/deals`
- Audit event: `action.event = 'deal.create'`

SLIs:
1. Success rate:
   - Good = `outcome = 'SUCCESS'`
   - Total = all audit rows where `action.event = 'deal.create'`
2. Latency p95 (server-side):
   - Good = `status_code` in `200..399`
   - Measurement = p95 of `request.duration_ms` among good events.

Targets (initial; tune after 2–4 weeks of baseline):
- Success rate: **>= 99.0%** (rolling 30 days)
- Latency p95: **<= 1000ms** (rolling 30 days)

Error budget:
- Allowed bad fraction (success rate): **1.0%** of requests in the window.
- Allowed slow fraction (latency): **5.0%** of requests above 1000ms (equivalent to p95 <= 1000ms).

Example SQL (success rate):

```sql
select
  count(*) as total,
  sum(case when outcome = 'SUCCESS' then 1 else 0 end) as good,
  round(100.0 * sum(case when outcome = 'SUCCESS' then 1 else 0 end) / nullif(count(*), 0), 4) as success_rate_pct
from public.audit_logs
where occurred_at >= now() - interval '30 days'
  and action->>'event' = 'deal.create';
```

Example SQL (p95 latency in ms for good events):

```sql
select
  percentile_cont(0.95) within group (order by (request->>'duration_ms')::numeric) as p95_duration_ms
from public.audit_logs
where occurred_at >= now() - interval '30 days'
  and action->>'event' = 'deal.create'
  and (request->>'status_code')::int between 200 and 399
  and (request->>'duration_ms') is not null;
```

### SLO-API-02 — Create Listing + Create Offer (write journey)

What:
- “Create listing” and “create offer” complete successfully.
- APIs:
  - `POST /api/v1/listings` (listing.create)
  - `POST /api/v1/listings/:listing_id/offers` (offer.create)
- Audit events:
  - `action.event IN ('listing.create', 'offer.create')`

SLIs:
1. Success rate: same definition as SLO-API-01 (good = `SUCCESS`).
2. Latency p95 (server-side): p95 of `request.duration_ms` among good events.

Targets (initial):
- Success rate: **>= 99.0%** (rolling 30 days)
- Latency p95: **<= 1200ms** (rolling 30 days)

Error budget:
- Allowed bad fraction (success rate): **1.0%** of requests.
- Allowed slow fraction (latency): **5.0%** of requests above 1200ms.

Example SQL (success rate):

```sql
select
  count(*) as total,
  sum(case when outcome = 'SUCCESS' then 1 else 0 end) as good,
  round(100.0 * sum(case when outcome = 'SUCCESS' then 1 else 0 end) / nullif(count(*), 0), 4) as success_rate_pct
from public.audit_logs
where occurred_at >= now() - interval '30 days'
  and action->>'event' in ('listing.create', 'offer.create');
```

### SLO-OPS-01 — Approvals Resolve Time (ops journey)

What:
- Approvals created by the system are resolved by humans in a reasonable time.
- Table: `public.approvals`

SLIs:
1. Resolve time p95:
   - `resolved_at - created_at` for resolved approvals (resolved_at not null).
2. “Within threshold” rate:
   - Good = approvals resolved within `T` hours.
   - Total = all approvals resolved in the window.

Targets (initial):
- p95 resolve time: **<= 4 hours** (rolling 30 days)
- within 4 hours rate: **>= 95%** (rolling 30 days)

Error budget:
- Allowed slow fraction: **5.0%** of approvals over 4 hours.

Example SQL (p95 and within-threshold rate):

```sql
with resolved as (
  select
    approval_id,
    created_at,
    resolved_at,
    (resolved_at - created_at) as resolve_time
  from public.approvals
  where resolved_at is not null
    and created_at >= now() - interval '30 days'
)
select
  percentile_cont(0.95) within group (order by extract(epoch from resolve_time)) as p95_seconds,
  round(100.0 * sum(case when resolve_time <= interval '4 hours' then 1 else 0 end) / nullif(count(*), 0), 4) as within_4h_pct
from resolved;
```

Notes:
- This SLO is partly “process” (human-dependent). It still protects customer experience (blocked contact reveals, blocked messaging).
- Pair this SLO with a queue health dashboard (pending age, backlog size).

### SLO-SSE-01 — SSE Delivery (best effort)

What:
- Streams stay healthy enough that clients receive near-real-time updates.
- API: `GET /api/v1/events/stream`

SLIs (today, from logs):
1. Connection health:
   - Count `sse.client_connected` and `sse.client_disconnected`.
   - Alert on connect spikes, disconnect storms, or prolonged absence of connects in business hours.
2. Publish failures / drops:
   - `sse.redis_error`, `sse.payload_dropped` rate.
3. Replay gaps:
   - `sse.gap` rate (clients falling behind beyond replay window).

Targets (initial; best effort until we have durable log-based metrics):
- `sse.redis_error` rate: **< 0.1%** of publish attempts (rolling 7 days)
- `sse.payload_dropped` rate: **< 0.1%** of publish attempts (rolling 7 days)
- `sse.gap` rate: **< 1%** of connections (rolling 7 days)

Error budget:
- Allowed bad fractions as per targets above.

Notes:
- If logs are not queryable, treat this SLO as “observational” and focus on user-reported impact + synthetic checks.

## 5) Error Budget Policy (actionable rules)

This policy is mandatory for **production**. It’s designed to stop us from “shipping into fire.”

### 5.1 Budget states

For each SLO in Section 4, compute remaining budget over the current window.

State definitions (per-SLO):
- **GREEN:** remaining budget >= 50% and no active burn alerts.
- **YELLOW:** remaining budget in [25%, 50%) or slow-burn alert active.
- **RED:** remaining budget in (0%, 25%) or fast-burn alert active.
- **EXHAUSTED:** remaining budget <= 0%.

Overall system state:
- Take the **worst** state across SLO-API-01, SLO-API-02, SLO-OPS-01. SSE is advisory until log-based metrics are durable.

### 5.2 Stop-ship / ship rules

GREEN:
- Ship normally.
- Keep deployments small and reversible (feature flags, quick rollback).

YELLOW:
- Shipping allowed with guardrails:
  - No risky migrations without an explicit rollback plan.
  - Prefer canary or off-peak deploys.
  - Every feature PR must include: “failure mode” + “rollback” notes.
- Reliability work minimum: **20%** of engineering capacity until back to GREEN.

RED:
- Feature freeze:
  - Only ship: reliability fixes, rollbacks, config changes, and critical security patches.
  - No net-new API surface unless it mitigates the incident.
- Reliability work minimum: **50%** of engineering capacity until YELLOW/GREEN.

EXHAUSTED:
- Full stop-ship for features.
- Incident required (even if impact seems “small”): determine why we are burning budget and fix the systemic cause.
- Postmortem required for any multi-day exhaustion.

### 5.3 Incident triggers (based on burn)

Use burn rate as the trigger, not just “SLO failed at month end.”

Definitions:
- Allowed bad rate = `1 - objective`.
- Burn rate = `bad_rate / allowed_bad_rate`.

Recommended burn alerts for 30-day objectives (multi-window):
- **FAST burn (page / Sev-1):**
  - burn_rate >= 14.4 for 5 minutes AND burn_rate >= 6 for 1 hour
- **SLOW burn (ticket / Sev-2):**
  - burn_rate >= 3 for 6 hours AND burn_rate >= 1 for 3 days

If your monitoring stack cannot do multi-window burn alerts yet:
- Fall back to simpler triggers (example for a 99.0% success-rate SLO):
  - Page: error rate >= 5% for 10 minutes
  - Ticket: error rate >= 1% for 2 hours

### 5.4 Review cadence (non-optional)

- Weekly (30 min): SLO review
  - current window performance
  - top regressions (endpoint/event)
  - budget remaining and forecast
- Monthly: reset targets if needed (only with an explicit note explaining why)

## 6) Dashboard Spec (what to build in US-V1-REL-02)

No Grafana/Datadog dashboard artifacts are currently stored in-repo.

If we decide to manage dashboards as code:
- Suggested location: `docs/observability/grafana/`
- Store exported dashboard JSON with a short README that states:
  - data sources (Postgres, logs)
  - required variables (env, host)
  - import instructions

Minimum dashboard panels to implement:
- API success rate by `action.event` (deal.create, listing.create, offer.create)
- API request volume by `action.event` (to contextualize error budget)
- API latency p50/p95/p99 per journey (requires `duration_ms` instrumentation or platform metrics)
- 429 rate + top `route_group` / identity (to detect self-inflicted SLO failures)
- Approvals:
  - pending backlog size
  - oldest pending age
  - p50/p95 resolve time
- SSE:
  - connect/disconnect rate
  - redis_error / payload_dropped rate
  - replay gaps (`sse.gap`)

## 7) Gaps / Next Steps (to make v1 measurable end-to-end)

1. Backfill / baselining:
   - `request.duration_ms/status_code` exist for new audit rows (TI-288), but historical rows may not include them.
   - Establish baselines on “post-TI-288” data before tightening targets.
2. Add durable SSE metrics:
   - Either ship log-based metrics to a queryable store, or emit lightweight counters to DB/Redis for dashboards.
3. Add daily SLI export (optional but pragmatic):
   - A cron that computes daily SLI points into a small `sli_daily` table for cheap charts and budget math.
