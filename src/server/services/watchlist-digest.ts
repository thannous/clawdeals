import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { publishSseEvent } from "../sse/store";
import { WATCHLIST_MATCH_EVENT_MAX_IDS } from "../config/watchlists";

const DELIVERED_AT_UPDATE_CHUNK_SIZE = 200;

function buildServiceError(message, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function toPositiveInt(value: any, fallback: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const size = Math.max(1, Number.isFinite(chunkSize) ? Math.floor(chunkSize) : 1);
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function markWatchlistMatchesDelivered({
  client,
  matchIds,
  deliveredAt,
  chunkSize = DELIVERED_AT_UPDATE_CHUNK_SIZE
}: any = {}) {
  const ids = Array.isArray(matchIds) ? matchIds.filter(Boolean) : [];
  if (ids.length === 0) return { ok: true, updated: 0 };

  const uniqueIds = Array.from(new Set(ids));
  const chunks = chunkArray(uniqueIds, chunkSize);

  let updated = 0;
  for (const chunk of chunks) {
    const { error } = await client
      .from("watchlist_matches")
      .update({ delivered_at: deliveredAt })
      .in("watchlist_match_id", chunk);
    if (error) {
      console.info("watchlist.digest_delivered_at_update_failed", {
        error: error.message || String(error),
        chunk_size: chunk.length,
        total_ids: uniqueIds.length
      });
      continue;
    }
    updated += chunk.length;
  }

  return { ok: true, updated };
}

export async function runWatchlistDigest({
  limitRows = 5000,
  maxEntitiesPerAgent = 50,
  now = new Date(),
  client
}: any = {}) {
  const supabase = client || getSupabaseServiceClient();
  const cappedRows = Math.max(1, Math.min(20000, toPositiveInt(limitRows, 5000)));
  const cappedEntities = Math.max(1, Math.min(200, toPositiveInt(maxEntitiesPerAgent, 50)));
  const nowIso = now.toISOString();

  const { data, error } = await supabase
    .from("watchlist_matches")
    .select("watchlist_match_id,watchlist_id,agent_id,entity_type,entity_id,matched_at")
    .is("delivered_at", null)
    .order("matched_at", { ascending: true })
    .order("watchlist_match_id", { ascending: true })
    .limit(cappedRows);

  if (error) {
    mapError(error);
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return { ok: true, rows: 0, agents: 0, events_sent: 0, delivered: 0 };
  }

  const byAgent = new Map<string, any>();

  for (const row of rows) {
    const agentId = row?.agent_id;
    const entityType = row?.entity_type;
    const entityId = row?.entity_id;
    if (!agentId || !entityType || !entityId) continue;

    const agentState = byAgent.get(agentId) || {
      entities: new Map<string, any>(),
      entityOrder: []
    };

    const key = `${entityType}:${entityId}`;
    let entityState = agentState.entities.get(key);
    if (!entityState) {
      entityState = {
        entity_type: entityType,
        entity_id: entityId,
        watchlistIds: new Set(),
        matchIds: []
      };
      agentState.entities.set(key, entityState);
      agentState.entityOrder.push(key);
    }

    if (row.watchlist_id) entityState.watchlistIds.add(row.watchlist_id);
    if (row.watchlist_match_id) entityState.matchIds.push(row.watchlist_match_id);

    byAgent.set(agentId, agentState);
  }

  let eventsSent = 0;
  let deliveredCount = 0;

  for (const [agentId, state] of byAgent.entries()) {
    const keys: string[] = Array.isArray(state.entityOrder) ? state.entityOrder : [];
    const selectedKeys = keys.slice(0, cappedEntities);
    const entitiesTruncated = keys.length > cappedEntities;

    const payloadEntities = [];
    const matchIdsToMark: string[] = [];

    for (const key of selectedKeys) {
      const entry = state.entities.get(key);
      if (!entry) continue;

      const allIds = Array.from(entry.watchlistIds);
      const watchlistIds = allIds.slice(0, WATCHLIST_MATCH_EVENT_MAX_IDS);
      const watchlistIdsTruncated = allIds.length > WATCHLIST_MATCH_EVENT_MAX_IDS;

      payloadEntities.push({
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        watchlist_ids: watchlistIds,
        watchlist_ids_truncated: watchlistIdsTruncated
      });

      matchIdsToMark.push(...entry.matchIds);
    }

    if (payloadEntities.length === 0) continue;

    const result = await publishSseEvent({
      audienceType: "agent",
      audienceId: agentId,
      type: "watchlist.digest",
      entity: { type: "agent", id: agentId },
      payload: {
        entities: payloadEntities,
        entities_truncated: entitiesTruncated
      },
      ts: nowIso
    });

    eventsSent += 1;

    if (result?.ok) {
      const delivered = await markWatchlistMatchesDelivered({
        client: supabase,
        matchIds: matchIdsToMark,
        deliveredAt: nowIso
      });
      deliveredCount += delivered?.updated || 0;
    } else {
      console.info("watchlist.digest_sse_failed", { agent_id: agentId, result });
    }
  }

  return { ok: true, rows: rows.length, agents: byAgent.size, events_sent: eventsSent, delivered: deliveredCount };
}
