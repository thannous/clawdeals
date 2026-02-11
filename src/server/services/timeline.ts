import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { encodeAuditCursor, decodeAuditCursor } from "./audit-cursor";
import { isUuid } from "../utils/validators";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const REPLAY_HARD_CAP = 1000;

const VALID_ENTITY_TYPES = [
  "listing", "thread", "message", "offer", "approval",
  "deal", "watchlist", "agent", "transaction", "escrow", "dispute"
];

const SELECT_COLS =
  "id, occurred_at, actor, action, outcome, request_id, payload_fingerprint, redacted, idempotency, payload";

function buildServiceError(message, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function mapTimelineRow(row, isPrimary: boolean, correlationSource: string | null = null) {
  return {
    audit_id: row.id,
    ts: row.occurred_at,
    actor: { type: row.actor?.type || "unknown", id: row.actor?.id || null },
    action: row.action?.event || row.action?.path || "unknown",
    entity: { type: row.action?.entity_type || null, id: row.action?.entity_id || null },
    outcome: row.outcome,
    metadata: { hash: row.payload_fingerprint, redacted: row.redacted },
    request_id: row.request_id || null,
    idempotency_key: row.idempotency?.key || null,
    is_primary: isPrimary,
    correlation_source: correlationSource
  };
}

export async function getEntityTimeline({
  entityType,
  entityId,
  includeCorrelated = true,
  limit = DEFAULT_LIMIT,
  cursor
}: {
  entityType: string;
  entityId: string;
  includeCorrelated?: boolean;
  limit?: number;
  cursor?: string | null;
} = {} as any) {
  if (!entityType) {
    throw buildServiceError("entity_type is required", 400, "VALIDATION_ERROR");
  }
  if (!VALID_ENTITY_TYPES.includes(entityType)) {
    throw buildServiceError(`Invalid entity_type: ${entityType}`, 400, "VALIDATION_ERROR");
  }
  if (!entityId) {
    throw buildServiceError("entity_id is required", 400, "VALIDATION_ERROR");
  }
  if (!isUuid(entityId)) {
    throw buildServiceError("entity_id must be a valid UUID", 400, "VALIDATION_ERROR");
  }
  if (limit < 1 || limit > MAX_LIMIT) {
    throw buildServiceError(`limit must be between 1 and ${MAX_LIMIT}`, 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;

  // --- Primary query: events for the entity ---
  let primaryQuery = client
    .from("audit_logs")
    .select(SELECT_COLS)
    .eq("action->>entity_type", entityType)
    .eq("action->>entity_id", entityId)
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(pageLimit + 1);

  if (cursor) {
    const parsed = decodeAuditCursor(cursor);
    if (parsed?.error) {
      throw buildServiceError(parsed.error, 400, "VALIDATION_ERROR");
    }
    if (parsed?.value) {
      const occurredAt = JSON.stringify(parsed.value.occurred_at);
      const id = JSON.stringify(parsed.value.id);
      primaryQuery = primaryQuery.or(
        `occurred_at.gt.${occurredAt},and(occurred_at.eq.${occurredAt},id.gt.${id})`
      );
    }
  }

  const { data: primaryData, error: primaryError } = await primaryQuery;
  if (primaryError) mapError(primaryError);

  const primaryRows = primaryData || [];
  const hasMore = primaryRows.length > pageLimit;
  const cappedPrimary = hasMore ? primaryRows.slice(0, pageLimit) : primaryRows;

  // Build maps for dedup and correlation
  const seenIds = new Set<string>();
  const allItems: any[] = [];

  for (const row of cappedPrimary) {
    seenIds.add(row.id);
    allItems.push(mapTimelineRow(row, true, null));
  }

  const correlatedRequestIds: string[] = [];
  const correlatedIdempotencyKeys: string[] = [];

  if (includeCorrelated && cappedPrimary.length > 0) {
    // Collect unique request_ids
    const requestIds = [...new Set<string>(
      cappedPrimary
        .map((r) => r.request_id)
        .filter((id): id is string => !!id && typeof id === "string")
    )];
    correlatedRequestIds.push(...requestIds);

    if (requestIds.length > 0) {
      const { data: reqCorrelated, error: reqError } = await client
        .from("audit_logs")
        .select(SELECT_COLS)
        .in("request_id", requestIds)
        .order("occurred_at", { ascending: true })
        .limit(MAX_LIMIT);
      if (reqError) mapError(reqError);
      for (const row of reqCorrelated || []) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          allItems.push(mapTimelineRow(row, false, "request_id"));
        }
      }
    }

    // Collect unique idempotency keys
    const idempKeys = [...new Set<string>(
      cappedPrimary
        .map((r) => r.idempotency?.key)
        .filter((k): k is string => !!k && typeof k === "string")
    )];
    correlatedIdempotencyKeys.push(...idempKeys);

    if (idempKeys.length > 0) {
      const { data: idempCorrelated, error: idempError } = await client
        .from("audit_logs")
        .select(SELECT_COLS)
        .in("idempotency->>key", idempKeys)
        .order("occurred_at", { ascending: true })
        .limit(MAX_LIMIT);
      if (idempError) mapError(idempError);
      for (const row of idempCorrelated || []) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          allItems.push(mapTimelineRow(row, false, "idempotency_key"));
        }
      }
    }
  }

  // Sort all chronologically
  allItems.sort((a, b) => {
    const tsCmp = a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    if (tsCmp !== 0) return tsCmp;
    return a.audit_id < b.audit_id ? -1 : a.audit_id > b.audit_id ? 1 : 0;
  });

  // Keep all primary rows from this page and only fill remaining slots with correlated rows.
  const correlatedCapacity = Math.max(0, pageLimit - cappedPrimary.length);
  let correlatedIncluded = 0;
  const finalItems: any[] = [];
  for (const item of allItems) {
    if (item.is_primary) {
      finalItems.push(item);
      continue;
    }
    if (correlatedIncluded < correlatedCapacity) {
      finalItems.push(item);
      correlatedIncluded += 1;
    }
  }

  // Compute next cursor from primary data (not correlated)
  let nextCursor = null;
  if (hasMore && cappedPrimary.length > 0) {
    const last = cappedPrimary[cappedPrimary.length - 1];
    nextCursor = encodeAuditCursor({
      occurred_at: last.occurred_at,
      id: last.id
    });
  }

  // Count correlated entities
  const correlatedEntities = new Set<string>();
  for (const item of finalItems) {
    if (!item.is_primary && item.entity?.type && item.entity?.id) {
      correlatedEntities.add(`${item.entity.type}:${item.entity.id}`);
    }
  }

  return {
    entity: { type: entityType, id: entityId },
    items: finalItems,
    nextCursor,
    correlation: {
      request_ids: correlatedRequestIds,
      idempotency_keys: correlatedIdempotencyKeys,
      correlated_entity_count: correlatedEntities.size
    }
  };
}

// ---------- State Replay ----------

function transactionReducer(state: Record<string, unknown>, action: string, payload: any) {
  const delta: Record<string, unknown> = {};

  if (action === "offer.create" || action === "offer.created") {
    delta.status = "DRAFT";
    if (payload?.amount !== undefined) delta.amount = payload.amount;
    if (payload?.currency) delta.currency = payload.currency;
    state.status = "DRAFT";
    if (payload?.amount !== undefined) state.amount = payload.amount;
    if (payload?.currency) state.currency = payload.currency;
  } else if (action === "offer.accept" || action === "offer.accepted") {
    delta.status = "ACCEPTED";
    state.status = "ACCEPTED";
  } else if (action === "offer.decline" || action === "offer.declined") {
    delta.status = "DECLINED";
    state.status = "DECLINED";
  } else if (action === "offer.cancel" || action === "offer.cancelled") {
    delta.status = "CANCELLED";
    state.status = "CANCELLED";
  } else if (action === "offer.counter" || action === "offer.countered") {
    delta.status = "COUNTERED";
    if (payload?.amount !== undefined) delta.amount = payload.amount;
    state.status = "COUNTERED";
    if (payload?.amount !== undefined) state.amount = payload.amount;
  } else if (action === "transaction.created") {
    delta.status = "PENDING";
    state.status = "PENDING";
  } else if (action === "transaction.completed") {
    delta.status = "COMPLETED";
    state.status = "COMPLETED";
  } else if (action === "transaction.cancelled") {
    delta.status = "CANCELLED";
    state.status = "CANCELLED";
  } else if (action === "escrow.funded") {
    delta.escrow_status = "FUNDED";
    state.escrow_status = "FUNDED";
  } else if (action === "escrow.released") {
    delta.escrow_status = "RELEASED";
    state.escrow_status = "RELEASED";
  } else if (action === "escrow.refunded") {
    delta.escrow_status = "REFUNDED";
    state.escrow_status = "REFUNDED";
  } else {
    delta._unknown_action = true;
  }

  return delta;
}

function listingReducer(state: Record<string, unknown>, action: string, payload: any) {
  const delta: Record<string, unknown> = {};

  if (action === "listing.create" || action === "listing.created") {
    delta.status = "ACTIVE";
    if (payload?.title) delta.title = payload.title;
    if (payload?.price !== undefined) delta.price = payload.price;
    state.status = "ACTIVE";
    if (payload?.title) state.title = payload.title;
    if (payload?.price !== undefined) state.price = payload.price;
  } else if (action === "listing.updated") {
    if (payload?.title) { delta.title = payload.title; state.title = payload.title; }
    if (payload?.price !== undefined) { delta.price = payload.price; state.price = payload.price; }
    if (payload?.status) { delta.status = payload.status; state.status = payload.status; }
  } else if (action === "listing.status_changed") {
    if (payload?.status) { delta.status = payload.status; state.status = payload.status; }
  } else {
    delta._unknown_action = true;
  }

  return delta;
}

function escrowReducer(state: Record<string, unknown>, action: string, payload: any) {
  const delta: Record<string, unknown> = {};

  if (action === "escrow.created") {
    delta.status = "CREATED";
    if (payload?.amount !== undefined) delta.amount = payload.amount;
    state.status = "CREATED";
    if (payload?.amount !== undefined) state.amount = payload.amount;
  } else if (action === "escrow.funded") {
    delta.status = "FUNDED";
    state.status = "FUNDED";
  } else if (action === "escrow.released") {
    delta.status = "RELEASED";
    state.status = "RELEASED";
  } else if (action === "escrow.refunded") {
    delta.status = "REFUNDED";
    state.status = "REFUNDED";
  } else {
    delta._unknown_action = true;
  }

  return delta;
}

function offerReducer(state: Record<string, unknown>, action: string, payload: any) {
  const delta: Record<string, unknown> = {};

  if (action === "offer.create" || action === "offer.created") {
    delta.status = "PENDING";
    if (payload?.amount !== undefined) delta.amount = payload.amount;
    state.status = "PENDING";
    if (payload?.amount !== undefined) state.amount = payload.amount;
  } else if (action === "offer.accept" || action === "offer.accepted") {
    delta.status = "ACCEPTED";
    state.status = "ACCEPTED";
  } else if (action === "offer.decline" || action === "offer.declined") {
    delta.status = "DECLINED";
    state.status = "DECLINED";
  } else if (action === "offer.cancel" || action === "offer.cancelled") {
    delta.status = "CANCELLED";
    state.status = "CANCELLED";
  } else if (action === "offer.counter" || action === "offer.countered") {
    delta.status = "COUNTERED";
    if (payload?.amount !== undefined) delta.amount = payload.amount;
    state.status = "COUNTERED";
    if (payload?.amount !== undefined) state.amount = payload.amount;
  } else {
    delta._unknown_action = true;
  }

  return delta;
}

function disputeReducer(state: Record<string, unknown>, action: string, payload: any) {
  const delta: Record<string, unknown> = {};

  if (action === "dispute.created") {
    delta.status = "OPEN";
    if (payload?.reason) delta.reason = payload.reason;
    state.status = "OPEN";
    if (payload?.reason) state.reason = payload.reason;
  } else if (action === "dispute.evidence_submitted") {
    delta.evidence_count = ((state.evidence_count as number) || 0) + 1;
    state.evidence_count = delta.evidence_count;
  } else if (action === "dispute.resolved") {
    delta.status = "RESOLVED";
    if (payload?.resolution) delta.resolution = payload.resolution;
    state.status = "RESOLVED";
    if (payload?.resolution) state.resolution = payload.resolution;
  } else if (action === "dispute.escalated") {
    delta.status = "ESCALATED";
    state.status = "ESCALATED";
  } else {
    delta._unknown_action = true;
  }

  return delta;
}

function genericReducer(state: Record<string, unknown>, action: string, payload: any) {
  const delta: Record<string, unknown> = {};
  if (payload && typeof payload === "object") {
    for (const [key, value] of Object.entries(payload)) {
      delta[key] = value;
      state[key] = value;
    }
  }
  if (Object.keys(delta).length === 0) {
    delta._unknown_action = true;
  }
  return delta;
}

function getReducer(entityType: string) {
  switch (entityType) {
    case "transaction": return transactionReducer;
    case "listing": return listingReducer;
    case "escrow": return escrowReducer;
    case "offer": return offerReducer;
    case "dispute": return disputeReducer;
    default: return genericReducer;
  }
}

export async function replayEntityState({
  entityType,
  entityId,
  upToAuditId
}: {
  entityType: string;
  entityId: string;
  upToAuditId?: string | null;
} = {} as any) {
  if (!entityType) {
    throw buildServiceError("entity_type is required", 400, "VALIDATION_ERROR");
  }
  if (!entityId) {
    throw buildServiceError("entity_id is required", 400, "VALIDATION_ERROR");
  }
  if (!isUuid(entityId)) {
    throw buildServiceError("entity_id must be a valid UUID", 400, "VALIDATION_ERROR");
  }
  if (upToAuditId && !isUuid(upToAuditId)) {
    throw buildServiceError("up_to_audit_id must be a valid UUID", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();

  const { data, error } = await client
    .from("audit_logs")
    .select(SELECT_COLS)
    .eq("action->>entity_type", entityType)
    .eq("action->>entity_id", entityId)
    .order("occurred_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(REPLAY_HARD_CAP + 1);

  if (error) mapError(error);

  const rows = data || [];
  const isTruncated = rows.length > REPLAY_HARD_CAP;
  const cappedRows = isTruncated ? rows.slice(0, REPLAY_HARD_CAP) : rows;

  const reducer = getReducer(entityType);
  const state: Record<string, unknown> = {};
  const steps: any[] = [];
  let lastAuditId: string | null = null;

  for (const row of cappedRows) {
    const action = row.action?.event || row.action?.path || "unknown";
    const outcome = row.outcome;

    let delta: Record<string, unknown>;
    if (row.redacted) {
      delta = { _redacted: true };
    } else {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      delta = reducer(state, action, payload);
    }

    lastAuditId = row.id;

    steps.push({
      audit_id: row.id,
      ts: row.occurred_at,
      action,
      outcome,
      state_after: { ...state },
      delta
    });

    if (upToAuditId && row.id === upToAuditId) {
      break;
    }
  }

  return {
    entity: { type: entityType, id: entityId },
    current_state: { ...state },
    steps,
    up_to_audit_id: upToAuditId || lastAuditId,
    event_count: steps.length,
    is_truncated: isTruncated && (!upToAuditId || !steps.some((s) => s.audit_id === upToAuditId))
  };
}
