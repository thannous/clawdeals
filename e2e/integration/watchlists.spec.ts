import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, sha256Hex } from "./helpers/ids";
import { waitForAuditLog } from "./helpers/audit";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, setupAgent } from "./helpers/supabase";
import { openSse, waitForSseFrame } from "./helpers/sse";

assertIntegrationEnv();

test.describe.serial("Integration: Watchlists", () => {
  test.setTimeout(60000);

  test("watchlists CRUD + idempotency + authz + quota", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const startedAt = new Date().toISOString();

    const agentA = await setupAgent(supabase);
    const agentB = await setupAgent(supabase);

    const payload = {
      name: "RTX 4070 IDF",
      criteria: {
        query: "RTX 4070",
        tags: ["gpu", "nvidia"],
        price_max: 450
      },
      active: true
    };

    const idemKey = randomId();
    const createAuditRequestId = randomId();
    const first = await request.post("/api/v1/watchlists", {
      headers: { Authorization: `Bearer ${agentA.apiKey}`, "Idempotency-Key": idemKey, "x-request-id": createAuditRequestId },
      data: payload
    });
    await expectStatus(first, 201);
    const firstBody = await first.json();
    expect(firstBody.watchlist_id).toBeTruthy();
    expect(firstBody.agent_id).toBe(agentA.agent.id);

    const replay = await request.post("/api/v1/watchlists", {
      headers: { Authorization: `Bearer ${agentA.apiKey}`, "Idempotency-Key": idemKey },
      data: payload
    });
    await expectStatus(replay, 201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    const replayBody = await replay.json();
    expect(replayBody.watchlist_id).toBe(firstBody.watchlist_id);

    const mismatch = await request.post("/api/v1/watchlists", {
      headers: { Authorization: `Bearer ${agentA.apiKey}`, "Idempotency-Key": idemKey },
      data: { ...payload, name: "Different name" }
    });
    expect(mismatch.status()).toBe(409);
    const mismatchBody = await mismatch.json();
    expect(mismatchBody.error.code).toBe("IDEMPOTENCY_KEY_REUSE");

    const createAudit = await waitForAuditLog(supabase, "watchlist.created", 10, startedAt, createAuditRequestId);
    expect(createAudit).not.toBeNull();
    expect(createAudit.outcome).toBe("SUCCESS");

    const blockedAuditRequestId = randomId();
    const forbidden = await request.get(`/api/v1/watchlists/${firstBody.watchlist_id}`, {
      headers: { Authorization: `Bearer ${agentB.apiKey}`, "x-request-id": blockedAuditRequestId }
    });
    expect(forbidden.status()).toBe(404);
    const forbiddenBody = await forbidden.json();
    expect(forbiddenBody.error.code).toBe("NOT_FOUND");

    const blockedAudit = await waitForAuditLog(supabase, "watchlist.get", 10, startedAt, blockedAuditRequestId);
    expect(blockedAudit).not.toBeNull();
    expect(blockedAudit.outcome).toBe("BLOCKED");

    const updateKey = randomId();
    const updated = await request.patch(`/api/v1/watchlists/${firstBody.watchlist_id}`, {
      headers: { Authorization: `Bearer ${agentA.apiKey}`, "Idempotency-Key": updateKey },
      data: { active: false }
    });
    await expectStatus(updated, 200);
    const updatedBody = await updated.json();
    expect(updatedBody.active).toBe(false);

    const list = await request.get("/api/v1/watchlists?active=true&limit=50", {
      headers: { Authorization: `Bearer ${agentA.apiKey}` }
    });
    await expectStatus(list, 200);
    const listBody = await list.json();
    const ids = (listBody.items || []).map((item: any) => item.watchlist_id);
    expect(ids).not.toContain(firstBody.watchlist_id);

    const deleteKey = randomId();
    const deleted = await request.delete(`/api/v1/watchlists/${firstBody.watchlist_id}`, {
      headers: { Authorization: `Bearer ${agentA.apiKey}`, "Idempotency-Key": deleteKey }
    });
    await expectStatus(deleted, 200);
    const deletedBody = await deleted.json();
    expect(deletedBody.deleted).toBe(true);

    const seed = Array.from({ length: 50 }, (_, index) => ({
      agent_id: agentB.agent.id,
      name: `WL ${index}`,
      active: true,
      criteria: { tags: ["gpu"] },
      tags: ["gpu"]
    }));
    const { error: seedError } = await supabase.from("watchlists").insert(seed);
    expect(seedError).toBeNull();

    const quotaRes = await request.post("/api/v1/watchlists", {
      headers: { Authorization: `Bearer ${agentB.apiKey}`, "Idempotency-Key": randomId() },
      data: { criteria: { tags: ["gpu"] }, active: true }
    });
    expect(quotaRes.status()).toBe(409);
    const quotaBody = await quotaRes.json();
    expect(quotaBody.error.code).toBe("WATCHLIST_LIMIT_REACHED");
  });

  test("watchlist matching on deal create + matches endpoint + sse", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const agentA = await setupAgent(supabase);
    const agentB = await setupAgent(supabase);

    const matchTag = `ti190_${sha256Hex(randomId()).slice(0, 12)}`;

    const wlRes = await request.post("/api/v1/watchlists", {
      headers: { Authorization: `Bearer ${agentA.apiKey}`, "Idempotency-Key": randomId() },
      data: { name: "TI-190 match", criteria: { tags: [matchTag] }, active: true }
    });
    await expectStatus(wlRes, 201);
    const wlBody = await wlRes.json();
    const watchlistId = wlBody.watchlist_id;
    expect(watchlistId).toBeTruthy();

    const { res, controller } = await openSse("/api/v1/events/stream?heartbeat=1&types=watchlist.match", {
      headers: {
        Authorization: `Bearer ${agentA.apiKey}`,
        Accept: "text/event-stream"
      }
    });

    try {
      await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const dealRes = await request.post("/api/v1/deals", {
        headers: { Authorization: `Bearer ${agentB.apiKey}`, "Idempotency-Key": randomId() },
        data: {
          title: `TI-190 ${matchTag}`,
          url: `https://example.com/ti-190/${randomId()}`,
          price: 99.99,
          currency: "USD",
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          tags: [matchTag]
        }
      });
      await expectStatus(dealRes, 201);
      const dealBody = await dealRes.json();
      const dealId = dealBody.deal?.deal_id;
      expect(dealId).toBeTruthy();

      const { data: matchRows, error: matchError } = await supabase
        .from("watchlist_matches")
        .select("watchlist_match_id,watchlist_id,entity_type,entity_id,matched_at")
        .eq("watchlist_id", watchlistId)
        .eq("entity_type", "deal")
        .eq("entity_id", dealId);
      expect(matchError).toBeNull();
      expect(Array.isArray(matchRows) ? matchRows.length : 0).toBe(1);

      const matchesRes = await request.get(`/api/v1/watchlists/${watchlistId}/matches?entity_type=deal&limit=50`, {
        headers: { Authorization: `Bearer ${agentA.apiKey}` }
      });
      await expectStatus(matchesRes, 200);
      const matchesBody = await matchesRes.json();
      expect((matchesBody.items || []).length).toBeGreaterThan(0);
      expect(matchesBody.items[0].entity_id).toBe(dealId);
      expect(matchesBody.items[0].deal_summary.deal_id).toBe(dealId);

      const eventFrame = await waitForSseFrame(res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "watchlist.match" ? entry : undefined)
      });

      if (eventFrame.type !== "event") {
        throw new Error("Expected SSE event frame");
      }
      const parsed = JSON.parse(eventFrame.data || "{}");
      expect(parsed.type).toBe("watchlist.match");
      expect(parsed.payload?.deal_id).toBe(dealId);
      expect(parsed.payload?.watchlist_ids || []).toContain(watchlistId);
    } finally {
      controller.abort();
    }
  });
});
