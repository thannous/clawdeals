import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConsoleTable from "../shared/ConsoleTable";
import SkeletonTable from "../shared/SkeletonTable";
import ErrorState from "../shared/ErrorState";

type SliByEvent = {
  event: string;
  total: number;
  success: number;
  success_rate: number | null;
};

type OpsResponse = {
  window: { from: string; to: string; minutes: number };
  sample: { audit_rows: number; truncated: boolean; max_rows: number };
  http: {
    total: number;
    status_2xx: number;
    status_3xx: number;
    status_4xx: number;
    status_429: number;
    status_5xx: number;
  };
  latency: {
    by_route_group: Array<{
      route_group: string;
      request_count: number;
      latency_samples: number;
      p50_ms: number | null;
      p90_ms: number | null;
      p95_ms: number | null;
      p99_ms: number | null;
    }>;
  };
  errors: {
    by_route_group: Array<{
      route_group: string;
      request_count: number;
      status_4xx: number;
      status_429: number;
      status_5xx: number;
    }>;
  };
  rate_limit: {
    status_429: number;
    rate_429: number;
    top_agents: Array<{ agent_id: string; count: number }>;
    unknown_agent_429: number;
  };
  queue: {
    approvals_pending: number;
    jobs_pending: number;
    job_queues: Array<{ name: string; depth: number }>;
  };
  sli?: {
    write_journeys: {
      events: string[];
      by_event: SliByEvent[];
      aggregate: {
        total: number;
        success: number;
        success_rate: number | null;
        slo_target: number;
        error_budget_remaining_pct: number;
        budget_state: "GREEN" | "YELLOW" | "RED" | "EXHAUSTED";
      };
      burn_rate: {
        fast: { window_s: number; value: number | null };
        slow: { window_s: number; value: number | null };
      };
    };
  };
  approvals_detail?: {
    pending_count: number;
    oldest_pending_age_s: number | null;
    oldest_pending_created_at: string | null;
    resolved_window: {
      count: number;
      p50_resolve_s: number | null;
      p95_resolve_s: number | null;
    };
  };
  slo_latency_targets?: Record<string, number>;
};

const WINDOW_OPTIONS = [
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 }
];

const BUDGET_STATE_STYLES: Record<string, string> = {
  GREEN: "border-secondary/40 text-secondary bg-secondary/10",
  YELLOW: "border-yellow-400/40 text-yellow-400 bg-yellow-400/10",
  RED: "border-red-400/40 text-red-400 bg-red-400/10",
  EXHAUSTED: "border-red-500/60 text-red-500 bg-red-500/20"
};

function formatPct(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "\u2014";
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}

function formatMs(value: number | null) {
  if (value === null || value === undefined) return "\u2014";
  if (!Number.isFinite(value)) return "\u2014";
  return `${Math.round(value)}ms`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "\u2014";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatBurnRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "\u2014";
  return value.toFixed(1) + "x";
}

export function getP95SloTargetForRoute(routeGroup: string, sloLatencyTargets: Record<string, number>) {
  const target = sloLatencyTargets?.[routeGroup];
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) {
    return null;
  }
  return target;
}

function formatIsoShort(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}

function MetricCard({ label, value, subtle }: { label: string; value: string; subtle?: string }) {
  return (
    <div className="bg-surface border border-border rounded clip-corner p-4">
      <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-subtle">{label}</div>
      <div className="mt-2 text-2xl font-mono font-bold text-text">{value}</div>
      {subtle ? <div className="mt-1 text-xs font-mono text-muted">{subtle}</div> : null}
    </div>
  );
}

function BudgetStateBadge({ state }: { state: string }) {
  const classes = BUDGET_STATE_STYLES[state] || BUDGET_STATE_STYLES.GREEN;
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-mono font-bold uppercase border rounded ${classes}`}>
      {state}
    </span>
  );
}

function SloPanel({ sli }: { sli: OpsResponse["sli"] }) {
  if (!sli) return null;
  const { write_journeys } = sli;
  const { aggregate, by_event, burn_rate } = write_journeys;

  return (
    <div data-testid="slo-panel" className="bg-surface border border-border rounded clip-corner p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono font-bold text-text uppercase tracking-wider">SLO Status</h2>
        <BudgetStateBadge state={aggregate.budget_state} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] font-mono text-subtle uppercase">Success Rate</div>
          <div className="text-lg font-mono font-bold text-text">{formatPct(aggregate.success_rate)}</div>
          <div className="text-[10px] font-mono text-muted">target {formatPct(aggregate.slo_target)}</div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-subtle uppercase">Error Budget</div>
          <div className="text-lg font-mono font-bold text-text">{aggregate.error_budget_remaining_pct}%</div>
          <div className="text-[10px] font-mono text-muted">remaining</div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-subtle uppercase">Burn Rate (5m)</div>
          <div className={`text-lg font-mono font-bold ${burn_rate.fast.value !== null && burn_rate.fast.value >= 6 ? "text-red-400" : "text-text"}`}>
            {formatBurnRate(burn_rate.fast.value)}
          </div>
          <div className="text-[10px] font-mono text-muted">fast window</div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-subtle uppercase">Burn Rate (1h)</div>
          <div className={`text-lg font-mono font-bold ${burn_rate.slow.value !== null && burn_rate.slow.value >= 3 ? "text-yellow-400" : "text-text"}`}>
            {formatBurnRate(burn_rate.slow.value)}
          </div>
          <div className="text-[10px] font-mono text-muted">slow window</div>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <div className="text-[10px] font-mono text-subtle uppercase mb-2">Success Rate by Journey</div>
        <div className="space-y-1.5">
          {by_event.map((evt) => (
            <div key={evt.event} className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted">{evt.event}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted">{evt.total} req</span>
                <span className={`text-xs font-mono font-bold ${
                  evt.success_rate !== null && evt.success_rate < (aggregate.slo_target ?? 0.99) ? "text-red-400" : "text-secondary"
                }`}>
                  {formatPct(evt.success_rate)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApprovalsDetailPanel({ detail }: { detail: OpsResponse["approvals_detail"] }) {
  if (!detail) return null;

  return (
    <div data-testid="approvals-detail-panel" className="bg-surface border border-border rounded clip-corner p-4 space-y-4">
      <h2 className="text-sm font-mono font-bold text-text uppercase tracking-wider">Approvals Detail</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] font-mono text-subtle uppercase">Pending</div>
          <div className={`text-lg font-mono font-bold ${detail.pending_count > 0 ? "text-yellow-400" : "text-text"}`}>
            {detail.pending_count}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-subtle uppercase">Oldest Pending</div>
          <div className={`text-lg font-mono font-bold ${
            detail.oldest_pending_age_s !== null && detail.oldest_pending_age_s > 4 * 3600 ? "text-red-400" : "text-text"
          }`}>
            {formatDuration(detail.oldest_pending_age_s)}
          </div>
          <div className="text-[10px] font-mono text-muted">SLO: &lt; 4h</div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-subtle uppercase">Resolve p50</div>
          <div className="text-lg font-mono font-bold text-text">
            {formatDuration(detail.resolved_window.p50_resolve_s)}
          </div>
          <div className="text-[10px] font-mono text-muted">{detail.resolved_window.count} resolved</div>
        </div>
        <div>
          <div className="text-[10px] font-mono text-subtle uppercase">Resolve p95</div>
          <div className={`text-lg font-mono font-bold ${
            detail.resolved_window.p95_resolve_s !== null && detail.resolved_window.p95_resolve_s > 4 * 3600 ? "text-red-400" : "text-text"
          }`}>
            {formatDuration(detail.resolved_window.p95_resolve_s)}
          </div>
          <div className="text-[10px] font-mono text-muted">SLO: &lt; 4h</div>
        </div>
      </div>
    </div>
  );
}

export default function OpsPage() {
  const [windowMinutes, setWindowMinutes] = useState(60);

  const [data, setData] = useState<OpsResponse | null>(null);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    try {
      const sp = new URLSearchParams();
      sp.set("window_minutes", String(windowMinutes));
      const resp = await fetch(`/api/console/ops?${sp}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as OpsResponse;
      setData(json);
      setLastUpdatedAt(new Date().toISOString());
      setFetchState("done");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message || String(err));
      setFetchState("error");
    }
  }, [windowMinutes]);

  useEffect(() => {
    load();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  const latencyRows = data?.latency?.by_route_group || [];
  const errorRows = data?.errors?.by_route_group || [];
  const jobQueues = data?.queue?.job_queues || [];
  const sloLatencyTargets = data?.slo_latency_targets || {};

  const topAgentsRows = useMemo(() => {
    const total429 = data?.rate_limit?.status_429 || 0;
    const topAgents = data?.rate_limit?.top_agents || [];
    return topAgents.map((row) => ({
      ...row,
      share: total429 > 0 ? row.count / total429 : 0
    }));
  }, [data?.rate_limit?.top_agents, data?.rate_limit?.status_429]);

  return (
    <div data-testid="ops-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
              <span className="text-primary">/ </span>OPS
            </h1>
            {data?.window ? (
              <p className="text-xs font-mono text-muted mt-0.5">
                Window: {data.window.minutes}m ({formatIsoShort(data.window.from)} &rarr; {formatIsoShort(data.window.to)})
              </p>
            ) : (
              <p className="text-xs font-mono text-muted mt-0.5">Window: {windowMinutes}m</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(Number.parseInt(e.target.value, 10))}
              className="px-3 py-2 text-xs font-mono border border-border bg-bg/50 text-text rounded"
              aria-label="Window"
            >
              {WINDOW_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={opt.minutes}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={load}
              disabled={fetchState === "loading"}
              className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 disabled:opacity-50 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {fetchState === "error" && <ErrorState message={error || "Failed to load ops dashboard"} onRetry={load} />}

        {fetchState === "loading" && !data && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`sk-${i}`} className="bg-surface border border-border rounded clip-corner p-4 animate-pulse">
                <div className="h-3 w-24 bg-surface-alt rounded" />
                <div className="mt-3 h-7 w-28 bg-surface-alt rounded" />
                <div className="mt-2 h-3 w-40 bg-surface-alt rounded" />
              </div>
            ))}
          </div>
        )}

        {data && (
          <>
            {/* SLO Status Panel */}
            <SloPanel sli={data.sli} />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard
                label="Requests"
                value={String(data.http.total)}
                subtle={data.sample.truncated ? `Sampled ${data.sample.audit_rows} (truncated @ ${data.sample.max_rows})` : `Sampled ${data.sample.audit_rows}`}
              />
              <MetricCard
                label="4xx / 5xx"
                value={`${data.http.status_4xx} / ${data.http.status_5xx}`}
                subtle={`2xx ${data.http.status_2xx} \u00B7 3xx ${data.http.status_3xx}`}
              />
              <MetricCard
                label="429 Rate"
                value={formatPct(data.rate_limit.rate_429)}
                subtle={`${data.rate_limit.status_429} (unknown agent: ${data.rate_limit.unknown_agent_429})`}
              />
              <MetricCard
                label="Queue Depth"
                value={`${data.queue.approvals_pending} + ${data.queue.jobs_pending}`}
                subtle={`Approvals + jobs`}
              />
            </div>

            <div className="flex items-center justify-between">
              <h2 className="text-sm font-mono font-bold text-text uppercase tracking-wider">Latency Percentiles by Route Group</h2>
              <span className="text-xs font-mono text-muted">
                {lastUpdatedAt ? `Updated ${formatIsoShort(lastUpdatedAt)}` : null}
              </span>
            </div>

            {fetchState === "loading" && <SkeletonTable columns={7} rows={10} />}

            {fetchState !== "loading" && (
              <ConsoleTable
                columns={[
                  { key: "route_group", label: "route_group", className: "w-[360px]" },
                  { key: "request_count", label: "req" },
                  { key: "latency_samples", label: "n" },
                  { key: "p50_ms", label: "p50" },
                  { key: "p90_ms", label: "p90" },
                  { key: "p95_ms", label: "p95" },
                  { key: "p99_ms", label: "p99" }
                ]}
                rows={latencyRows}
                getRowKey={(row: any) => row.route_group}
                renderCell={(row: any, col: any) => {
                  if (col.key === "p50_ms" || col.key === "p90_ms" || col.key === "p95_ms" || col.key === "p99_ms") {
                    const val = row[col.key];
                    const text = formatMs(val);
                    // Color-code p95 cells that exceed the SLO latency target.
                    const routeTarget = getP95SloTargetForRoute(row.route_group, sloLatencyTargets);
                    if (col.key === "p95_ms" && routeTarget !== null && typeof val === "number" && val > routeTarget) {
                      return <span className="text-red-400 font-bold">{text}</span>;
                    }
                    return text;
                  }
                  return row[col.key];
                }}
              />
            )}

            <h2 className="text-sm font-mono font-bold text-text uppercase tracking-wider">4xx / 5xx Breakdown</h2>
            <ConsoleTable
              columns={[
                { key: "route_group", label: "route_group", className: "w-[360px]" },
                { key: "request_count", label: "req" },
                { key: "status_4xx", label: "4xx" },
                { key: "status_429", label: "429" },
                { key: "status_5xx", label: "5xx" }
              ]}
              rows={errorRows}
              getRowKey={(row: any) => row.route_group}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h2 className="text-sm font-mono font-bold text-text uppercase tracking-wider">Top Agents (429)</h2>
                <ConsoleTable
                  columns={[
                    { key: "agent_id", label: "agent_id", className: "w-[360px]" },
                    { key: "count", label: "429" },
                    { key: "share", label: "share" }
                  ]}
                  rows={topAgentsRows}
                  getRowKey={(row: any) => row.agent_id}
                  renderCell={(row: any, col: any) => {
                    if (col.key === "share") return formatPct(row.share);
                    return row[col.key];
                  }}
                />
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-mono font-bold text-text uppercase tracking-wider">Queue Depth</h2>
                <div className="bg-surface border border-border rounded clip-corner p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted">Approvals (PENDING)</span>
                    <span className="text-xs font-mono font-bold text-text">{data.queue.approvals_pending}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-muted">Jobs (total)</span>
                    <span className="text-xs font-mono font-bold text-text">{data.queue.jobs_pending}</span>
                  </div>
                </div>

                <ConsoleTable
                  columns={[
                    { key: "name", label: "queue" },
                    { key: "depth", label: "depth" }
                  ]}
                  rows={jobQueues}
                  getRowKey={(row: any) => row.name}
                />
              </div>
            </div>

            {/* Approvals Detail Panel */}
            <ApprovalsDetailPanel detail={data.approvals_detail} />
          </>
        )}
      </main>
    </div>
  );
}
