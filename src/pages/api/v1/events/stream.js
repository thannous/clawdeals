import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { errorPayload } from "../../../../server/http/errors";
import { methodNotAllowed } from "../../../../server/http/methods";
import { acquireAgentConnectionSlot, releaseAgentConnectionSlot } from "../../../../server/sse/connections";
import {
  agentStreamKey,
  getLatestStreamId,
  opsStreamKey,
  parseStreamId,
  readAfter
} from "../../../../server/sse/store";
import {
  SSE_DEFAULT_HEARTBEAT_SECONDS,
  SSE_MAX_CONNECTION_MS,
  SSE_MAX_EVENT_BYTES,
  SSE_MAX_HEARTBEAT_SECONDS,
  SSE_MIN_HEARTBEAT_SECONDS,
  SSE_OPS_AGENT_ID_DEFAULT,
  SSE_POLL_INTERVAL_MS,
  SSE_REPLAY_WINDOW_SECONDS
} from "../../../../server/config/sse";

function getHeaderValue(req, name) {
  const value = req?.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function byteLength(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function parseBoolean(raw) {
  if (raw === true) return true;
  if (typeof raw !== "string") return false;
  const cleaned = raw.trim().toLowerCase();
  return cleaned === "true" || cleaned === "1";
}

function resolveLastEventId(req) {
  const header = getHeaderValue(req, "last-event-id");
  if (header && typeof header === "string" && header.trim()) return header.trim();

  // EventSource cannot set custom headers on the initial connection, so allow
  // clients to pass a cursor via query param for replay.
  const query = resolveParam(req.query?.last_event_id);
  if (query && typeof query === "string" && query.trim()) return query.trim();

  return null;
}

function parseTypesParam(value) {
  if (!value) return { value: null };
  if (typeof value !== "string") return { error: "types must be a string" };
  const raw = value.trim();
  if (!raw) return { value: null };

  const parts = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (parts.length > 20) {
    return { error: "types must include at most 20 items" };
  }

  const typeSet = new Set();
  const re = /^[a-z0-9][a-z0-9._-]{0,63}$/;
  for (const part of parts) {
    const normalized = part.toLowerCase();
    if (!re.test(normalized)) {
      return { error: `Invalid type: ${part}` };
    }
    typeSet.add(normalized);
  }

  return { value: typeSet };
}

function parseHeartbeatParam(value) {
  if (value === null || value === undefined || value === "") {
    return { value: SSE_DEFAULT_HEARTBEAT_SECONDS };
  }
  if (typeof value !== "string") return { error: "heartbeat must be an integer" };
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return { error: "heartbeat must be an integer" };
  if (parsed < SSE_MIN_HEARTBEAT_SECONDS || parsed > SSE_MAX_HEARTBEAT_SECONDS) {
    return {
      error: `heartbeat must be between ${SSE_MIN_HEARTBEAT_SECONDS} and ${SSE_MAX_HEARTBEAT_SECONDS}`
    };
  }
  return { value: parsed };
}

function sseWritePing(res) {
  res.write(": ping\n\n");
  try {
    // When compression is enabled, `flush()` helps ensure small SSE frames are sent immediately.
    res.flush?.();
  } catch (error) {
    // Ignore flush errors (e.g. if the connection is already closed).
  }
}

function sseWriteEvent(res, { id, event, data }) {
  if (id) res.write(`id: ${id}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
  try {
    res.flush?.();
  } catch (error) {
    // Ignore flush errors (e.g. if the connection is already closed).
  }
}

function buildEventJson({ id, type, ts, rawData }) {
  let parsed;
  try {
    parsed = rawData ? JSON.parse(rawData) : null;
  } catch (error) {
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

  // Enforce a strict size cap on what we send to clients.
  let json = JSON.stringify(event);
  if (byteLength(json) > SSE_MAX_EVENT_BYTES) {
    event.payload = {};
    event.payload_truncated = true;
    json = JSON.stringify(event);
    if (byteLength(json) > SSE_MAX_EVENT_BYTES) {
      return { error: "size_cap" };
    }
  }

  return { value: json };
}

export const config = {
  api: {
    externalResolver: true,
    bodyParser: false,
    responseLimit: false
  }
};

export async function handler(req, res, ctx) {
  if (req.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const isProd = process.env.NODE_ENV === "production";

  const opsAgentId = process.env.CONSOLE_OPS_AGENT_ID || SSE_OPS_AGENT_ID_DEFAULT;

  let audience = null;
  if (ctx?.actor?.type === "owner" && ctx?.ownerId && !isProd) {
    audience = "ops";
  } else if (ctx?.actor?.type === "agent" && ctx?.agentId) {
    audience = ctx.agentId === opsAgentId ? "ops" : "agent";
  } else {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Authentication required"));
  }

  const acceptHeader = getHeaderValue(req, "accept");
  if (!acceptHeader || !String(acceptHeader).toLowerCase().includes("text/event-stream")) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Accept must include text/event-stream"));
  }

  const typesParam = resolveParam(req.query?.types);
  const typesParsed = parseTypesParam(typesParam);
  if (typesParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", typesParsed.error));
  }
  const typeFilter = typesParsed.value;

  const heartbeatParam = resolveParam(req.query?.heartbeat);
  const heartbeatParsed = parseHeartbeatParam(heartbeatParam);
  if (heartbeatParsed.error) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", heartbeatParsed.error));
  }
  const heartbeatSeconds = heartbeatParsed.value;

  const replay = parseBoolean(resolveParam(req.query?.replay));
  const asMessage = parseBoolean(resolveParam(req.query?.as_message));

  const connId = ctx?.requestId || `${Date.now()}-${Math.random()}`;
  let slotAcquired = false;
  if (audience === "agent") {
    const slot = await acquireAgentConnectionSlot({ agentId: ctx.agentId, connId });
    if (!slot.ok) {
      return jsonResponse(429, errorPayload("RATE_LIMITED", "Too many concurrent SSE connections", slot));
    }
    slotAcquired = true;
  }

  const streamKey = audience === "ops" ? opsStreamKey() : agentStreamKey(ctx.agentId);

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Request-Id": ctx?.requestId || "",
    "X-SSE-Audience": audience
  });
  res.flushHeaders?.();

  console.info("sse.client_connected", {
    audience,
    agent_id: ctx?.agentId || null,
    owner_id: ctx?.ownerId || null,
    request_id: ctx?.requestId || null
  });

  sseWritePing(res);

  let closed = false;
  let pollInFlight = false;
  let cursorId = null;
  let heartbeatTimer = null;
  let pollTimer = null;
  let maxConnTimer = null;

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (maxConnTimer) clearTimeout(maxConnTimer);
    if (slotAcquired) {
      await releaseAgentConnectionSlot({ agentId: ctx.agentId, connId });
    }
    console.info("sse.client_disconnected", {
      audience,
      agent_id: ctx?.agentId || null,
      owner_id: ctx?.ownerId || null,
      request_id: ctx?.requestId || null
    });
  };

  req.on?.("close", () => {
    if (!res.writableEnded) res.end();
    cleanup();
  });
  res.on?.("close", cleanup);

  heartbeatTimer = setInterval(() => {
    if (res.writableEnded) return;
    sseWritePing(res);
  }, heartbeatSeconds * 1000);

  maxConnTimer = setTimeout(() => {
    if (!res.writableEnded) res.end();
  }, SSE_MAX_CONNECTION_MS);

  const lastEventId = resolveLastEventId(req);

  // cursor init: either replay (if enabled) or start from the current end of stream.
  if (replay && lastEventId && typeof lastEventId === "string") {
    const parsed = parseStreamId(lastEventId);
    const windowMs = SSE_REPLAY_WINDOW_SECONDS * 1000;
    const tooOld = !parsed || Date.now() - parsed.ms > windowMs;
    if (tooOld) {
      console.info("sse.gap", { last_event_id: lastEventId, window_seconds: SSE_REPLAY_WINDOW_SECONDS });
      const gapPayload = JSON.stringify({
        v: 1,
        id: `gap-${Date.now()}`,
        type: "sse.gap",
        ts: new Date().toISOString(),
        payload: {
          last_event_id: lastEventId,
          replay: false,
          replay_window_seconds: SSE_REPLAY_WINDOW_SECONDS
        }
      });
      sseWriteEvent(res, { event: asMessage ? "message" : "sse.gap", data: gapPayload });
      cursorId = (await getLatestStreamId(streamKey)) || "0-0";
    } else {
      const replayEntries = await readAfter(streamKey, lastEventId, 200);
      if (replayEntries.length > 0) {
        console.info("sse.replay_hit", { count: replayEntries.length });
      } else {
        console.info("sse.replay_miss", { last_event_id: lastEventId });
      }
      for (const entry of replayEntries) {
        if (res.writableEnded) break;
        if (entry?.id) cursorId = entry.id;
        const type = entry?.type;
        if (!type) continue;
        if (typeFilter && !typeFilter.has(type)) continue;

        const ts = entry?.ts || new Date().toISOString();
        const built = buildEventJson({ id: entry.id, type, ts, rawData: entry.data });
        if (built.error) {
          console.info("sse.event_skipped", { type, reason: built.error });
          continue;
        }
        sseWriteEvent(res, { id: entry.id, event: asMessage ? "message" : type, data: built.value });
        console.info("sse.event_sent", { type });
      }
      cursorId = cursorId || lastEventId;
    }
  } else {
    cursorId = (await getLatestStreamId(streamKey)) || "0-0";
  }

  pollTimer = setInterval(async () => {
    if (res.writableEnded || closed) return;
    if (pollInFlight) return;
    pollInFlight = true;
    try {
      const entries = await readAfter(streamKey, cursorId, 50);
      if (!entries || entries.length === 0) return;

      // Always advance the cursor to avoid getting stuck on filtered or invalid events.
      const last = entries[entries.length - 1];
      if (last?.id) cursorId = last.id;

      for (const entry of entries) {
        if (res.writableEnded || closed) break;
        const type = entry?.type;
        if (!type) continue;
        if (typeFilter && !typeFilter.has(type)) continue;

        const ts = entry?.ts || new Date().toISOString();
        const built = buildEventJson({ id: entry.id, type, ts, rawData: entry.data });
        if (built.error) {
          console.info("sse.event_skipped", { type, reason: built.error });
          continue;
        }

        sseWriteEvent(res, { id: entry.id, event: asMessage ? "message" : type, data: built.value });
        console.info("sse.event_sent", { type });
      }
    } finally {
      pollInFlight = false;
    }
  }, SSE_POLL_INTERVAL_MS);

  return null;
}

export default withApiMiddlewares(handler, {
  enableIdempotency: false,
  enableAudit: false
});
