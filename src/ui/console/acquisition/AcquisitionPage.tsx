import { useCallback, useEffect, useRef, useState } from "react";
import ConsoleTable from "../shared/ConsoleTable";
import SkeletonTable from "../shared/SkeletonTable";
import ErrorState from "../shared/ErrorState";
import PageHeader from "../../shared/PageHeader";

type FunnelRow = {
  step: string;
  count: number;
  pct_of_landing: number | null;
};

type MarketRow = Record<string, any> & { market_code: string };

type ChannelRow = {
  channel: string;
  source: string;
  medium: string;
  landing_views: number;
  agent_connected: number;
  first_match: number;
};

type RevenueRow = {
  currency: string;
  released_escrows: number;
  attributed_released_escrows?: number;
  channel?: string;
  source?: string;
  medium?: string;
  gross_volume_minor: string;
  platform_revenue_minor: string;
};

type AcquisitionResponse = {
  window: { days: number; from: string; to: string };
  sample: { acquisitions: number; truncated: boolean; max_rows: number };
  funnel: FunnelRow[];
  by_market: MarketRow[];
  by_source: Array<{ source: string; landing_views: number }>;
  by_channel: ChannelRow[];
  by_cta: Array<{ cta_location: string; interaction_type: string; clicks: number }>;
  attribution: {
    id: string;
    label: string;
    rule: string;
    conversion_owner: string;
    revenue_event: string;
    gross_value: string;
    revenue: string;
  };
  revenue: {
    source_of_truth: string;
    sample: {
      released_escrows: number;
      attributed_released_escrows: number;
      unattributed_released_escrows: number;
      truncated: boolean;
      max_rows: number;
    };
    by_currency: RevenueRow[];
    by_channel_currency: RevenueRow[];
  };
  reconciliation: {
    browser_events: { landing_views: number; connect_cta_clicks: number };
    backend_activations: {
      activation_started: number;
      agent_connected: number;
      watchlist_created: number;
      first_match: number;
      d7_retained: number;
    };
    backend_revenue: {
      released_escrows: number;
      attributed_released_escrows: number;
      unattributed_released_escrows: number;
    };
  };
};

const WINDOW_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 }
];

const STEP_LABELS: Record<string, string> = {
  landing_view: "Landing view",
  organic_entry: "Organic entry",
  connect_cta_clicked: "Connect CTA clicked",
  activation_started: "Activation started",
  agent_connected: "Agent connected",
  watchlist_created: "Watchlist created",
  first_match: "First match",
  d7_retained: "D7 retained"
};

export default function AcquisitionPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AcquisitionResponse | null>(null);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    try {
      const sp = new URLSearchParams();
      sp.set("days", String(days));
      const resp = await fetch(`/api/console/acquisition?${sp}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as AcquisitionResponse;
      setData(json);
      setFetchState("done");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "Failed to load acquisition dashboard");
      setFetchState("error");
    }
  }, [days]);

  useEffect(() => {
    load();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  const marketColumns = [
    { key: "market_code", label: "Market" },
    { key: "landing_view", label: "Landing" },
    { key: "connect_cta_clicked", label: "CTA" },
    { key: "activation_started", label: "Started" },
    { key: "agent_connected", label: "Connected" },
    { key: "watchlist_created", label: "Watchlist" },
    { key: "first_match", label: "Match" },
    { key: "d7_retained", label: "D7" }
  ];

  return (
    <div className="min-h-screen bg-bg text-text">
      <PageHeader title="ACQUISITION" />

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
      <p className="text-xs font-mono text-subtle">
        First-party touch → activation → released escrow, with revenue separated from gross volume
      </p>

      <div className="flex items-center gap-2 mb-6">
        {WINDOW_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            type="button"
            onClick={() => setDays(opt.days)}
            className={`text-xs font-mono px-3 py-1.5 border transition-colors ${
              days === opt.days
                ? "border-primary text-primary bg-primary/10"
                : "border-border text-subtle hover:text-text"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          onClick={load}
          className="text-xs font-mono px-3 py-1.5 border border-border text-subtle hover:text-text transition-colors ml-auto"
        >
          Refresh
        </button>
      </div>

      {fetchState === "loading" && !data ? <SkeletonTable rows={7} /> : null}
      {fetchState === "error" ? <ErrorState message={error || "Failed to load"} onRetry={load} /> : null}

      {data ? (
        <div className="space-y-8">
          <section className="border border-border bg-surface/40 p-4 space-y-2">
            <h2 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider">
              Attribution contract — {data.attribution.label}
            </h2>
            <p className="text-xs font-mono text-text">{data.attribution.rule}.</p>
            <p className="text-xs font-mono text-subtle">
              One revenue conversion per released escrow, owned by the buyer touch. Gross volume is not revenue;
              platform revenue is the released platform fee. This model is deterministic, not causal.
            </p>
            <p className="text-xs font-mono text-subtle">
              Instrumentation in code, deployment, persisted events, measured conversion, and business outcome are
              separate states.
            </p>
          </section>

          <section>
            <h2 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-2">
              Funnel — {data.sample.acquisitions} acquisitions in {data.window.days}d
              {data.sample.truncated ? " (sample truncated)" : ""}
            </h2>
            <ConsoleTable
              columns={[
                { key: "step", label: "Step", cell: (row: FunnelRow) => STEP_LABELS[row.step] || row.step },
                { key: "count", label: "Count" },
                {
                  key: "pct_of_landing",
                  label: "% of landing",
                  cell: (row: FunnelRow) => (row.pct_of_landing === null ? "—" : `${row.pct_of_landing}%`)
                }
              ]}
              rows={data.funnel}
              getRowKey={(row: FunnelRow) => row.step}
            />
          </section>

          <section>
            <h2 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-2">By market</h2>
            {data.by_market.length === 0 ? (
              <p className="text-xs font-mono text-subtle">No acquisitions in this window.</p>
            ) : (
              <ConsoleTable
                columns={marketColumns}
                rows={data.by_market}
                getRowKey={(row: MarketRow) => row.market_code}
              />
            )}
          </section>

          <section>
            <h2 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-2">
              Acquisition and activation by channel
            </h2>
            {data.by_channel.length === 0 ? (
              <p className="text-xs font-mono text-subtle">No attributed landing views in this window.</p>
            ) : (
              <ConsoleTable
                columns={[
                  { key: "channel", label: "Channel" },
                  { key: "source", label: "Source" },
                  { key: "medium", label: "Medium" },
                  { key: "landing_views", label: "Landing" },
                  { key: "agent_connected", label: "Connected" },
                  { key: "first_match", label: "First match" }
                ]}
                rows={data.by_channel}
                getRowKey={(row: ChannelRow) => `${row.channel}:${row.source}:${row.medium}`}
              />
            )}
          </section>

          <section>
            <h2 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-2">
              Connect CTA clicks by location
            </h2>
            {data.by_cta.length === 0 ? (
              <p className="text-xs font-mono text-subtle">No CTA clicks in this window.</p>
            ) : (
              <ConsoleTable
                columns={[
                  { key: "cta_location", label: "CTA location" },
                  { key: "interaction_type", label: "Interaction" },
                  { key: "clicks", label: "Clicks" }
                ]}
                rows={data.by_cta}
                getRowKey={(row: any) => `${row.cta_location}:${row.interaction_type}`}
              />
            )}
          </section>

          <section>
            <h2 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-2">
              Released escrow value by currency
            </h2>
            <p className="text-xs font-mono text-subtle mb-2">
              {data.revenue.sample.attributed_released_escrows}/{data.revenue.sample.released_escrows} released escrows
              attributed; {data.revenue.sample.unattributed_released_escrows} unattributed
              {data.revenue.sample.truncated ? " (sample truncated)" : ""}.
            </p>
            {data.revenue.by_currency.length === 0 ? (
              <p className="text-xs font-mono text-subtle">No released escrow in this window.</p>
            ) : (
              <ConsoleTable
                columns={[
                  { key: "currency", label: "Currency" },
                  { key: "released_escrows", label: "Released" },
                  { key: "attributed_released_escrows", label: "Attributed" },
                  { key: "gross_volume_minor", label: "Gross volume (minor)" },
                  { key: "platform_revenue_minor", label: "Platform revenue (minor)" }
                ]}
                rows={data.revenue.by_currency}
                getRowKey={(row: RevenueRow) => row.currency}
              />
            )}
          </section>

          <section>
            <h2 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-2">
              Released escrow value by attributed channel and currency
            </h2>
            {data.revenue.by_channel_currency.length === 0 ? (
              <p className="text-xs font-mono text-subtle">No released escrow in this window.</p>
            ) : (
              <ConsoleTable
                columns={[
                  { key: "channel", label: "Channel" },
                  { key: "source", label: "Source" },
                  { key: "medium", label: "Medium" },
                  { key: "currency", label: "Currency" },
                  { key: "released_escrows", label: "Released" },
                  { key: "gross_volume_minor", label: "Gross volume (minor)" },
                  { key: "platform_revenue_minor", label: "Platform revenue (minor)" }
                ]}
                rows={data.revenue.by_channel_currency}
                getRowKey={(row: RevenueRow) => `${row.channel}:${row.source}:${row.medium}:${row.currency}`}
              />
            )}
          </section>

          <section>
            <h2 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-2">
              Measurement reconciliation
            </h2>
            <ConsoleTable
              columns={[
                { key: "layer", label: "Layer" },
                { key: "metric", label: "Metric" },
                { key: "count", label: "Count" },
                { key: "source", label: "Source of truth" }
              ]}
              rows={[
                {
                  layer: "Browser instrumentation",
                  metric: "landing_view",
                  count: data.reconciliation.browser_events.landing_views,
                  source: "Persisted acquisition event"
                },
                {
                  layer: "Browser instrumentation",
                  metric: "connect_cta_clicked",
                  count: data.reconciliation.browser_events.connect_cta_clicks,
                  source: "Persisted acquisition event"
                },
                {
                  layer: "Backend activation",
                  metric: "activation_started",
                  count: data.reconciliation.backend_activations.activation_started,
                  source: "Agent or connect session created"
                },
                {
                  layer: "Backend activation",
                  metric: "agent_connected",
                  count: data.reconciliation.backend_activations.agent_connected,
                  source: "Authenticated API use or delivered connect session"
                },
                {
                  layer: "Backend activation",
                  metric: "first_match",
                  count: data.reconciliation.backend_activations.first_match,
                  source: "Product milestone"
                },
                {
                  layer: "Backend revenue conversion",
                  metric: "escrow_released",
                  count: data.reconciliation.backend_revenue.released_escrows,
                  source: "Escrow state RELEASED"
                },
                {
                  layer: "Attributed revenue conversion",
                  metric: "escrow_released + acq_id",
                  count: data.reconciliation.backend_revenue.attributed_released_escrows,
                  source: data.attribution.id
                }
              ]}
              getRowKey={(row: any) => `${row.layer}:${row.metric}`}
            />
          </section>
        </div>
      ) : null}
      </main>
    </div>
  );
}
