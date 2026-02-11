import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getThread } from "../../../../server/services/threads";
import { getLatestThreadEventId, readThreadEventsAfter } from "../../../../server/services/thread-events";
import { parseStreamId } from "../../../../server/sse/store";
import {
  THREAD_WATCH_DEFAULT_LIMIT,
  THREAD_WATCH_DEFAULT_TIMEOUT_MS,
  THREAD_WATCH_MAX_LIMIT,
  THREAD_WATCH_MAX_TIMEOUT_MS,
  THREAD_WATCH_MAX_TYPES,
  THREAD_WATCH_POLL_INTERVAL_MS
} from "../../../../server/config/thread-watch";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCursor(value: any) {
  if (value === null || value === undefined || value === "") return { value: null };
  if (typeof value !== "string") return { error: "cursor must be a string" };
  const trimmed = value.trim();
  if (!trimmed) return { value: null };
  if (!/^\d+-\d+$/.test(trimmed)) return { error: "cursor is invalid" };
  const parsed = parseStreamId(trimmed);
  if (
    !parsed ||
    !Number.isSafeInteger(parsed.ms) ||
    !Number.isSafeInteger(parsed.seq) ||
    parsed.ms < 0 ||
    parsed.seq < 0
  ) {
    return { error: "cursor is invalid" };
  }
  return { value: trimmed };
}

function parseInteger(value: any, name: string) {
  if (value === null || value === undefined || value === "") return { value: null };
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return { error: `${name} must be an integer` };
    }
    return { value };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) {
      return { error: `${name} must be an integer` };
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed)) {
      return { error: `${name} must be an integer` };
    }
    return { value: parsed };
  }
  return { error: `${name} must be an integer` };
}

function parseTypes(value: any) {
  if (value === null || value === undefined) return { value: null };
  if (!Array.isArray(value)) return { error: "types must be an array" };
  if (value.length > THREAD_WATCH_MAX_TYPES) {
    return { error: `types must include at most ${THREAD_WATCH_MAX_TYPES} items` };
  }

  const re = /^[a-z0-9][a-z0-9._-]{0,63}$/;
  const out = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== "string") return { error: "types must be an array of strings" };
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) continue;
    if (!re.test(trimmed)) return { error: `Invalid type: ${entry}` };
    out.add(trimmed);
  }

  return { value: out.size > 0 ? out : null };
}

function buildEventObject({ id, type, ts, rawData }: { id: string; type: string; ts: string; rawData: any }) {
  let parsed: any = null;
  try {
    parsed = rawData ? JSON.parse(rawData) : null;
  } catch {
    return { error: "invalid_json" };
  }

  if (!parsed || typeof parsed !== "object") {
    parsed = {};
  }

  const event = {
    v: 1,
    ...parsed,
    id,
    type,
    ts
  };

  return { value: event };
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const idAction = String(resolveParam(req.query?.id) || "");
  const [threadId, action] = idAction.split(":");
  if (!threadId || !action) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }
  if (!isUuid(threadId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "thread_id must be a UUID"));
  }
  if (action !== "watch") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }

  const body = req.body || {};

  const cursorParsed = parseCursor(body.cursor);
  if (cursorParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", cursorParsed.error));
  }

  const timeoutParsed = parseInteger(body.timeout_ms, "timeout_ms");
  if (timeoutParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", timeoutParsed.error));
  }
  let timeoutMs =
    typeof timeoutParsed.value === "number" ? timeoutParsed.value : THREAD_WATCH_DEFAULT_TIMEOUT_MS;
  if (timeoutMs < 0 || timeoutMs > THREAD_WATCH_MAX_TIMEOUT_MS) {
    return jsonResponse(
      400,
      errorPayload("VALIDATION_ERROR", `timeout_ms must be between 0 and ${THREAD_WATCH_MAX_TIMEOUT_MS}`)
    );
  }

  const limitParsed = parseInteger(body.limit, "limit");
  if (limitParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", limitParsed.error));
  }
  let limit = typeof limitParsed.value === "number" ? limitParsed.value : THREAD_WATCH_DEFAULT_LIMIT;
  if (limit < 1 || limit > THREAD_WATCH_MAX_LIMIT) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", `limit must be between 1 and ${THREAD_WATCH_MAX_LIMIT}`));
  }

  const typesParsed = parseTypes(body.types);
  if (typesParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", typesParsed.error));
  }
  const typeFilter = typesParsed.value;

  try {
    const thread: any = await getThread(threadId);
    if (!thread) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
    }

    const isBuyer = thread.buyer_agent_id === ctx.agentId;
    const isSeller = thread.seller_agent_id === ctx.agentId;
    if (!isBuyer && !isSeller) {
      // Anti-enumeration: pretend it doesn't exist.
      return jsonResponse(404, errorPayload("NOT_FOUND", "Thread not found"));
    }

    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;

    let cursorId = cursorParsed.value;
    if (!cursorId) {
      cursorId = await getLatestThreadEventId(threadId);
    }

    const events: any[] = [];
    const scanLimit = Math.min(200, Math.max(limit, 50));
    const maxRapidScans = 5;
    let rapidScans = 0;

    while (true) {
      const now = Date.now();
      if (now > deadline) {
        break;
      }

      const entries = await readThreadEventsAfter(threadId, cursorId, scanLimit);

      if (entries && entries.length > 0) {
        for (const entry of entries) {
          if (entry?.id) cursorId = entry.id;

          const type = entry?.type;
          if (!type) continue;
          const normalizedType = String(type).toLowerCase();
          if (typeFilter && !typeFilter.has(normalizedType)) {
            continue;
          }

          const ts = entry?.ts || new Date().toISOString();
          const built = buildEventObject({ id: entry.id, type: normalizedType, ts, rawData: entry.data });
          if (built.error) {
            console.info("threads.watch_event_skipped", { type: normalizedType, reason: built.error });
            continue;
          }
          events.push(built.value);
          if (events.length >= limit) {
            break;
          }
        }

        // Return immediately once we have at least one matching event.
        if (events.length > 0) {
          break;
        }

        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;

        // Catch up quickly when a cursor is behind, but avoid busy-looping forever when
        // the stream is hot with only filtered event types.
        if (entries.length === scanLimit && rapidScans < maxRapidScans) {
          rapidScans += 1;
          continue;
        }

        rapidScans = 0;
        await sleep(Math.min(THREAD_WATCH_POLL_INTERVAL_MS, remainingMs));
        continue;
      }

      rapidScans = 0;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await sleep(Math.min(THREAD_WATCH_POLL_INTERVAL_MS, remainingMs));
    }

    return jsonResponse(
      200,
      {
        next_cursor: cursorId,
        events
      },
      { "Cache-Control": "no-store" }
    );
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler, {
  routeGroup: "threads.watch",
  enableIdempotency: false,
  enableAudit: false
});
