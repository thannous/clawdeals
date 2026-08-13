import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

export const ACQUISITION_FUNNEL_STEPS = [
  "landing_view",
  "organic_entry",
  "connect_cta_clicked",
  "activation_started",
  "agent_connected",
  "watchlist_created",
  "first_match",
  "d7_retained"
] as const;

export type AcquisitionFunnelStep = (typeof ACQUISITION_FUNNEL_STEPS)[number];

export const CONSOLE_ACQUISITION_DEFAULT_WINDOW_DAYS = 30;
export const CONSOLE_ACQUISITION_WINDOW_DAYS_RANGE = { min: 1, max: 365 };

export const ACQUISITION_ATTRIBUTION_MODEL = {
  id: "buyer_last_touch_v1",
  label: "Buyer last touch",
  rule: "Most recent attributed backend activation before escrow release",
  conversion_owner: "buyer_agent",
  revenue_event: "escrow status RELEASED",
  gross_value: "escrow amount_gross_minor",
  revenue: "escrow amount_platform_fee_minor"
} as const;

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

function toMinorUnits(value: unknown): bigint {
  if (typeof value === "bigint") return value >= 0n ? value : 0n;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
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
    .select("cta_location,interaction_type")
    .eq("event_name", "connect_cta_clicked")
    .gte("occurred_at", sinceIso)
    .limit(MAX_ROWS);
  if (ctaError) mapError(ctaError);

  const { data: revenueRows, error: revenueError } = await supabase
    .from("acquisition_revenue_attribution_summary")
    .select("*")
    .gte("occurred_at", sinceIso)
    .limit(MAX_ROWS);
  if (revenueError) mapError(revenueError);

  const allRows = Array.isArray(summaryRows) ? summaryRows : [];
  const rows = allRows.filter((row) => {
    const first = earliestMilestone(row);
    return first !== null && first >= sinceIso;
  });

  const steps = emptyStepCounts();
  const byMarket = new Map<string, Record<AcquisitionFunnelStep, number>>();
  const bySource = new Map<string, number>();
  const byChannel = new Map<string, {
    channel: string;
    source: string;
    medium: string;
    landing_views: number;
    agent_connected: number;
    first_match: number;
  }>();

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

      const medium = typeof row.medium === "string" && row.medium ? row.medium : "none";
      const channel = typeof row.channel === "string" && row.channel ? row.channel : "other";
      const key = `${channel}\u0000${source}\u0000${medium}`;
      const current = byChannel.get(key) || {
        channel,
        source,
        medium,
        landing_views: 0,
        agent_connected: 0,
        first_match: 0
      };
      current.landing_views += 1;
      if (row.agent_connected_at) current.agent_connected += 1;
      if (row.first_match_at) current.first_match += 1;
      byChannel.set(key, current);
    }
  }

  const byCta = new Map<string, { cta_location: string; interaction_type: string; clicks: number }>();
  for (const row of Array.isArray(ctaRows) ? ctaRows : []) {
    const ctaLocation = typeof row?.cta_location === "string" && row.cta_location ? row.cta_location : "other";
    const interactionType = typeof row?.interaction_type === "string" && row.interaction_type
      ? row.interaction_type
      : "unknown";
    const key = `${ctaLocation}\u0000${interactionType}`;
    const current = byCta.get(key) || { cta_location: ctaLocation, interaction_type: interactionType, clicks: 0 };
    current.clicks += 1;
    byCta.set(key, current);
  }

  const landingTotal = steps.landing_view;
  const allRevenueRows = Array.isArray(revenueRows) ? revenueRows : [];
  const revenueByCurrency = new Map<string, {
    currency: string;
    released_escrows: number;
    attributed_released_escrows: number;
    gross_volume_minor: bigint;
    platform_revenue_minor: bigint;
  }>();
  const revenueByChannelCurrency = new Map<string, {
    channel: string;
    source: string;
    medium: string;
    currency: string;
    released_escrows: number;
    gross_volume_minor: bigint;
    platform_revenue_minor: bigint;
  }>();

  let attributedReleasedEscrows = 0;
  for (const row of allRevenueRows) {
    const currency = typeof row?.currency === "string" && row.currency ? row.currency : "UNKNOWN";
    const attributed = typeof row?.acquisition_id === "string" && Boolean(row.acquisition_id);
    const grossVolume = toMinorUnits(row?.gross_volume_minor);
    const platformRevenue = toMinorUnits(row?.platform_revenue_minor);
    const currencyTotals = revenueByCurrency.get(currency) || {
      currency,
      released_escrows: 0,
      attributed_released_escrows: 0,
      gross_volume_minor: 0n,
      platform_revenue_minor: 0n
    };
    currencyTotals.released_escrows += 1;
    if (attributed) {
      currencyTotals.attributed_released_escrows += 1;
      attributedReleasedEscrows += 1;
    }
    currencyTotals.gross_volume_minor += grossVolume;
    currencyTotals.platform_revenue_minor += platformRevenue;
    revenueByCurrency.set(currency, currencyTotals);

    const source = typeof row?.source === "string" && row.source ? row.source : "(unattributed)";
    const medium = typeof row?.medium === "string" && row.medium ? row.medium : "unknown";
    const channel = typeof row?.channel === "string" && row.channel ? row.channel : "unattributed";
    const key = `${channel}\u0000${source}\u0000${medium}\u0000${currency}`;
    const channelTotals = revenueByChannelCurrency.get(key) || {
      channel,
      source,
      medium,
      currency,
      released_escrows: 0,
      gross_volume_minor: 0n,
      platform_revenue_minor: 0n
    };
    channelTotals.released_escrows += 1;
    channelTotals.gross_volume_minor += grossVolume;
    channelTotals.platform_revenue_minor += platformRevenue;
    revenueByChannelCurrency.set(key, channelTotals);
  }

  const serializeMoneyRow = <T extends { gross_volume_minor: bigint; platform_revenue_minor: bigint }>(row: T) => ({
    ...row,
    gross_volume_minor: row.gross_volume_minor.toString(),
    platform_revenue_minor: row.platform_revenue_minor.toString()
  });

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
    by_channel: Array.from(byChannel.values())
      .sort((a, b) => b.landing_views - a.landing_views),
    by_cta: Array.from(byCta.values())
      .sort((a, b) => b.clicks - a.clicks),
    attribution: ACQUISITION_ATTRIBUTION_MODEL,
    revenue: {
      source_of_truth: "released escrows",
      sample: {
        released_escrows: allRevenueRows.length,
        attributed_released_escrows: attributedReleasedEscrows,
        unattributed_released_escrows: allRevenueRows.length - attributedReleasedEscrows,
        truncated: allRevenueRows.length >= MAX_ROWS,
        max_rows: MAX_ROWS
      },
      by_currency: Array.from(revenueByCurrency.values())
        .map(serializeMoneyRow)
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      by_channel_currency: Array.from(revenueByChannelCurrency.values())
        .map(serializeMoneyRow)
        .sort((a, b) => b.released_escrows - a.released_escrows)
    },
    reconciliation: {
      browser_events: {
        landing_views: steps.landing_view,
        connect_cta_clicks: steps.connect_cta_clicked
      },
      backend_activations: {
        activation_started: steps.activation_started,
        agent_connected: steps.agent_connected,
        watchlist_created: steps.watchlist_created,
        first_match: steps.first_match,
        d7_retained: steps.d7_retained
      },
      backend_revenue: {
        released_escrows: allRevenueRows.length,
        attributed_released_escrows: attributedReleasedEscrows,
        unattributed_released_escrows: allRevenueRows.length - attributedReleasedEscrows
      }
    }
  };
}
