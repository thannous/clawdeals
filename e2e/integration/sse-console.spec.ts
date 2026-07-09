import { test, expect } from "./helpers/fixtures";

import { assertIntegrationEnv } from "./helpers/env";
import { sleep } from "./helpers/ids";
import { createRedis, openSse, waitForSseFrame } from "./helpers/sse";

assertIntegrationEnv();

test.describe.serial("Integration: Console Live Feed (SSE)", () => {
  test.setTimeout(60000);

  test("console SSE connect + heartbeat", async ({ consoleCookieHeader }) => {
    const { res, controller } = await openSse("/api/console/events/stream?heartbeat=1", {
      headers: {
        Accept: "text/event-stream",
        Cookie: consoleCookieHeader
      }
    });

    try {
      expect(res.status).toBe(200);
      expect(String(res.headers.get("content-type") || "")).toContain("text/event-stream");
      expect(res.headers.get("x-sse-audience")).toBe("ops");

      const frame = await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });
      expect(frame.type).toBe("comment");
    } finally {
      controller.abort();
    }
  });

  test("console SSE receives published ops events", async ({ consoleCookieHeader }) => {
    const redis = createRedis();
    const opsKey = "sse:stream:ops:v1";

    const { res, controller } = await openSse("/api/console/events/stream?heartbeat=1", {
      headers: {
        Accept: "text/event-stream",
        Cookie: consoleCookieHeader
      }
    });

    try {
      expect(res.status).toBe(200);

      await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const ts = new Date().toISOString();
      await redis.xadd(opsKey, "*", {
        type: "deal.created",
        ts,
        data: JSON.stringify({ v: 1, type: "deal.created", ts, payload: { console_test: true } })
      });

      const event = await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => {
          if (entry.type !== "event" || entry.event !== "deal.created") return undefined;
          try {
            const data = JSON.parse(entry.data);
            if (data?.payload?.console_test === true) return entry;
          } catch {
            return undefined;
          }
          return undefined;
        }
      });

      if (event.type !== "event") {
        throw new Error("Expected SSE event frame");
      }
      expect(event.event).toBe("deal.created");
      const data = JSON.parse(event.data);
      expect(data.type).toBe("deal.created");
    } finally {
      controller.abort();
    }
  });

  test("console SSE types filter", async ({ consoleCookieHeader }) => {
    const redis = createRedis();
    const opsKey = "sse:stream:ops:v1";

    const { res, controller } = await openSse("/api/console/events/stream?heartbeat=1&types=deal.created", {
      headers: {
        Accept: "text/event-stream",
        Cookie: consoleCookieHeader
      }
    });

    try {
      expect(res.status).toBe(200);

      await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const ts1 = new Date().toISOString();
      await redis.xadd(opsKey, "*", {
        type: "watchlist.match",
        ts: ts1,
        data: JSON.stringify({ v: 1, type: "watchlist.match", ts: ts1, payload: {} })
      });

      const ts2 = new Date().toISOString();
      await redis.xadd(opsKey, "*", {
        type: "deal.created",
        ts: ts2,
        data: JSON.stringify({ v: 1, type: "deal.created", ts: ts2, payload: { filtered: true } })
      });

      const event = await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => {
          if (entry.type !== "event" || entry.event !== "deal.created") return undefined;
          try {
            const data = JSON.parse(entry.data);
            if (data?.payload?.filtered === true) return entry;
          } catch {
            return undefined;
          }
          return undefined;
        }
      });

      if (event.type !== "event") {
        throw new Error("Expected SSE event frame");
      }
      expect(event.event).toBe("deal.created");
    } finally {
      controller.abort();
    }
  });

  test("console SSE replay via Last-Event-ID", async ({ consoleCookieHeader }) => {
    const redis = createRedis();
    const opsKey = "sse:stream:ops:v1";

    const ts1 = new Date().toISOString();
    const id1 = await redis.xadd(opsKey, "*", {
      type: "deal.created",
      ts: ts1,
      data: JSON.stringify({ v: 1, type: "deal.created", ts: ts1, payload: { n: 1 } })
    });
    await sleep(25);
    const ts2 = new Date().toISOString();
    const id2 = await redis.xadd(opsKey, "*", {
      type: "deal.created",
      ts: ts2,
      data: JSON.stringify({ v: 1, type: "deal.created", ts: ts2, payload: { n: 2 } })
    });

    const { res, controller } = await openSse("/api/console/events/stream?replay=true&heartbeat=1&types=deal.created", {
      headers: {
        Accept: "text/event-stream",
        Cookie: consoleCookieHeader,
        "Last-Event-ID": id1
      }
    });

    try {
      expect(res.status).toBe(200);

      const replayed = await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => {
          if (entry.type !== "event" || entry.event !== "deal.created") return undefined;
          try {
            const data = JSON.parse(entry.data);
            if (data?.payload?.n === 2) return entry;
          } catch {
            return undefined;
          }
          return undefined;
        }
      });

      if (replayed.type !== "event") {
        throw new Error("Expected SSE event frame");
      }
      expect(replayed.id).toBe(id2);
    } finally {
      controller.abort();
    }
  });
});
