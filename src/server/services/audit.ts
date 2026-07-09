import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { encodeAuditCursor } from "./audit-cursor";

const DEFAULT_LIMIT = 50;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const EXPORT_BATCH_SIZE = 500;
export const MAX_EXPORT_ROWS = 10_000;

function formatFilterValue(value) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

function buildServiceError(message, status = 500, code = "ERROR", meta?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (meta && typeof meta === "object") {
    Object.assign(error, meta);
  }
  return error;
}

function mapRow(row) {
  return {
    audit_id: row.id,
    ts: row.occurred_at,
    actor: { type: row.actor?.type || "unknown", id: row.actor?.id || null },
    action: row.action?.event || row.action?.path || "unknown",
    entity: { type: row.action?.entity_type || null, id: row.action?.entity_id || null },
    outcome: row.outcome,
    metadata: { hash: row.payload_fingerprint, redacted: row.redacted },
    request_id: row.request_id
  };
}

function applyFilters(query, { from, to, actorType, actorId, actionName, entityType, entityId, outcome, requestId }) {
  query = query.gte("occurred_at", from).lt("occurred_at", to);

  if (actorType) {
    query = query.eq("actor->>type", actorType);
  }
  if (actorId) {
    query = query.eq("actor->>id", actorId);
  }
  if (actionName) {
    query = query.eq("action->>event", actionName);
  }
  if (entityType) {
    query = query.eq("action->>entity_type", entityType);
  }
  if (entityId) {
    query = query.eq("action->>entity_id", entityId);
  }
  if (outcome) {
    query = query.eq("outcome", outcome);
  }
  if (requestId) {
    query = query.eq("request_id", requestId);
  }

  return query;
}

export async function listAuditLogs({
  from,
  to,
  actorType,
  actorId,
  actionName,
  entityType,
  entityId,
  outcome,
  requestId,
  limit = DEFAULT_LIMIT,
  cursor
}: any = {}) {
  if (!from || !to) {
    throw buildServiceError("Both from and to parameters are required", 400, "TIME_RANGE_REQUIRED");
  }

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (toMs - fromMs > SEVEN_DAYS_MS) {
    throw buildServiceError("Time range must not exceed 7 days", 400, "TIME_RANGE_TOO_LARGE");
  }

  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;

  let query = client
    .from("audit_logs")
    .select("id, occurred_at, actor, action, outcome, request_id, payload_fingerprint, redacted")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageLimit + 1);

  query = applyFilters(query, { from, to, actorType, actorId, actionName, entityType, entityId, outcome, requestId });

  if (cursor?.occurred_at && cursor?.id) {
    const occurredAt = formatFilterValue(cursor.occurred_at);
    const id = formatFilterValue(cursor.id);
    query = query.or(
      `occurred_at.lt.${occurredAt},and(occurred_at.eq.${occurredAt},id.lt.${id})`
    );
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const rows = data || [];
  const hasMore = rows.length > pageLimit;
  const items = hasMore ? rows.slice(0, pageLimit) : rows;

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeAuditCursor({
      occurred_at: last.occurred_at,
      id: last.id
    });
  }

  return { items: items.map(mapRow), nextCursor };
}

function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Prevent CSV formula injection: prefix dangerous leading characters with a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportAuditLogsCsv({
  from,
  to,
  actorType,
  actorId,
  actionName,
  entityType,
  entityId,
  outcome,
  requestId
}: any = {}) {
  if (!from || !to) {
    throw buildServiceError("Both from and to parameters are required", 400, "TIME_RANGE_REQUIRED");
  }

  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (toMs - fromMs > SEVEN_DAYS_MS) {
    throw buildServiceError("Time range must not exceed 7 days", 400, "TIME_RANGE_TOO_LARGE");
  }

  const client = getSupabaseServiceClient();
  const allRows: any[] = [];
  let cursorState: any = null;

  // Fetch all rows in batches
  while (true) {
    let query = client
      .from("audit_logs")
      .select("id, occurred_at, actor, action, outcome, request_id, payload_fingerprint, redacted")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(EXPORT_BATCH_SIZE + 1);

    query = applyFilters(query, { from, to, actorType, actorId, actionName, entityType, entityId, outcome, requestId });

    if (cursorState) {
      const occurredAt = formatFilterValue(cursorState.occurred_at);
      const id = formatFilterValue(cursorState.id);
      query = query.or(
        `occurred_at.lt.${occurredAt},and(occurred_at.eq.${occurredAt},id.lt.${id})`
      );
    }

    const { data, error } = await query;
    if (error) {
      mapError(error);
    }

    const rows = data || [];
    const hasMore = rows.length > EXPORT_BATCH_SIZE;
    const batch = hasMore ? rows.slice(0, EXPORT_BATCH_SIZE) : rows;

    if (allRows.length + batch.length > MAX_EXPORT_ROWS) {
      throw buildServiceError("Audit export exceeds the maximum row limit", 413, "EXPORT_TOO_LARGE", {
        details: {
          max_rows: MAX_EXPORT_ROWS
        }
      });
    }

    allRows.push(...batch);

    if (!hasMore || batch.length === 0) break;

    const last = batch[batch.length - 1];
    cursorState = { occurred_at: last.occurred_at, id: last.id };
  }

  const header = "audit_id,timestamp,actor_type,actor_id,action,entity_type,entity_id,outcome,metadata_hash,request_id";
  const lines = [header];

  for (const row of allRows) {
    const mapped = mapRow(row);
    lines.push([
      escapeCsvField(mapped.audit_id),
      escapeCsvField(mapped.ts),
      escapeCsvField(mapped.actor.type),
      escapeCsvField(mapped.actor.id),
      escapeCsvField(mapped.action),
      escapeCsvField(mapped.entity.type),
      escapeCsvField(mapped.entity.id),
      escapeCsvField(mapped.outcome),
      escapeCsvField(mapped.metadata.hash),
      escapeCsvField(mapped.request_id)
    ].join(","));
  }

  return lines.join("\n");
}
