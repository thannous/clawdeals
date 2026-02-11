import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const DEFAULT_WINDOW_MINUTES = 60;
const MIN_WINDOW_MINUTES = 5;
const MAX_WINDOW_MINUTES = 24 * 60;

const AUDIT_BATCH_SIZE = 5000;
const AUDIT_MAX_ROWS = 20000;
const BURN_RATE_FAST_WINDOW_SECONDS = 5 * 60;
const BURN_RATE_SLOW_WINDOW_SECONDS = 60 * 60;

const SLI_EVENTS = ["deal.create", "listing.create", "offer.create"] as const;
const SLO_TARGET = 0.99; // 99.0%
const SLO_LATENCY_TARGETS: Record<string, number> = {
  "deal.create": 1000,
  "listing.create": 1200,
  "offer.create": 1200
};

type BudgetState = "GREEN" | "YELLOW" | "RED" | "EXHAUSTED";

function computeBudgetState(successRate: number | null, sloTarget: number): BudgetState {
  if (successRate === null) return "GREEN";
  const errorBudget = 1 - sloTarget;
  const usedBudget = Math.max(0, 1 - successRate);
  const remainingPct = errorBudget > 0 ? Math.max(0, 1 - usedBudget / errorBudget) : 0;
  if (remainingPct <= 0) return "EXHAUSTED";
  if (remainingPct < 0.25) return "RED";
  if (remainingPct < 0.5) return "YELLOW";
  return "GREEN";
}

function computeBurnRate(badRate: number | null, sloTarget: number): number | null {
  if (badRate === null) return null;
  const allowedBadRate = 1 - sloTarget;
  if (allowedBadRate <= 0) return null;
  const raw = badRate / allowedBadRate;
  return Math.round(raw * 1e6) / 1e6;
}

function buildServiceError(message: string, status = 500, code = "ERROR", meta?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (meta && typeof meta === "object") {
    Object.assign(error, meta);
  }
  return error;
}

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function formatFilterValue(value: any) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function toFiniteNumber(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseStrictInt(value: any): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return value;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^-?\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return null;
  return parsed;
}

function percentileFromSorted(sorted: number[], p: number): number | null {
  if (!Array.isArray(sorted) || sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.max(0, Math.min(1, p));
  const idx = (sorted.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

async function countRows({ client, table, select, filters }: any) {
  const selectExpr = typeof select === "string" && select.trim() ? select : "*";
  let query = client.from(table).select(selectExpr, { count: "exact", head: true });
  if (Array.isArray(filters)) {
    for (const f of filters) {
      if (!f || typeof f !== "object") continue;
      if (f.op === "eq") query = query.eq(f.col, f.value);
      if (f.op === "is") query = query.is(f.col, f.value);
    }
  }
  const { count, error } = await query;
  if (error) {
    mapError(error);
  }
  return typeof count === "number" ? count : 0;
}

async function fetchAuditRowsWindow({ client, fromIso, toIso }: any) {
  const rows: any[] = [];
  let cursorState: any = null;

  while (rows.length < AUDIT_MAX_ROWS) {
    const remaining = AUDIT_MAX_ROWS - rows.length;
    const limit = Math.max(1, Math.min(AUDIT_BATCH_SIZE, remaining));

    let query = client
      .from("audit_logs")
      .select("id, occurred_at, action, request, auth, outcome")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .gte("occurred_at", fromIso)
      .lt("occurred_at", toIso)
      .limit(limit);

    if (cursorState?.occurred_at && cursorState?.id) {
      const occurredAt = formatFilterValue(cursorState.occurred_at);
      const id = formatFilterValue(cursorState.id);
      query = query.or(`occurred_at.lt.${occurredAt},and(occurred_at.eq.${occurredAt},id.lt.${id})`);
    }

    const { data, error } = await query;
    if (error) {
      mapError(error);
    }

    const batch = Array.isArray(data) ? data : [];
    if (batch.length === 0) break;
    rows.push(...batch);

    if (batch.length < limit) break;

    const last = batch[batch.length - 1];
    cursorState = { occurred_at: last?.occurred_at, id: last?.id };
    if (!cursorState?.occurred_at || !cursorState?.id) break;
  }

  return { rows, truncated: rows.length >= AUDIT_MAX_ROWS, maxRows: AUDIT_MAX_ROWS };
}

function normalizeRouteGroup(value: any) {
  if (typeof value !== "string") return "(none)";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "(none)";
}

type RouteGroupBucket = {
  routeGroup: string;
  requestCount: number;
  durations: number[];
  status4xx: number;
  status429: number;
  status5xx: number;
};

async function fetchOldestPendingApproval({ client }: any) {
  const { data, error } = await client
    .from("approvals")
    .select("created_at")
    .eq("state", "PENDING")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) mapError(error);
  const row = Array.isArray(data) ? data[0] : null;
  return row?.created_at ? String(row.created_at) : null;
}

async function fetchResolvedApprovals({ client, fromIso, toIso }: any) {
  const { data, error } = await client
    .from("approvals")
    .select("created_at, resolved_at")
    .not("resolved_at", "is", null)
    .gte("resolved_at", fromIso)
    .lt("resolved_at", toIso)
    .order("resolved_at", { ascending: false })
    .limit(5000);

  if (error) mapError(error);
  return Array.isArray(data) ? data : [];
}

export async function getConsoleOpsDashboard({
  windowMinutes = DEFAULT_WINDOW_MINUTES,
  now = new Date(),
  client
}: any = {}) {
  const parsedWindow = parseStrictInt(windowMinutes);
  if (parsedWindow === null) {
    throw buildServiceError("windowMinutes must be an integer", 400, "VALIDATION_ERROR");
  }
  if (parsedWindow < MIN_WINDOW_MINUTES || parsedWindow > MAX_WINDOW_MINUTES) {
    throw buildServiceError(
      `windowMinutes must be between ${MIN_WINDOW_MINUTES} and ${MAX_WINDOW_MINUTES}`,
      400,
      "VALIDATION_ERROR"
    );
  }

  const supabase = client || getSupabaseServiceClient();
  const toIso = now.toISOString();
  const fromIso = new Date(now.getTime() - parsedWindow * 60 * 1000).toISOString();
  const burnSlowFromIso = new Date(now.getTime() - BURN_RATE_SLOW_WINDOW_SECONDS * 1000).toISOString();
  const requiresExtendedBurnLookback = parsedWindow * 60 < BURN_RATE_SLOW_WINDOW_SECONDS;

  const [
    { rows: auditRows, truncated, maxRows },
    approvalsPending,
    trustscoreJobs,
    watchlistJobs,
    oldestPendingApproval,
    resolvedApprovals,
    burnAuditWindow
  ] = await Promise.all([
    fetchAuditRowsWindow({ client: supabase, fromIso, toIso }),
    countRows({
      client: supabase,
      table: "approvals",
      select: "approval_id",
      filters: [{ op: "eq", col: "state", value: "PENDING" }]
    }),
    countRows({ client: supabase, table: "trustscore_recalc_queue", select: "agent_id" }),
    countRows({ client: supabase, table: "watchlist_backfill_queue", select: "watchlist_id" }),
    fetchOldestPendingApproval({ client: supabase }),
    fetchResolvedApprovals({ client: supabase, fromIso, toIso }),
    requiresExtendedBurnLookback
      ? fetchAuditRowsWindow({ client: supabase, fromIso: burnSlowFromIso, toIso })
      : Promise.resolve(null)
  ]);

  const buckets = new Map<string, RouteGroupBucket>();

  let totalRequests = 0;
  let status2xx = 0;
  let status3xx = 0;
  let status4xx = 0; // excluding 429 (tracked separately)
  let status5xx = 0;
  let status429 = 0;

  const agent429 = new Map<string, number>();
  let unknownAgent429Count = 0;

  for (const row of auditRows) {
    const routeGroup = normalizeRouteGroup(row?.action?.route_group);
    const status = toFiniteNumber(row?.request?.status_code);
    // Exclude pre-instrumentation rows (missing status_code) so rates aren’t skewed.
    if (status === null) continue;

    let bucket = buckets.get(routeGroup);
    if (!bucket) {
      bucket = {
        routeGroup,
        requestCount: 0,
        durations: [],
        status4xx: 0,
        status429: 0,
        status5xx: 0
      };
      buckets.set(routeGroup, bucket);
    }

    bucket.requestCount += 1;
    totalRequests += 1;

    const duration = toFiniteNumber(row?.request?.duration_ms);
    // Keep latency percentiles aligned with our SLO definitions (success-only).
    if (duration !== null && duration >= 0 && status >= 200 && status < 400) {
      bucket.durations.push(duration);
    }

    if (status !== null) {
      if (status >= 200 && status < 300) status2xx += 1;
      else if (status >= 300 && status < 400) status3xx += 1;
      else if (status >= 400 && status < 500 && status !== 429) status4xx += 1;
      else if (status >= 500 && status < 600) status5xx += 1;

      if (status === 429) {
        status429 += 1;
        bucket.status429 += 1;

        const agentId = typeof row?.auth?.agent_id === "string" ? row.auth.agent_id : null;
        if (agentId && agentId.trim()) {
          agent429.set(agentId, (agent429.get(agentId) || 0) + 1);
        } else {
          unknownAgent429Count += 1;
        }
      }

      if (status >= 400 && status < 500 && status !== 429) {
        bucket.status4xx += 1;
      }
      if (status >= 500 && status < 600) {
        bucket.status5xx += 1;
      }
    }
  }

  const latencyByRouteGroup = Array.from(buckets.values())
    .map((bucket) => {
      const durations = bucket.durations.slice().sort((a, b) => a - b);
      const p50 = percentileFromSorted(durations, 0.5);
      const p90 = percentileFromSorted(durations, 0.9);
      const p95 = percentileFromSorted(durations, 0.95);
      const p99 = percentileFromSorted(durations, 0.99);
      return {
        route_group: bucket.routeGroup,
        request_count: bucket.requestCount,
        latency_samples: durations.length,
        p50_ms: p50 === null ? null : Math.round(p50),
        p90_ms: p90 === null ? null : Math.round(p90),
        p95_ms: p95 === null ? null : Math.round(p95),
        p99_ms: p99 === null ? null : Math.round(p99)
      };
    })
    .sort((a, b) => {
      const ap95 = typeof a.p95_ms === "number" ? a.p95_ms : -1;
      const bp95 = typeof b.p95_ms === "number" ? b.p95_ms : -1;
      if (bp95 !== ap95) return bp95 - ap95;
      return (b.request_count || 0) - (a.request_count || 0);
    });

  const errorsByRouteGroup = Array.from(buckets.values())
    .map((bucket) => ({
      route_group: bucket.routeGroup,
      request_count: bucket.requestCount,
      status_4xx: bucket.status4xx,
      status_429: bucket.status429,
      status_5xx: bucket.status5xx
    }))
    .filter((row) => row.status_4xx > 0 || row.status_5xx > 0 || row.status_429 > 0)
    .sort((a, b) => {
      if (b.status_5xx !== a.status_5xx) return b.status_5xx - a.status_5xx;
      if (b.status_4xx !== a.status_4xx) return b.status_4xx - a.status_4xx;
      return b.request_count - a.request_count;
    });

  const topAgents429 = Array.from(agent429.entries())
    .map(([agentId, count]) => ({ agent_id: agentId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const jobsPending = trustscoreJobs + watchlistJobs;

  // --- SLI: success rate by event ---
  const sliByEvent = new Map<string, { total: number; success: number }>();
  for (const evt of SLI_EVENTS) {
    sliByEvent.set(evt, { total: 0, success: 0 });
  }
  for (const row of auditRows) {
    const event = row?.action?.event;
    if (typeof event !== "string") continue;
    const bucket = sliByEvent.get(event);
    if (!bucket) continue;
    bucket.total += 1;
    // Use `outcome = 'SUCCESS'` to match the alert engine and SLO doc definition.
    if (row?.outcome === "SUCCESS") {
      bucket.success += 1;
    }
  }

  const sliEvents = Array.from(sliByEvent.entries()).map(([event, { total, success }]) => ({
    event,
    total,
    success,
    success_rate: total > 0 ? success / total : null
  }));

  const sliAggTotal = sliEvents.reduce((s, e) => s + e.total, 0);
  const sliAggSuccess = sliEvents.reduce((s, e) => s + e.success, 0);
  const sliAggRate = sliAggTotal > 0 ? sliAggSuccess / sliAggTotal : null;
  const sliAggBadRate = sliAggRate !== null ? 1 - sliAggRate : null;
  const sliErrorBudget = 1 - SLO_TARGET;
  const sliUsedBudget = sliAggBadRate !== null ? sliAggBadRate : 0;
  const sliBudgetRemainingPct = sliErrorBudget > 0 ? Math.max(0, 1 - sliUsedBudget / sliErrorBudget) * 100 : 0;
  const sliBudgetState = computeBudgetState(sliAggRate, SLO_TARGET);

  // Burn rate (fast=5m, slow=1h) should always use real 5m/1h lookbacks.
  // For short dashboard windows, fetch a separate 1h audit slice for burn-rate math.
  const burnFastWindowS = BURN_RATE_FAST_WINDOW_SECONDS;
  const burnSlowWindowS = BURN_RATE_SLOW_WINDOW_SECONDS;
  const burnAuditRows = burnAuditWindow?.rows || auditRows;
  const nowMs = now.getTime();
  let fastTotal = 0;
  let fastBad = 0;
  let slowTotal = 0;
  let slowBad = 0;
  for (const row of burnAuditRows) {
    const event = row?.action?.event;
    if (typeof event !== "string" || !sliByEvent.has(event)) continue;
    const occurredAt = new Date(row?.occurred_at).getTime();
    if (Number.isNaN(occurredAt)) continue;
    const isGood = row?.outcome === "SUCCESS";
    const ageS = (nowMs - occurredAt) / 1000;
    if (ageS <= burnFastWindowS) {
      fastTotal += 1;
      if (!isGood) fastBad += 1;
    }
    if (ageS <= burnSlowWindowS) {
      slowTotal += 1;
      if (!isGood) slowBad += 1;
    }
  }
  const burnRateFast = computeBurnRate(
    fastTotal > 0 ? fastBad / fastTotal : null,
    SLO_TARGET
  );
  const burnRateSlow = computeBurnRate(
    slowTotal > 0 ? slowBad / slowTotal : null,
    SLO_TARGET
  );

  // --- Approvals detail: resolve time ---
  const resolveDurations: number[] = [];
  for (const row of resolvedApprovals) {
    const createdMs = new Date(row?.created_at).getTime();
    const resolvedMs = new Date(row?.resolved_at).getTime();
    if (Number.isNaN(createdMs) || Number.isNaN(resolvedMs)) continue;
    const durationS = Math.max(0, (resolvedMs - createdMs) / 1000);
    resolveDurations.push(durationS);
  }
  resolveDurations.sort((a, b) => a - b);
  const oldestPendingAgeS = oldestPendingApproval
    ? Math.max(0, Math.floor((now.getTime() - new Date(oldestPendingApproval).getTime()) / 1000))
    : null;

  return {
    window: { from: fromIso, to: toIso, minutes: parsedWindow },
    sample: { audit_rows: auditRows.length, truncated, max_rows: maxRows },
    http: {
      total: totalRequests,
      status_2xx: status2xx,
      status_3xx: status3xx,
      status_4xx: status4xx,
      status_429: status429,
      status_5xx: status5xx
    },
    latency: {
      by_route_group: latencyByRouteGroup
    },
    errors: {
      by_route_group: errorsByRouteGroup
    },
    rate_limit: {
      status_429: status429,
      rate_429: totalRequests > 0 ? status429 / totalRequests : 0,
      top_agents: topAgents429,
      unknown_agent_429: unknownAgent429Count
    },
    queue: {
      approvals_pending: approvalsPending,
      jobs_pending: jobsPending,
      job_queues: [
        { name: "trustscore_recalc_queue", depth: trustscoreJobs },
        { name: "watchlist_backfill_queue", depth: watchlistJobs }
      ]
    },
    sli: {
      write_journeys: {
        events: [...SLI_EVENTS],
        by_event: sliEvents,
        aggregate: {
          total: sliAggTotal,
          success: sliAggSuccess,
          success_rate: sliAggRate,
          slo_target: SLO_TARGET,
          error_budget_remaining_pct: Math.round(sliBudgetRemainingPct * 100) / 100,
          budget_state: sliBudgetState
        },
        burn_rate: {
          fast: { window_s: burnFastWindowS, value: burnRateFast },
          slow: { window_s: burnSlowWindowS, value: burnRateSlow }
        }
      }
    },
    approvals_detail: {
      pending_count: approvalsPending,
      oldest_pending_age_s: oldestPendingAgeS,
      oldest_pending_created_at: oldestPendingApproval,
      resolved_window: {
        count: resolveDurations.length,
        p50_resolve_s: percentileFromSorted(resolveDurations, 0.5),
        p95_resolve_s: percentileFromSorted(resolveDurations, 0.95)
      }
    },
    slo_latency_targets: SLO_LATENCY_TARGETS
  };
}

export const CONSOLE_OPS_DEFAULT_WINDOW_MINUTES = DEFAULT_WINDOW_MINUTES;
export const CONSOLE_OPS_WINDOW_MINUTES_RANGE = { min: MIN_WINDOW_MINUTES, max: MAX_WINDOW_MINUTES };
