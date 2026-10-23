import { loadSmartphoneMissionSnapshots, evaluateSmartphoneMissionSnapshot, getSmartphoneMissionAlerts } from "./smartphone-mission-matching";
import { createAgentWithOwnerLimit, getAgentById, getAgentIdByOwnerId, getOwnerAgentLimit } from "./agents";
import { createConfiguredWatchlist, mapWatchlistResponse, parseWatchlistCreation } from "./watchlist-creation";
import { getWatchlistForOwner, listWatchlists } from "./watchlists";
import { listListings } from "./listings";
import { decodeListingsCursor } from "./listings-cursor";
import { mapPublicListingRow } from "./public-listings";
import { evaluateWatchlistMatchListing } from "../utils/matching";

function serviceError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

async function ownerAgentId(ownerId: string, create = false, excludeAgentIds: string[] = []): Promise<string | null> {
  let agentId = await getAgentIdByOwnerId(ownerId, {
    preferUnsuspended: true, ...(excludeAgentIds.length ? { excludeAgentIds } : {})
  });
  if (!agentId && create) {
    try {
      const agent = await createAgentWithOwnerLimit({
        ownerId,
        ownerAgentLimit: getOwnerAgentLimit(),
        name: "ClawDeals",
        metadata: { created_via: "owner_buy_mission" }
      });
      agentId = agent.id;
    } catch (error: any) {
      // A parallel first mission may have provisioned the account meanwhile.
      if (error?.code !== "OWNER_AGENT_LIMIT_REACHED") throw error;
      agentId = await getAgentIdByOwnerId(ownerId, { preferUnsuspended: true });
      if (!agentId) throw error;
    }
  }
  if (!agentId) return null;
  const agent = await getAgentById(agentId);
  if (!agent || agent.owner_id !== ownerId) throw serviceError("Agent not found", 404, "NOT_FOUND");
  if (agent.suspended_at) {
    // Selection puts all unsuspended agents first. After quota rejections, a
    // suspended fallback means no remaining eligible agent can take the brief.
    if (excludeAgentIds.length) return null;
    throw serviceError("Agent account is suspended", 403, "AGENT_SUSPENDED");
  }
  return agentId;
}

export function ownerMissionStatus(row: any): "ACTIVE" | "EXPIRED" | "PAUSED" {
  if (row.active === false || row.agents?.suspended_at) return "PAUSED";
  const expiration = new Date(row.criteria?.mission?.expires_at).getTime();
  return Number.isFinite(expiration) && expiration > Date.now() ? "ACTIVE" : "EXPIRED";
}

export function mapOwnerMission(row: any) {
  return { ...mapWatchlistResponse(row), status: ownerMissionStatus(row) };
}

export async function createOwnerBuyMission({ ownerId, body }: { ownerId: string; body: any }) {
  const input = parseWatchlistCreation(body);
  const mission = input.criteria.mission;
  if (!mission) throw serviceError("criteria.mission is required", 400, "VALIDATION_ERROR");
  // Mission creation does not authorize external messages or enable delivery channels.
  (input.criteria as any).notification_mode = "in_app";
  let agentId = await ownerAgentId(ownerId, true);
  const fullAgentIds: string[] = [];
  for (;;) {
    try {
      const created = await createConfiguredWatchlist({ agentId, input });
      return mapOwnerMission(created);
    } catch (error: any) {
      // This exact rejection occurs before insertion. Never retry another agent
      // after an unknown failure, or provision one to evade a watchlist quota.
      if (error?.status !== 409 || error?.code !== "WATCHLIST_LIMIT_REACHED") throw error;
      fullAgentIds.push(agentId);
      const nextAgentId = await ownerAgentId(ownerId, false, fullAgentIds);
      if (!nextAgentId) throw error;
      agentId = nextAgentId;
    }
  }
}

export async function listOwnerBuyMissions({ ownerId, limit = 50, cursor = null }: any) {
  const result = await listWatchlists({ ownerId, limit, cursor, missionOnly: true });
  return { items: result.items.map(mapOwnerMission), next_cursor: result.nextCursor };
}

export async function getOwnerBuyMission({ ownerId, missionId }: { ownerId: string; missionId: string }) {
  const row = await getWatchlistForOwner({ ownerId, watchlistId: missionId });
  if (!row || row.criteria?.mission?.kind !== "BUY") return null;
  return mapOwnerMission(row);
}

export async function listOwnerBuyMissionMatches({ ownerId, missionId, cursor: rawCursor, limit = 20 }: any) {
  const row = await getOwnerBuyMission({ ownerId, missionId });
  if (!row) throw serviceError("Mission not found", 404, "NOT_FOUND");
  const mission = row.criteria.mission;
  if (row.status !== "ACTIVE") return { items: [], next_cursor: null, status: row.status, ...(mission.smartphone ? { alerts: [] } : {}) };
  const geo = { lat: mission.location.lat, lng: mission.location.lon, distanceKm: mission.location.radius_km };
  let cursor = null;
  if (rawCursor) {
    const decoded = decodeListingsCursor(rawCursor);
    const value = decoded?.value as any;
    if (decoded?.error || !value || value.sort !== "distance" ||
      value.lat !== geo.lat || value.lng !== geo.lng || value.distance_km !== geo.distanceKm) {
      throw serviceError("Invalid mission results cursor", 400, "VALIDATION_ERROR");
    }
    cursor = value;
  }
  const items = [];
  let nextCursor: string | null = null;
  // PostgreSQL owns full-text matching, including non-ASCII words. This guard
  // rejects only queries with no letters/numbers, not an ASCII token subset.
  const hasSearchText = /[\p{L}\p{N}]/u.test(row.criteria.query || "");
  // listListings applies q to the full-text index, including description. The
  // geo projection omits that text, so only recheck non-text constraints here.
  const watchlist = { ...row, query_text: null, criteria: { ...row.criteria, query: null }, tags: row.criteria.tags ?? [] };
  const budget = Math.min(mission.hard_budget_max, row.criteria.price_max ?? mission.hard_budget_max);
  // Read through the same LIVE and moderation-filtered catalogue as public search.
  // Continue bounded pages because filtering another market must not mask later matches.
  for (let page = 0; page < 5; page++) {
    const result = await listListings({
      q: mission.smartphone ? null : row.criteria.query,
      // The catalogue RPC accepts integer prices; overfetch a fractional ceiling
      // and enforce the exact mission budget below, including decimal amounts.
      priceMax: Math.ceil(budget),
      sort: "distance",
      geo,
      cursor,
      limit: limit - items.length,
      includeHidden: false
    });
    const snapshots = mission.smartphone ? await loadSmartphoneMissionSnapshots(result.items.map((listing: any) => listing.listing_id)) : null;
    for (const listing of result.items) {
      const price = Number(listing.price_amount);
      const distance = Number(listing.distance_m);
      if (listing.status !== "LIVE" || listing.market_code !== row.market_code ||
        listing.currency !== mission.currency || listing.price_amount == null || !Number.isFinite(price) || price < 0 || price > budget ||
        listing.distance_m == null || !Number.isFinite(distance) || distance < 0 || distance > geo.distanceKm * 1000 ||
        !hasSearchText) continue;
      if (snapshots) {
        const snapshot = snapshots.get(listing.listing_id);
        if (!snapshot) continue;
        const evaluation = evaluateSmartphoneMissionSnapshot(snapshot, row);
        if (!evaluation.baseMatched || evaluation.smartphone.status === "incompatible") continue;
        items.push({ ...mapPublicListingRow({ ...listing, ...snapshot.listing }), smartphone_compatibility: evaluation.smartphone });
        continue;
      }
      if (!evaluateWatchlistMatchListing({ listing, watchlist, listingDistanceKm: distance / 1000 }).matched) continue;
      items.push(mapPublicListingRow(listing));
    }
    nextCursor = result.nextCursor;
    if (!nextCursor || items.length >= limit) break;
    cursor = decodeListingsCursor(nextCursor)?.value;
    if (!cursor) throw serviceError("Invalid catalogue cursor", 500, "ERROR");
  }
  if (!mission.smartphone) return { items, next_cursor: nextCursor, status: row.status };
  const alerts = await getSmartphoneMissionAlerts(row);
  // Finish the whole page before a final visibility/evaluation barrier, so a
  // slower alert lookup cannot expose an item hidden in the meantime.
  const finalSnapshots = await loadSmartphoneMissionSnapshots([...items.map(item => item.listing_id), ...alerts.map(alert => alert.listing_id)]);
  const currentMission = await getOwnerBuyMission({ ownerId, missionId });
  if (!currentMission || currentMission.status !== "ACTIVE" ||
    currentMission.market_code !== row.market_code || currentMission.currency !== row.currency ||
    currentMission.updated_at !== row.updated_at || JSON.stringify(currentMission.criteria) !== JSON.stringify(row.criteria)) {
    return { items: [], next_cursor: null, status: currentMission?.status || "PAUSED", alerts: [] };
  }
  const currentItems = items.flatMap(item => {
    const snapshot = finalSnapshots.get(item.listing_id);
    if (!snapshot) return [];
    const evaluated = evaluateSmartphoneMissionSnapshot(snapshot, row);
    if (!evaluated.baseMatched || evaluated.smartphone.status === "incompatible") return [];
    return [{ ...item, ...mapPublicListingRow({ ...snapshot.listing, distance_m: evaluated.reason.geo_km * 1000 }), smartphone_compatibility: evaluated.smartphone }];
  });
  const currentAlerts = alerts.flatMap(alert => {
    const snapshot = finalSnapshots.get(alert.listing_id);
    if (!snapshot || !evaluateSmartphoneMissionSnapshot(snapshot, row).matched) return [];
    return [{ ...alert, listing: mapPublicListingRow(snapshot.listing) }];
  });
  return { items: currentItems, next_cursor: nextCursor, status: row.status, alerts: currentAlerts };
}
