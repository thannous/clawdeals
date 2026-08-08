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

type AcquisitionResponse = {
  window: { days: number; from: string; to: string };
  sample: { acquisitions: number; truncated: boolean; max_rows: number };
  funnel: FunnelRow[];
  by_market: MarketRow[];
  by_source: Array<{ source: string; landing_views: number }>;
  by_cta: Array<{ cta_location: string; clicks: number }>;
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
        landing_view → d7_retained, by market, source, and CTA location
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
              Landing views by source
            </h2>
            {data.by_source.length === 0 ? (
              <p className="text-xs font-mono text-subtle">No landing views in this window.</p>
            ) : (
              <ConsoleTable
                columns={[
                  { key: "source", label: "Source" },
                  { key: "landing_views", label: "Landing views" }
                ]}
                rows={data.by_source}
                getRowKey={(row: any) => row.source}
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
                  { key: "clicks", label: "Clicks" }
                ]}
                rows={data.by_cta}
                getRowKey={(row: any) => row.cta_location}
              />
            )}
          </section>
        </div>
      ) : null}
      </main>
    </div>
  );
}
