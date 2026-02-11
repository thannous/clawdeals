import { redactValue, DEFAULT_REDACT_KEYS } from "../audit/redaction";
import { getRedis } from "../redis/upstash";
import {
  SSE_MAX_EVENT_BYTES,
  SSE_STREAM_TRIM_MAXLEN,
  SSE_STREAM_TTL_SECONDS
} from "../config/sse";

function byteLength(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function parseStreamId(value) {
  if (!value || typeof value !== "string") return null;
  const [msRaw, seqRaw] = value.split("-");
  if (!msRaw || !seqRaw) return null;
  const ms = Number(msRaw);
  const seq = Number(seqRaw);
  if (!Number.isFinite(ms) || !Number.isFinite(seq)) return null;
  return { ms, seq };
}

function compareStreamIds(a, b) {
  const pa = parseStreamId(a);
  const pb = parseStreamId(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.ms !== pb.ms) return pa.ms - pb.ms;
  return pa.seq - pb.seq;
}

function normalizeStreamMap(map) {
  if (!map || typeof map !== "object") return [];
  const ids = Object.keys(map);
  ids.sort(compareStreamIds);
  return ids.map((id) => ({ id, fields: map[id] || {} }));
}

export function opsStreamKey() {
  return "sse:stream:ops:v1";
}

export function agentStreamKey(agentId) {
  return `sse:stream:agent:v1:${agentId}`;
}

export function threadStreamKey(threadId) {
  return `sse:stream:thread:v1:${threadId}`;
}

export async function getLatestStreamId(key) {
  const redis = getRedis();
  let result;
  try {
    result = await redis.xrevrange(key, "+", "-", 1);
  } catch (error) {
    console.info("sse.redis_error", { op: "xrevrange", error: error?.message || String(error) });
    return null;
  }

  const entries = normalizeStreamMap(result);
  if (entries.length === 0) return null;
  return entries[entries.length - 1].id;
}

export async function readAfter(key, afterId, limit = 50) {
  const redis = getRedis();
  const start = afterId ? `(${afterId}` : "0-0";
  let result;
  try {
    result = await redis.xrange(key, start, "+", limit);
  } catch (error) {
    console.info("sse.redis_error", { op: "xrange", error: error?.message || String(error) });
    return [];
  }

  const entries = normalizeStreamMap(result);
  return entries.map(({ id, fields }) => ({
    id,
    type: typeof fields.type === "string" ? fields.type : null,
    ts: typeof fields.ts === "string" ? fields.ts : null,
    // @upstash/redis automatically JSON-parses stream field values when possible.
    // We store `data` as a JSON string, so reads can come back as an object.
    data:
      typeof fields.data === "string"
        ? fields.data
        : fields.data != null
          ? JSON.stringify(fields.data)
          : null
  }));
}

function redactEventPayload(event) {
  const redactKeys = new Set([...DEFAULT_REDACT_KEYS, "ip", "user_agent"]);
  const { value } = redactValue(event, { redactKeys });
  return value;
}

function buildEventData({ type, actor, entity, payload, ts }: any = {}) {
  if (!type || typeof type !== "string") {
    throw new Error("buildEventData type is required");
  }

  const event = {
    v: 1,
    type,
    ts: typeof ts === "string" && ts ? ts : new Date().toISOString(),
    actor: actor && typeof actor === "object" ? actor : { type: "system", id: "clawdeals" },
    entity: entity && typeof entity === "object" ? entity : null,
    payload: payload && typeof payload === "object" ? payload : {}
  };

  const redacted = redactEventPayload(event);

  let data = JSON.stringify(redacted);
  if (byteLength(data) > SSE_MAX_EVENT_BYTES) {
    const truncated = {
      ...redacted,
      payload: {},
      payload_truncated: true
    };
    data = JSON.stringify(truncated);
    if (byteLength(data) > SSE_MAX_EVENT_BYTES) {
      return { ok: false, reason: "size_cap" };
    }
  }

  return { ok: true, ts: event.ts, data };
}

export async function publishSseEvent({
  audienceType,
  audienceId,
  type,
  actor,
  entity,
  payload,
  ts
}: any = {}) {
  if (!audienceType || (audienceType !== "agent" && audienceType !== "ops")) {
    throw new Error("publishSseEvent audienceType must be 'agent' or 'ops'");
  }
  if (audienceType === "agent" && !audienceId) {
    throw new Error("publishSseEvent audienceId is required for agent audience");
  }
  if (!type || typeof type !== "string") {
    throw new Error("publishSseEvent type is required");
  }

  const built = buildEventData({ type, actor, entity, payload, ts });
  if (!built.ok) {
    console.info("sse.payload_dropped", { type, reason: built.reason });
    return { ok: false, reason: built.reason };
  }

  const redis = getRedis();
  const trim = { type: "MAXLEN", threshold: SSE_STREAM_TRIM_MAXLEN, comparison: "~" };

  const keys = [];
  if (audienceType === "ops") {
    keys.push(opsStreamKey());
  } else {
    keys.push(agentStreamKey(audienceId));
    // Ops should see everything. Duplicating agent-targeted events keeps the ops stream complete.
    keys.push(opsStreamKey());
  }

  const ids: any = {};

  for (const key of keys) {
    try {
      const id = await redis.xadd(
        key,
        "*",
        {
          type,
          ts: built.ts,
          data: built.data
        },
        { trim }
      );
      ids[key] = id;
      // Keep streams on a TTL to avoid unbounded growth.
      await redis.expire(key, SSE_STREAM_TTL_SECONDS);
    } catch (error) {
      console.info("sse.redis_error", { op: "xadd", error: error?.message || String(error) });
      return { ok: false, reason: "redis_error" };
    }
  }

  return {
    ok: true,
    ids
  };
}

export async function publishThreadEvent({ threadId, type, actor, entity, payload, ts }: any = {}) {
  if (!threadId || typeof threadId !== "string") {
    throw new Error("publishThreadEvent threadId is required");
  }
  if (!type || typeof type !== "string") {
    throw new Error("publishThreadEvent type is required");
  }

  const built = buildEventData({ type, actor, entity, payload, ts });
  if (!built.ok) {
    console.info("thread_events.payload_dropped", { type, reason: built.reason });
    return { ok: false, reason: built.reason };
  }

  const redis = getRedis();
  const trim = { type: "MAXLEN", threshold: SSE_STREAM_TRIM_MAXLEN, comparison: "~" };
  const key = threadStreamKey(threadId);

  try {
    const id = await redis.xadd(
      key,
      "*",
      {
        type,
        ts: built.ts,
        data: built.data
      },
      { trim }
    );
    await redis.expire(key, SSE_STREAM_TTL_SECONDS);
    return { ok: true, id };
  } catch (error) {
    console.info("thread_events.redis_error", { op: "xadd", error: error?.message || String(error) });
    return { ok: false, reason: "redis_error" };
  }
}

export { parseStreamId };
