import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export const ACQUISITION_FUNNEL_STEPS = [
  "landing_view",
  "organic_entry",
  "connect_cta_clicked",
  "agent_connected",
  "watchlist_created",
  "first_match",
  "d7_retained"
] as const;

export type AcquisitionFunnelStep = (typeof ACQUISITION_FUNNEL_STEPS)[number];

export const CONSOLE_ACQUISITION_DEFAULT_WINDOW_DAYS = 30;
export const CONSOLE_ACQUISITION_WINDOW_DAYS_RANGE = { min: 1, max: 365 };

// Pre-launch volumes are small; aggregate in memory over a capped sample and
// report truncation instead of silently under-counting.
const MAX_ROWS = 10000;

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function emptyStepCounts(): Record<AcquisitionFunnelStep, number> {
  return Object.fromEntries(ACQUISITION_FUNNEL_STEPS.map((step) => [step, 0])) as Record<AcquisitionFunnelStep, number>;
}

// ISO 8601 UTC timestamps compare correctly as strings.
function earliestMilestone(row: any): string | null {
  let min: string | null = null;
  for (const step of ACQUISITION_FUNNEL_STEPS) {
    const value = row?.[`${step}_at`];
    if (typeof value === "string" && value && (!min || value < min)) min = value;
  }
  return min;
}

export async function getConsoleAcquisitionDashboard({
  windowDays = CONSOLE_ACQUISITION_DEFAULT_WINDOW_DAYS,
  now = new Date(),
  client
}: {
  windowDays?: number;
  now?: Date;
  client?: any;
} = {}) {
  const supabase = client || getSupabaseServiceClient();
  const sinceIso = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: summaryRows, error: summaryError } = await supabase
    .from("acquisition_funnel_summary")
    .select("*")
    .limit(MAX_ROWS);
  if (summaryError) mapError(summaryError);

  const { data: ctaRows, error: ctaError } = await supabase
    .from("acquisition_funnel_events")
    .select("cta_location")
    .eq("event_name", "connect_cta_clicked")
    .gte("occurred_at", sinceIso)
    .limit(MAX_ROWS);
  if (ctaError) mapError(ctaError);

  const allRows = Array.isArray(summaryRows) ? summaryRows : [];
  const rows = allRows.filter((row) => {
    const first = earliestMilestone(row);
    return first !== null && first >= sinceIso;
  });

  const steps = emptyStepCounts();
  const byMarket = new Map<string, Record<AcquisitionFunnelStep, number>>();
  const bySource = new Map<string, number>();

  for (const row of rows) {
    const market = typeof row.market_code === "string" && row.market_code ? row.market_code : "unknown";
    if (!byMarket.has(market)) byMarket.set(market, emptyStepCounts());
    const marketCounts = byMarket.get(market)!;

    for (const step of ACQUISITION_FUNNEL_STEPS) {
      if (row[`${step}_at`]) {
        steps[step] += 1;
        marketCounts[step] += 1;
      }
    }

    if (row.landing_view_at) {
      const source = typeof row.source === "string" && row.source ? row.source : "(direct)";
      bySource.set(source, (bySource.get(source) || 0) + 1);
    }
  }

  const byCta = new Map<string, number>();
  for (const row of Array.isArray(ctaRows) ? ctaRows : []) {
    const key = typeof row?.cta_location === "string" && row.cta_location ? row.cta_location : "other";
    byCta.set(key, (byCta.get(key) || 0) + 1);
  }

  const landingTotal = steps.landing_view;

  return {
    window: { days: windowDays, from: sinceIso, to: now.toISOString() },
    sample: {
      acquisitions: rows.length,
      truncated: allRows.length >= MAX_ROWS,
      max_rows: MAX_ROWS
    },
    funnel: ACQUISITION_FUNNEL_STEPS.map((step) => ({
      step,
      count: steps[step],
      pct_of_landing: landingTotal > 0 ? Math.round((steps[step] / landingTotal) * 1000) / 10 : null
    })),
    by_market: Array.from(byMarket.entries())
      .map(([market_code, counts]) => ({ market_code, ...counts }))
      .sort((a, b) => b.landing_view - a.landing_view),
    by_source: Array.from(bySource.entries())
      .map(([source, landing_views]) => ({ source, landing_views }))
      .sort((a, b) => b.landing_views - a.landing_views),
    by_cta: Array.from(byCta.entries())
      .map(([cta_location, clicks]) => ({ cta_location, clicks }))
      .sort((a, b) => b.clicks - a.clicks)
  };
}
