import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { getThread } from "../../../../../server/services/threads";
import { isUuid } from "../../../../../server/utils/validators";
import { getLatestStreamId, parseStreamId, readAfter, threadStreamKey } from "../../../../../server/sse/store";

const WATCH_DEFAULT_LIMIT = 50;
const WATCH_MAX_LIMIT = 200;
const WATCH_DEFAULT_TIMEOUT_MS = 25000;
const WATCH_MAX_TIMEOUT_MS = 25000;
const WATCH_POLL_INTERVAL_MS = 250;
const STREAM_CURSOR_RE = /^\d+-\d+$/;

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function parseOptionalInteger(value: any, name: string) {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return { error: `${name} must be an integer` };
    return { value };
  }
  if (typeof value !== "string") return { error: `${name} must be an integer` };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (!/^[+-]?\d+$/.test(trimmed)) return { error: `${name} must be an integer` };
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n)) return { error: `${name} must be an integer` };
  return { value: n };
}

function parseCursor(value: any) {
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string") return { error: "cursor must be a string" };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (!STREAM_CURSOR_RE.test(trimmed)) return { error: "cursor must be a valid stream cursor" };
  if (!parseStreamId(trimmed)) return { error: "cursor must be a valid stream cursor" };
  return { value: trimmed };
}

function parseTypes(value: any) {
  if (value === undefined || value === null) return { value: null };
  if (!Array.isArray(value)) return { error: "types must be an array" };
  if (value.length > 20) return { error: "types must include at most 20 items" };

  const typeSet = new Set<string>();
  const re = /^[a-z0-9][a-z0-9._-]{0,63}$/;

  for (const part of value) {
    if (typeof part !== "string") return { error: "types must be an array of strings" };
    const raw = part.trim();
    if (!raw) continue;
    const normalized = raw.toLowerCase();
    if (!re.test(normalized)) return { error: `Invalid type: ${part}` };
    typeSet.add(normalized);
  }

  return { value: typeSet.size > 0 ? typeSet : null };
}

function safeJsonParse(value: any) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const agentId = ctx?.agentId || null;
  if (!agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const rawId = resolveParam(req.query?.id);
  const idParam = String(rawId || "").trim();
  if (!idParam) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }
  const actionMatch = idParam.match(/^([^:]+):([^:]+)$/);
  if (!actionMatch) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }
  const threadId = actionMatch[1];
  const action = actionMatch[2];
  if (!isUuid(threadId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "thread_id must be a UUID"));
  }
  if (action !== "watch") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }

  if (ctx) {
    ctx.auditEvent = "thread.watched";
    ctx.auditEntityType = "thread";
    ctx.auditEntityId = threadId;
  }

  const thread = await getThread(threadId);
  if (!thread) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
  }

  const isBuyer = thread.buyer_agent_id === agentId;
  const isSeller = thread.seller_agent_id === agentId;
  if (!isBuyer && !isSeller) {
    // Anti-enumeration: pretend it doesn't exist.
    return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
  }

  const body = req.body || {};

  const cursorParsed = parseCursor(body.cursor);
  if (cursorParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", cursorParsed.error));
  }
  const cursorRaw = cursorParsed.value;

  const timeoutParsed = parseOptionalInteger(body.timeout_ms, "timeout_ms");
  if (timeoutParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", timeoutParsed.error));
  }
  const timeoutMsRaw = timeoutParsed.value;
  const timeoutMs =
    timeoutMsRaw === null
      ? WATCH_DEFAULT_TIMEOUT_MS
      : timeoutMsRaw < 0
        ? 0
        : Math.min(timeoutMsRaw, WATCH_MAX_TIMEOUT_MS);

  const limitParsed = parseOptionalInteger(body.limit, "limit");
  if (limitParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", limitParsed.error));
  }
  const limitRaw = limitParsed.value;
  const limit =
    limitRaw === null
      ? WATCH_DEFAULT_LIMIT
      : limitRaw < 1
        ? 1
        : Math.min(limitRaw, WATCH_MAX_LIMIT);

  const typesParsed = parseTypes(body.types);
  if (typesParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", typesParsed.error));
  }
  const typeFilter: Set<string> | null = typesParsed.value;

  const key = threadStreamKey(threadId);
  let cursorId = cursorRaw;
  if (!cursorId) {
    cursorId = (await getLatestStreamId(key)) || "0-0";
  }

  let closed = false;
  req.on?.("close", () => {
    closed = true;
  });

  const start = Date.now();

  while (!closed) {
    const entries: any[] = await readAfter(key, cursorId, limit);
    if (entries && entries.length > 0) {
      // Always advance the cursor to avoid getting stuck on filtered/invalid events.
      const last = entries[entries.length - 1];
      if (last?.id) cursorId = last.id;

      const events = [];
      for (const entry of entries) {
        const type = entry?.type;
        if (!type) continue;
        if (typeFilter && !typeFilter.has(type)) continue;

        const parsed = safeJsonParse(entry?.data);
        if (!parsed) continue;
        events.push({
          id: entry.id,
          type,
          ts: entry?.ts || null,
          data: parsed
        });
      }

      if (events.length > 0) {
        return jsonResponse(200, { events, next_cursor: cursorId });
      }
    }

    const elapsed = Date.now() - start;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) break;
    await sleep(Math.min(WATCH_POLL_INTERVAL_MS, remaining));
  }

  return jsonResponse(200, { events: [], next_cursor: cursorId });
}

export default withApiMiddlewares(handler, {
  routeGroup: "threads.read",
  enableIdempotency: false
});
