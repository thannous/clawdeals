import { mapSupabaseError } from "./supabase-errors";

function buildServiceError(message: string, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function normalizeWatchlistIds(value: any) {
  const ids = Array.isArray(value) ? value.filter(Boolean) : [];
  const unique = Array.from(new Set(ids.map((v) => String(v))));
  return unique;
}

function mergePayloadWatchlistIds(existing: any, nextIds: string[]) {
  const prev = existing && typeof existing === "object" ? existing.watchlist_ids : null;
  const merged = Array.from(new Set([...(Array.isArray(prev) ? prev : []), ...nextIds].map((v) => String(v))));
  return { ...(existing && typeof existing === "object" ? existing : {}), watchlist_ids: merged };
}

export async function enqueueWatchlistMatchOutbox({
  client,
  entityType,
  entityId,
  insertedByAgent,
  occurredAt
}: {
  client: any;
  entityType: "deal" | "listing";
  entityId: string;
  insertedByAgent: Map<string, { watchlistIds: string[] }>;
  occurredAt: string;
}) {
  const agentIds = Array.from(insertedByAgent.keys()).filter(Boolean);
  if (agentIds.length === 0) return { ok: true, inserted: 0, owners: 0 };

  const { data: agents, error: agentsError } = await client
    .from("agents")
    .select("id,owner_id")
    .in("id", agentIds);
  if (agentsError) mapError(agentsError);

  const ownerMap = new Map<string, { watchlistIds: Set<string> }>();
  for (const row of Array.isArray(agents) ? agents : []) {
    const agentId = row?.id;
    const ownerId = row?.owner_id;
    if (!agentId || !ownerId) continue;
    const state = ownerMap.get(ownerId) || { watchlistIds: new Set<string>() };
    const byAgent = insertedByAgent.get(agentId);
    for (const id of normalizeWatchlistIds(byAgent?.watchlistIds || [])) {
      state.watchlistIds.add(id);
    }
    ownerMap.set(ownerId, state);
  }

  const ownerIds = Array.from(ownerMap.keys());
  if (ownerIds.length === 0) return { ok: true, inserted: 0, owners: 0 };

  const { data: existingRows, error: existingError } = await client
    .from("notification_outbox")
    .select("notification_outbox_id,owner_id,payload,status,delivered_at,attempt_count,last_error")
    .in("owner_id", ownerIds)
    .eq("channel_type", "telegram")
    .eq("event_type", "watchlist_match")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (existingError) mapError(existingError);

  const existingByOwner = new Map<string, any>();
  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    if (row?.owner_id) existingByOwner.set(row.owner_id, row);
  }

  const rows = ownerIds.map((ownerId) => {
    const st = ownerMap.get(ownerId);
    const nextIds = Array.from(st?.watchlistIds || []);
    const existing = existingByOwner.get(ownerId) || null;
    const mergedPayload = mergePayloadWatchlistIds(existing?.payload || {}, nextIds);

    const resetToPending = existing && existing.status && String(existing.status) !== "PENDING";

    return {
      owner_id: ownerId,
      channel_type: "telegram",
      event_type: "watchlist_match",
      entity_type: entityType,
      entity_id: entityId,
      payload: mergedPayload,
      occurred_at: occurredAt,
      status: resetToPending ? "PENDING" : existing?.status || "PENDING",
      delivered_at: resetToPending ? null : existing?.delivered_at || null,
      attempt_count: resetToPending ? 0 : existing?.attempt_count || 0,
      last_error: resetToPending ? null : existing?.last_error || null
    };
  });

  const { error: upsertError } = await client.from("notification_outbox").upsert(rows, {
    onConflict: "owner_id,channel_type,event_type,entity_type,entity_id"
  });
  if (upsertError) mapError(upsertError);

  return { ok: true, inserted: rows.length, owners: ownerIds.length };
}
