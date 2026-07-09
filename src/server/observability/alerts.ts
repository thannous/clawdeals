import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "../services/supabase-errors";

type Alert = {
  name: string;
  severity: "info" | "warning" | "critical";
  message: string;
  meta?: Record<string, any>;
};

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

function parseOptionalNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function envNumber(env: any, key: string, fallback: number) {
  const parsed = parseOptionalNumber(env?.[key]);
  return parsed === null ? fallback : parsed;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function ratio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function computeBurnRate(errorRate: number | null, sloTarget: number) {
  if (errorRate === null) return null;
  const allowedErrorRate = 1 - sloTarget;
  if (!Number.isFinite(allowedErrorRate) || allowedErrorRate <= 0) return null;
  return errorRate / allowedErrorRate;
}

function toIso(value: Date) {
  return value.toISOString();
}

function computeAgeSeconds(now: Date, iso: string | null) {
  if (!iso) return null;
  const parsedMs = new Date(iso).getTime();
  if (Number.isNaN(parsedMs)) return null;
  return Math.max(0, Math.floor((now.getTime() - parsedMs) / 1000));
}

async function countAuditLogs({
  client,
  fromIso,
  toIso,
  pathLike,
  requireStatusCode,
  statusEq,
  statusGte,
  statusLt
}: {
  client: any;
  fromIso: string;
  toIso: string;
  pathLike: string;
  requireStatusCode?: boolean;
  statusEq?: string | null;
  statusGte?: string | null;
  statusLt?: string | null;
}) {
  let query = client
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toIso)
    .like("action->>path", pathLike);

  if (requireStatusCode) {
    // Keep totals and numerator samples aligned: status-based filters exclude NULLs implicitly, but totals do not.
    query = query.not("request->>status_code", "is", null);
  }

  if (statusEq) {
    query = query.eq("request->>status_code", statusEq);
  }
  if (statusGte) {
    query = query.gte("request->>status_code", statusGte);
  }
  if (statusLt) {
    query = query.lt("request->>status_code", statusLt);
  }

  const { count, error } = await query;
  if (error) {
    mapError(error);
  }
  return typeof count === "number" ? count : 0;
}

async function countAuditLogsByEvents({
  client,
  fromIso,
  toIso,
  events,
  outcomeEq
}: {
  client: any;
  fromIso: string;
  toIso: string;
  events: string[];
  outcomeEq?: string | null;
}) {
  let query = client
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .gte("occurred_at", fromIso)
    .lt("occurred_at", toIso)
    .in("action->>event", events);

  if (outcomeEq) {
    query = query.eq("outcome", outcomeEq);
  }

  const { count, error } = await query;
  if (error) {
    mapError(error);
  }
  return typeof count === "number" ? count : 0;
}

async function countTableRows({
  client,
  table,
  column
}: {
  client: any;
  table: string;
  column: string;
}) {
  const { count, error } = await client.from(table).select(column, { count: "exact", head: true });
  if (error) {
    mapError(error);
  }
  return typeof count === "number" ? count : 0;
}

async function fetchOldestUpdatedAt({
  client,
  table
}: {
  client: any;
  table: string;
}) {
  const { data, error } = await client
    .from(table)
    .select("updated_at")
    .order("updated_at", { ascending: true })
    .limit(1);

  if (error) {
    mapError(error);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row?.updated_at ? String(row.updated_at) : null;
}

async function fetchOldestApprovalCreatedAt({ client }: { client: any }) {
  const { data, error } = await client
    .from("approvals")
    .select("created_at")
    .eq("state", "PENDING")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    mapError(error);
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row?.created_at ? String(row.created_at) : null;
}

export async function runObservabilityAlerts({
  env = process.env,
  now = new Date(),
  client: injectedClient
}: {
  env?: any;
  now?: Date;
  client?: any;
} = {}) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      skipped: true,
      reason: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    };
  }

  const client = injectedClient || getSupabaseServiceClient();

  const sloTargetDefault = 0.99; // 99.0% success (1.0% error budget)
  const sloTarget = Math.max(0.9, Math.min(0.9999, envNumber(env, "ALERTING_SLO_TARGET", sloTargetDefault)));

  const fastWindowSeconds = clampInt(envNumber(env, "ALERTING_FAST_WINDOW_SECONDS", 5 * 60), 60, 60 * 60);
  const slowWindowSeconds = clampInt(envNumber(env, "ALERTING_SLOW_WINDOW_SECONDS", 60 * 60), fastWindowSeconds, 24 * 60 * 60);

  const sloFastBurnThreshold = envNumber(env, "ALERTING_SLO_FAST_BURN_THRESHOLD", 14.4);
  const sloSlowBurnThreshold = envNumber(env, "ALERTING_SLO_SLOW_BURN_THRESHOLD", 6);
  const sloFastMinRequests = clampInt(envNumber(env, "ALERTING_SLO_FAST_MIN_REQUESTS", 20), 0, 1000000);
  const sloSlowMinRequests = clampInt(envNumber(env, "ALERTING_SLO_SLOW_MIN_REQUESTS", 100), 0, 1000000);

  const spikeRateThreshold5xx = envNumber(env, "ALERTING_5XX_SPIKE_RATE_THRESHOLD", 0.02);
  const spikeMinRequests5xx = clampInt(envNumber(env, "ALERTING_5XX_SPIKE_MIN_REQUESTS", 50), 0, 1000000);
  const spikeMinErrors5xx = clampInt(envNumber(env, "ALERTING_5XX_SPIKE_MIN_ERRORS", 5), 0, 1000000);
  const spikeMultiplier5xx = envNumber(env, "ALERTING_5XX_SPIKE_MULTIPLIER", 3);

  const spikeRateThreshold429 = envNumber(env, "ALERTING_429_SPIKE_RATE_THRESHOLD", 0.01);
  const spikeMinRequests429 = clampInt(envNumber(env, "ALERTING_429_SPIKE_MIN_REQUESTS", 50), 0, 1000000);
  const spikeMinErrors429 = clampInt(envNumber(env, "ALERTING_429_SPIKE_MIN_ERRORS", 10), 0, 1000000);
  const spikeMultiplier429 = envNumber(env, "ALERTING_429_SPIKE_MULTIPLIER", 3);

  const trustscoreQueueThreshold = clampInt(envNumber(env, "ALERTING_TRUSTSCORE_QUEUE_DEPTH_THRESHOLD", 1000), 0, 1000000);
  const watchlistBackfillQueueThreshold = clampInt(envNumber(env, "ALERTING_WATCHLIST_BACKFILL_QUEUE_DEPTH_THRESHOLD", 500), 0, 1000000);
  const watchlistMatchQueueThreshold = clampInt(envNumber(env, "ALERTING_WATCHLIST_MATCH_QUEUE_DEPTH_THRESHOLD", 500), 0, 1000000);
  const approvalsPendingThreshold = clampInt(envNumber(env, "ALERTING_APPROVALS_PENDING_DEPTH_THRESHOLD", 200), 0, 1000000);

  const nowIso = toIso(now);
  const fastFromIso = toIso(new Date(now.getTime() - fastWindowSeconds * 1000));
  const slowFromIso = toIso(new Date(now.getTime() - slowWindowSeconds * 1000));

  const pathLike = "/api/v1/%";

  const sloEventsDefault = ["deal.create", "listing.create", "offer.create"];
  const sloEvents =
    typeof env.ALERTING_SLO_EVENTS === "string" && env.ALERTING_SLO_EVENTS.trim()
      ? env.ALERTING_SLO_EVENTS.split(",").map((p: string) => p.trim()).filter(Boolean)
      : sloEventsDefault;

  const [
    sloTotalFast,
    sloTotalSlow,
    sloSuccessFast,
    sloSuccessSlow,
    apiTotalFast,
    apiTotalSlow,
    api5xxFast,
    api5xxSlow,
    api429Fast,
    api429Slow
  ] = await Promise.all([
    countAuditLogsByEvents({ client, fromIso: fastFromIso, toIso: nowIso, events: sloEvents }),
    countAuditLogsByEvents({ client, fromIso: slowFromIso, toIso: nowIso, events: sloEvents }),
    countAuditLogsByEvents({ client, fromIso: fastFromIso, toIso: nowIso, events: sloEvents, outcomeEq: "SUCCESS" }),
    countAuditLogsByEvents({ client, fromIso: slowFromIso, toIso: nowIso, events: sloEvents, outcomeEq: "SUCCESS" }),
    countAuditLogs({ client, fromIso: fastFromIso, toIso: nowIso, pathLike, requireStatusCode: true }),
    countAuditLogs({ client, fromIso: slowFromIso, toIso: nowIso, pathLike, requireStatusCode: true }),
    countAuditLogs({ client, fromIso: fastFromIso, toIso: nowIso, pathLike, statusGte: "500", statusLt: "600" }),
    countAuditLogs({ client, fromIso: slowFromIso, toIso: nowIso, pathLike, statusGte: "500", statusLt: "600" }),
    countAuditLogs({ client, fromIso: fastFromIso, toIso: nowIso, pathLike, statusEq: "429" }),
    countAuditLogs({ client, fromIso: slowFromIso, toIso: nowIso, pathLike, statusEq: "429" })
  ]);

  const sloBadFast = Math.max(0, sloTotalFast - sloSuccessFast);
  const sloBadSlow = Math.max(0, sloTotalSlow - sloSuccessSlow);
  const sloBadRateFast = ratio(sloBadFast, sloTotalFast);
  const sloBadRateSlow = ratio(sloBadSlow, sloTotalSlow);
  const sloBurnRateFast = computeBurnRate(sloBadRateFast, sloTarget);
  const sloBurnRateSlow = computeBurnRate(sloBadRateSlow, sloTarget);

  const errorRate5xxFast = ratio(api5xxFast, apiTotalFast);
  const errorRate5xxSlow = ratio(api5xxSlow, apiTotalSlow);
  const errorRate429Fast = ratio(api429Fast, apiTotalFast);
  const errorRate429Slow = ratio(api429Slow, apiTotalSlow);

  const alerts: Alert[] = [];

  const sloBurnTriggered =
    sloBurnRateFast !== null &&
    sloBurnRateSlow !== null &&
    sloTotalFast >= sloFastMinRequests &&
    sloTotalSlow >= sloSlowMinRequests &&
    sloBurnRateFast >= sloFastBurnThreshold &&
    sloBurnRateSlow >= sloSlowBurnThreshold;

  if (sloBurnTriggered) {
    alerts.push({
      name: "slo.burn_rate.v1_write_success",
      severity: "critical",
      message: "Write journeys are burning error budget too fast (success rate).",
      meta: {
        slo_target: sloTarget,
        slo_events: sloEvents,
        window_fast_s: fastWindowSeconds,
        window_slow_s: slowWindowSeconds,
        burn_rate_fast: sloBurnRateFast,
        burn_rate_slow: sloBurnRateSlow,
        bad_rate_fast: sloBadRateFast,
        bad_rate_slow: sloBadRateSlow,
        total_fast: sloTotalFast,
        total_slow: sloTotalSlow,
        success_fast: sloSuccessFast,
        success_slow: sloSuccessSlow,
        bad_fast: sloBadFast,
        bad_slow: sloBadSlow
      }
    });
  }

  const spike5xxTriggered = (() => {
    if (errorRate5xxFast === null) return false;
    if (apiTotalFast < spikeMinRequests5xx) return false;
    if (api5xxFast < spikeMinErrors5xx) return false;
    if (errorRate5xxFast < spikeRateThreshold5xx) return false;
    if (errorRate5xxSlow === null || errorRate5xxSlow <= 0) return true;
    return errorRate5xxFast >= errorRate5xxSlow * spikeMultiplier5xx;
  })();

  if (spike5xxTriggered) {
    alerts.push({
      name: "anomaly.5xx_spike.v1",
      severity: "critical",
      message: "Spike in v1 API 5xx responses.",
      meta: {
        window_fast_s: fastWindowSeconds,
        window_slow_s: slowWindowSeconds,
        rate_fast: errorRate5xxFast,
        rate_slow: errorRate5xxSlow,
        total_fast: apiTotalFast,
        errors_5xx_fast: api5xxFast,
        threshold_rate: spikeRateThreshold5xx,
        threshold_min_requests: spikeMinRequests5xx,
        threshold_min_errors: spikeMinErrors5xx,
        threshold_multiplier: spikeMultiplier5xx
      }
    });
  }

  const spike429Triggered = (() => {
    if (errorRate429Fast === null) return false;
    if (apiTotalFast < spikeMinRequests429) return false;
    if (api429Fast < spikeMinErrors429) return false;
    if (errorRate429Fast < spikeRateThreshold429) return false;
    if (errorRate429Slow === null || errorRate429Slow <= 0) return true;
    return errorRate429Fast >= errorRate429Slow * spikeMultiplier429;
  })();

  if (spike429Triggered) {
    alerts.push({
      name: "anomaly.429_spike.v1",
      severity: "warning",
      message: "Spike in v1 API 429 responses (rate limiting).",
      meta: {
        window_fast_s: fastWindowSeconds,
        window_slow_s: slowWindowSeconds,
        rate_fast: errorRate429Fast,
        rate_slow: errorRate429Slow,
        total_fast: apiTotalFast,
        errors_429_fast: api429Fast,
        threshold_rate: spikeRateThreshold429,
        threshold_min_requests: spikeMinRequests429,
        threshold_min_errors: spikeMinErrors429,
        threshold_multiplier: spikeMultiplier429
      }
    });
  }

  const [
    trustscoreQueueDepth,
    watchlistBackfillQueueDepth,
    watchlistMatchQueueDepth,
    trustscoreOldest,
    watchlistBackfillOldest,
    watchlistMatchOldest
  ] = await Promise.all([
    countTableRows({ client, table: "trustscore_recalc_queue", column: "agent_id" }),
    countTableRows({ client, table: "watchlist_backfill_queue", column: "watchlist_id" }),
    countTableRows({ client, table: "watchlist_match_queue", column: "entity_id" }),
    fetchOldestUpdatedAt({ client, table: "trustscore_recalc_queue" }),
    fetchOldestUpdatedAt({ client, table: "watchlist_backfill_queue" }),
    fetchOldestUpdatedAt({ client, table: "watchlist_match_queue" })
  ]);

  const trustscoreOldestAgeSeconds = computeAgeSeconds(now, trustscoreOldest);
  const watchlistBackfillOldestAgeSeconds = computeAgeSeconds(now, watchlistBackfillOldest);
  const watchlistMatchOldestAgeSeconds = computeAgeSeconds(now, watchlistMatchOldest);

  const { count: approvalsPendingDepthRaw, error: approvalsPendingError } = await client
    .from("approvals")
    .select("approval_id", { count: "exact", head: true })
    .eq("state", "PENDING");
  if (approvalsPendingError) {
    mapError(approvalsPendingError);
  }
  const approvalsPendingDepth = typeof approvalsPendingDepthRaw === "number" ? approvalsPendingDepthRaw : 0;
  const approvalsOldest = await fetchOldestApprovalCreatedAt({ client });
  const approvalsOldestAgeSeconds = computeAgeSeconds(now, approvalsOldest);

  if (approvalsPendingDepth > approvalsPendingThreshold) {
    alerts.push({
      name: "queue.depth.approvals_pending",
      severity: "warning",
      message: "approvals backlog (PENDING) is above threshold.",
      meta: {
        depth: approvalsPendingDepth,
        threshold: approvalsPendingThreshold,
        oldest_created_at: approvalsOldest,
        oldest_age_s: approvalsOldestAgeSeconds
      }
    });
  }

  if (trustscoreQueueDepth > trustscoreQueueThreshold) {
    alerts.push({
      name: "queue.depth.trustscore_recalc",
      severity: "warning",
      message: "trustscore_recalc_queue depth is above threshold.",
      meta: {
        depth: trustscoreQueueDepth,
        threshold: trustscoreQueueThreshold,
        oldest_updated_at: trustscoreOldest,
        oldest_age_s: trustscoreOldestAgeSeconds
      }
    });
  }

  if (watchlistBackfillQueueDepth > watchlistBackfillQueueThreshold) {
    alerts.push({
      name: "queue.depth.watchlist_backfill",
      severity: "warning",
      message: "watchlist_backfill_queue depth is above threshold.",
      meta: {
        depth: watchlistBackfillQueueDepth,
        threshold: watchlistBackfillQueueThreshold,
        oldest_updated_at: watchlistBackfillOldest,
        oldest_age_s: watchlistBackfillOldestAgeSeconds
      }
    });
  }

  if (watchlistMatchQueueDepth > watchlistMatchQueueThreshold) {
    alerts.push({
      name: "queue.depth.watchlist_match",
      severity: "warning",
      message: "watchlist_match_queue depth is above threshold.",
      meta: {
        depth: watchlistMatchQueueDepth,
        threshold: watchlistMatchQueueThreshold,
        oldest_updated_at: watchlistMatchOldest,
        oldest_age_s: watchlistMatchOldestAgeSeconds
      }
    });
  }

  // Emit structured logs only for triggered alerts so log-based alerting can subscribe.
  for (const alert of alerts) {
    console.warn("observability.alert_triggered", {
      alert: alert.name,
      severity: alert.severity,
      message: alert.message,
      ...(alert.meta ? { meta: alert.meta } : {})
    });
  }

  return {
    ok: true,
    generated_at: nowIso,
    inputs: {
      slo_target: sloTarget,
      slo_events: sloEvents,
      path_like: pathLike,
      fast_window_s: fastWindowSeconds,
      slow_window_s: slowWindowSeconds
    },
    slo: {
      name: "v1_write_journeys_success_rate",
      target: sloTarget,
      burn_rate_thresholds: {
        fast: sloFastBurnThreshold,
        slow: sloSlowBurnThreshold
      },
      windows: {
        fast: {
          from: fastFromIso,
          to: nowIso,
          total: sloTotalFast,
          success: sloSuccessFast,
          bad: sloBadFast,
          bad_rate: sloBadRateFast,
          burn_rate: sloBurnRateFast
        },
        slow: {
          from: slowFromIso,
          to: nowIso,
          total: sloTotalSlow,
          success: sloSuccessSlow,
          bad: sloBadSlow,
          bad_rate: sloBadRateSlow,
          burn_rate: sloBurnRateSlow
        }
      },
      triggered: sloBurnTriggered
    },
    anomalies: {
      "5xx_spike": {
        triggered: spike5xxTriggered,
        thresholds: {
          rate: spikeRateThreshold5xx,
          min_requests: spikeMinRequests5xx,
          min_errors: spikeMinErrors5xx,
          multiplier_vs_slow: spikeMultiplier5xx
        },
        fast: { total: apiTotalFast, errors_5xx: api5xxFast, rate: errorRate5xxFast },
        slow: { total: apiTotalSlow, errors_5xx: api5xxSlow, rate: errorRate5xxSlow }
      },
      "429_spike": {
        triggered: spike429Triggered,
        thresholds: {
          rate: spikeRateThreshold429,
          min_requests: spikeMinRequests429,
          min_errors: spikeMinErrors429,
          multiplier_vs_slow: spikeMultiplier429
        },
        fast: { total: apiTotalFast, errors_429: api429Fast, rate: errorRate429Fast },
        slow: { total: apiTotalSlow, errors_429: api429Slow, rate: errorRate429Slow }
      }
    },
    queues: {
      approvals_pending: {
        depth: approvalsPendingDepth,
        threshold: approvalsPendingThreshold,
        oldest_created_at: approvalsOldest,
        oldest_age_s: approvalsOldestAgeSeconds,
        triggered: approvalsPendingDepth > approvalsPendingThreshold
      },
      trustscore_recalc_queue: {
        depth: trustscoreQueueDepth,
        threshold: trustscoreQueueThreshold,
        oldest_updated_at: trustscoreOldest,
        oldest_age_s: trustscoreOldestAgeSeconds,
        triggered: trustscoreQueueDepth > trustscoreQueueThreshold
      },
      watchlist_backfill_queue: {
        depth: watchlistBackfillQueueDepth,
        threshold: watchlistBackfillQueueThreshold,
        oldest_updated_at: watchlistBackfillOldest,
        oldest_age_s: watchlistBackfillOldestAgeSeconds,
        triggered: watchlistBackfillQueueDepth > watchlistBackfillQueueThreshold
      },
      watchlist_match_queue: {
        depth: watchlistMatchQueueDepth,
        threshold: watchlistMatchQueueThreshold,
        oldest_updated_at: watchlistMatchOldest,
        oldest_age_s: watchlistMatchOldestAgeSeconds,
        triggered: watchlistMatchQueueDepth > watchlistMatchQueueThreshold
      }
    },
    alerts
  };
}
