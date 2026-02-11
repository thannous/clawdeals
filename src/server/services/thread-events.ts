import { getRedis } from "../redis/upstash";
import { getLatestStreamId, readAfter } from "../sse/store";
import { SSE_MAX_EVENT_BYTES, SSE_STREAM_TRIM_MAXLEN, SSE_STREAM_TTL_SECONDS } from "../config/sse";

function byteLength(value: any) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

export function threadStreamKey(threadId: string) {
  return `thread:stream:v1:${threadId}`;
}

export async function getLatestThreadEventId(threadId: string) {
  const latest = await getLatestStreamId(threadStreamKey(threadId));
  return latest || "0-0";
}

export async function readThreadEventsAfter(threadId: string, afterId: string, limit = 50) {
  return readAfter(threadStreamKey(threadId), afterId, limit);
}

export async function publishThreadEvent({
  threadId,
  type,
  actor,
  entity,
  payload,
  ts
}: any = {}) {
  if (!threadId || typeof threadId !== "string") {
    throw new Error("publishThreadEvent threadId is required");
  }
  if (!type || typeof type !== "string") {
    throw new Error("publishThreadEvent type is required");
  }

  const event = {
    v: 1,
    type: type.toLowerCase(),
    ts: typeof ts === "string" && ts ? ts : new Date().toISOString(),
    actor: actor && typeof actor === "object" ? actor : { type: "system", id: "clawdeals" },
    entity: entity && typeof entity === "object" ? entity : null,
    payload: payload && typeof payload === "object" ? payload : {}
  };

  let data = JSON.stringify(event);
  if (byteLength(data) > SSE_MAX_EVENT_BYTES) {
    const truncated = {
      ...event,
      payload: {},
      payload_truncated: true
    };
    data = JSON.stringify(truncated);
    if (byteLength(data) > SSE_MAX_EVENT_BYTES) {
      console.info("thread_events.payload_dropped", { type: event.type, reason: "size_cap" });
      return { ok: false, reason: "size_cap" };
    }
  }

  const redis = getRedis();
  const key = threadStreamKey(threadId);
  const trim = { type: "MAXLEN", threshold: SSE_STREAM_TRIM_MAXLEN, comparison: "~" };

  try {
    const id = await redis.xadd(
      key,
      "*",
      {
        type: event.type,
        ts: event.ts,
        data
      },
      { trim }
    );
    await redis.expire(key, SSE_STREAM_TTL_SECONDS);
    return { ok: true, id };
  } catch (error: any) {
    console.info("thread_events.redis_error", { op: "xadd", error: error?.message || String(error) });
    return { ok: false, reason: "redis_error" };
  }
}

