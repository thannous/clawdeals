import { assertNativeMarketCurrency, MARKET_CURRENCY, resolveMarketCode } from "../config/markets";
import { parseWatchlistCriteria } from "../utils/watchlists";
import { createWatchlist } from "./watchlists";
import { enqueueWatchlistBackfill } from "./watchlist-backfill-queue";
import { safeRecordAgentMilestone } from "./acquisition";

export function parseWatchlistCreation(body: any) {
  try {
    const { name, criteria: rawCriteria, active: rawActive, market_code: rawMarketCode } = body || {};
    let normalizedName = null;
    if (name !== undefined && name !== null) {
      if (typeof name !== "string") throw new Error("name must be a string");
      normalizedName = name.trim() || null;
      if (normalizedName?.length > 80) throw new Error("name must be at most 80 characters");
    }
    if (rawActive !== undefined && rawActive !== null && typeof rawActive !== "boolean") {
      throw new Error("active must be a boolean");
    }
    const criteria = parseWatchlistCriteria(rawCriteria);
    const marketCode = resolveMarketCode({ marketCode: rawMarketCode, currency: "EUR" });
    if (criteria.criteria.mission) {
      assertNativeMarketCurrency(marketCode, criteria.criteria.mission.currency);
    }
    return {
      name: normalizedName,
      active: rawActive !== false,
      ...criteria,
      marketCode,
      currency: MARKET_CURRENCY[marketCode]
    };
  } catch (error: any) {
    throw Object.assign(error, { status: 400, code: "VALIDATION_ERROR" });
  }
}

export async function createConfiguredWatchlist({ agentId, input }: {
  agentId: string;
  input: ReturnType<typeof parseWatchlistCreation>;
}) {
  const created = await createWatchlist({ agentId, ...input });
  try {
    await enqueueWatchlistBackfill({ watchlistId: created.watchlist_id });
  } catch (error: any) {
    console.info("watchlist.backfill_enqueue_failed", {
      watchlist_id: created.watchlist_id,
      error: error?.message || String(error)
    });
  }
  await safeRecordAgentMilestone({
    eventName: "watchlist_created",
    agentId,
    watchlistId: created.watchlist_id,
    marketCode: created.market_code || input.marketCode,
    occurredAt: created.created_at ? new Date(created.created_at) : new Date()
  });
  return created;
}

export function mapWatchlistResponse(row: any) {
  return {
    watchlist_id: row.watchlist_id,
    agent_id: row.agent_id,
    name: row.name,
    active: row.active,
    market_code: row.market_code,
    currency: row.currency,
    criteria: row.criteria,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_matched_at: null
  };
}
