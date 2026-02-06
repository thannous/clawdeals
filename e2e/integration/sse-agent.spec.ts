import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, sleep } from "./helpers/ids";
import { createSupabaseAdmin, setupAgent } from "./helpers/supabase";
import { createRedis, openSse, waitForSseFrame } from "./helpers/sse";

assertIntegrationEnv();

test.describe.serial("Integration: SSE (Agent)", () => {
  test.setTimeout(60000);

  test("sse connect + heartbeat", async () => {
    const supabase = createSupabaseAdmin();
    const agent = await setupAgent(supabase);

    const { res, controller } = await openSse("/api/v1/events/stream?heartbeat=1&types=watchlist.match", {
      headers: {
        Authorization: `Bearer ${agent.apiKey}`,
        Accept: "text/event-stream"
      }
    });

    try {
      expect(res.status).toBe(200);
      expect(res.headers.get("x-sse-audience")).toBe("agent");
      expect(String(res.headers.get("content-type") || "")).toContain("text/event-stream");

      const frame = await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });
      expect(frame.type).toBe("comment");
    } finally {
      controller.abort();
    }
  });

  test("sse publish + types filter", async () => {
    const supabase = createSupabaseAdmin();
    const agent = await setupAgent(supabase);
    const redis = createRedis();

    const agentKey = `sse:stream:agent:v1:${agent.agent.id}`;
    const seedTs = new Date().toISOString();
    const seedId = await redis.xadd(agentKey, "*", {
      type: "test.seed",
      ts: seedTs,
      data: JSON.stringify({ v: 1, type: "test.seed", ts: seedTs, payload: {} })
    });

    const { res, controller } = await openSse("/api/v1/events/stream?replay=true&heartbeat=1&types=watchlist.match", {
      headers: {
        Authorization: `Bearer ${agent.apiKey}`,
        Accept: "text/event-stream",
        "Last-Event-ID": seedId
      }
    });

    try {
      expect(res.status).toBe(200);

      // Wait for the initial ping so we know the stream is up.
      await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const dealTs = new Date().toISOString();
      await redis.xadd(agentKey, "*", {
        type: "deal.created",
        ts: dealTs,
        data: JSON.stringify({ v: 1, type: "deal.created", ts: dealTs, payload: { test: true } })
      });

      const matchTs = new Date().toISOString();
      await redis.xadd(agentKey, "*", {
        type: "watchlist.match",
        ts: matchTs,
        data: JSON.stringify({ v: 1, type: "watchlist.match", ts: matchTs, payload: { deal_id: randomId() } })
      });

      const firstEvent = await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "event" ? entry : undefined)
      });

      expect(firstEvent.type).toBe("event");
      if (firstEvent.type !== "event") {
        throw new Error("Expected SSE event frame");
      }
      expect(firstEvent.event).toBe("watchlist.match");
    } finally {
      controller.abort();
    }
  });

  test("sse replay minimal via Last-Event-ID", async () => {
    const supabase = createSupabaseAdmin();
    const agent = await setupAgent(supabase);
    const redis = createRedis();

    const agentKey = `sse:stream:agent:v1:${agent.agent.id}`;
    const ts1 = new Date().toISOString();
    const id1 = await redis.xadd(agentKey, "*", {
      type: "watchlist.match",
      ts: ts1,
      data: JSON.stringify({ v: 1, type: "watchlist.match", ts: ts1, payload: { n: 1 } })
    });
    await sleep(25);
    const ts2 = new Date().toISOString();
    const id2 = await redis.xadd(agentKey, "*", {
      type: "watchlist.match",
      ts: ts2,
      data: JSON.stringify({ v: 1, type: "watchlist.match", ts: ts2, payload: { n: 2 } })
    });

    const { res, controller } = await openSse("/api/v1/events/stream?replay=true&heartbeat=1&types=watchlist.match", {
      headers: {
        Authorization: `Bearer ${agent.apiKey}`,
        Accept: "text/event-stream",
        "Last-Event-ID": id1
      }
    });

    try {
      expect(res.status).toBe(200);

      const replayed = await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "event" && entry.event === "watchlist.match" ? entry : undefined)
      });

      if (replayed.type !== "event") {
        throw new Error("Expected SSE event frame");
      }
      expect(replayed.id).toBe(id2);
    } finally {
      controller.abort();
    }
  });

  test("sse concurrency limit (2 per agent)", async () => {
    const supabase = createSupabaseAdmin();
    const agent = await setupAgent(supabase);

    const headers = {
      Authorization: `Bearer ${agent.apiKey}`,
      Accept: "text/event-stream"
    };

    const conn1 = await openSse("/api/v1/events/stream?heartbeat=1&types=watchlist.match", { headers });
    const conn2 = await openSse("/api/v1/events/stream?heartbeat=1&types=watchlist.match", { headers });

    try {
      expect(conn1.res.status).toBe(200);
      expect(conn2.res.status).toBe(200);

      await waitForSseFrame(conn1.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });
      await waitForSseFrame(conn2.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const conn3 = await openSse("/api/v1/events/stream?heartbeat=1&types=watchlist.match", { headers });
      try {
        expect(conn3.res.status).toBe(429);
      } finally {
        conn3.controller.abort();
      }
    } finally {
      conn1.controller.abort();
      conn2.controller.abort();
    }

    // Give the server a moment to release slots.
    await sleep(300);

    let ok = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const conn = await openSse("/api/v1/events/stream?heartbeat=1&types=watchlist.match", { headers });
      if (conn.res.status === 200) {
        try {
          await waitForSseFrame(conn.res, {
            timeoutMs: 2500,
            onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
          });
          ok = true;
          break;
        } finally {
          conn.controller.abort();
        }
      } else {
        conn.controller.abort();
      }
      await sleep(200);
    }

    expect(ok).toBe(true);
  });
});
