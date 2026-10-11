import { createAgentWithOwnerLimit, getAgentById, getAgentIdByOwnerId, getOwnerAgentLimit } from "./agents";
import { createConfiguredWatchlist, mapWatchlistResponse, parseWatchlistCreation } from "./watchlist-creation";
import { getWatchlistForOwner, listWatchlists } from "./watchlists";
import { listListings } from "./listings";
import { decodeListingsCursor } from "./listings-cursor";
import { mapPublicListingRow } from "./public-listings";
import { evaluateWatchlistMatchListing, tokenize } from "../utils/matching";

function serviceError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

async function ownerAgentId(ownerId: string, create = false): Promise<string | null> {
  let agentId = await getAgentIdByOwnerId(ownerId);
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
      agentId = await getAgentIdByOwnerId(ownerId);
      if (!agentId) throw error;
    }
  }
  if (!agentId) return null;
  const agent = await getAgentById(agentId);
  if (!agent || agent.owner_id !== ownerId) throw serviceError("Agent not found", 404, "NOT_FOUND");
  if (agent.suspended_at) throw serviceError("Agent account is suspended", 403, "AGENT_SUSPENDED");
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
  const agentId = await ownerAgentId(ownerId, true);
  const created = await createConfiguredWatchlist({ agentId, input });
  return mapOwnerMission(created);
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
  if (row.status !== "ACTIVE") return { items: [], next_cursor: null, status: row.status };
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
  const queryTokens = tokenize(row.criteria.query);
  const watchlist = { ...row, tags: row.criteria.tags ?? [] };
  const budget = Math.min(mission.hard_budget_max, row.criteria.price_max ?? mission.hard_budget_max);
  // Read through the same LIVE and moderation-filtered catalogue as public search.
  // Continue bounded pages because filtering another market must not mask later matches.
  for (let page = 0; page < 5; page++) {
    const result = await listListings({
      q: row.criteria.query,
      // The catalogue RPC accepts integer prices; overfetch a fractional ceiling
      // and enforce the exact mission budget below, including decimal amounts.
      priceMax: Math.ceil(budget),
      sort: "distance",
      geo,
      cursor,
      limit: limit - items.length,
      includeHidden: false
    });
    for (const listing of result.items) {
      const price = Number(listing.price_amount);
      const distance = Number(listing.distance_m);
      if (listing.status !== "LIVE" || listing.market_code !== row.market_code ||
        listing.currency !== mission.currency || listing.price_amount == null || !Number.isFinite(price) || price < 0 || price > budget ||
        listing.distance_m == null || !Number.isFinite(distance) || distance < 0 || distance > geo.distanceKm * 1000 ||
        !queryTokens.length) continue;
      if (!evaluateWatchlistMatchListing({ listing, watchlist, listingDistanceKm: distance / 1000 }).matched) continue;
      items.push(mapPublicListingRow(listing));
    }
    nextCursor = result.nextCursor;
    if (!nextCursor || items.length >= limit) break;
    cursor = decodeListingsCursor(nextCursor)?.value;
    if (!cursor) throw serviceError("Invalid catalogue cursor", 500, "ERROR");
  }
  return { items, next_cursor: nextCursor, status: row.status };
}
