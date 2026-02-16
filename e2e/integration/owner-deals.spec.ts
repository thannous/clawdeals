import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, sha256Hex } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb, setupAgent } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Owner Deals API", () => {
  test.setTimeout(60000);

  let supabase: any;
  let ownerId: string;
  let agent: any;
  let apiKey: string;
  let dealIds: string[] = [];

  test.beforeAll(async () => {
    supabase = createSupabaseAdmin();

    // Setup owner + agent
    ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    agent = await createAgentDb(supabase, ownerId);
    const keyResult = await createActiveApiKeyDb(supabase, agent.id);
    apiKey = keyResult.apiKey;

    // Insert test deals directly in DB for this owner's agent
    const now = new Date();
    const nowIso = now.toISOString();
    const futureIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const pastIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const expiredCreatedAtIso = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    const deals = [
      {
        title: "Owner Deal NEW",
        source_url: `https://example.com/od/${randomId()}`,
        source_url_normalized: `https://example.com/od/${randomId()}`,
        source_url_fingerprint: sha256Hex(randomId()),
        price: 10,
        currency: "EUR",
        created_at: nowIso,
        expires_at: futureIso,
        tags: ["owner-deals-test"],
        status: "NEW",
        new_until: futureIso,
        creator_agent_id: agent.id
      },
      {
        title: "Owner Deal ACTIVE",
        source_url: `https://example.com/od/${randomId()}`,
        source_url_normalized: `https://example.com/od/${randomId()}`,
        source_url_fingerprint: sha256Hex(randomId()),
        price: 20,
        currency: "EUR",
        created_at: nowIso,
        expires_at: futureIso,
        tags: ["owner-deals-test"],
        status: "ACTIVE",
        new_until: pastIso,
        active_at: nowIso,
        creator_agent_id: agent.id
      },
      {
        title: "Owner Deal EXPIRED",
        source_url: `https://example.com/od/${randomId()}`,
        source_url_normalized: `https://example.com/od/${randomId()}`,
        source_url_fingerprint: sha256Hex(randomId()),
        price: 30,
        currency: "EUR",
        created_at: expiredCreatedAtIso,
        expires_at: pastIso,
        tags: ["owner-deals-test"],
        status: "EXPIRED",
        new_until: pastIso,
        expired_at: now.toISOString(),
        creator_agent_id: agent.id
      }
    ];

    const { data: inserted, error } = await supabase
      .from("deals")
      .insert(deals)
      .select("deal_id");
    expect(error).toBeNull();
    dealIds = (inserted || []).map((d: any) => d.deal_id);
    expect(dealIds.length).toBe(3);
  });

  // -----------------------------------------------------------------------
  // Basic auth
  // -----------------------------------------------------------------------
  test("returns 401 without auth headers", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals");
    await expectStatus(res, 401);
  });

  test("returns 405 for POST", async ({ request }) => {
    const res = await request.post("/api/v1/owner/deals", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    await expectStatus(res, 405);
  });

  // -----------------------------------------------------------------------
  // List deals for owner
  // -----------------------------------------------------------------------
  test("lists deals for authenticated owner", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.data).toBeTruthy();
    expect(Array.isArray(body.data.deals)).toBe(true);
    expect(body.data.deals.length).toBeGreaterThanOrEqual(3);

    // Verify our test deals are present
    const titles = body.data.deals.map((d: any) => d.title);
    expect(titles).toContain("Owner Deal NEW");
    expect(titles).toContain("Owner Deal ACTIVE");
    expect(titles).toContain("Owner Deal EXPIRED");
  });

  test("returns Cache-Control: no-store", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);
    expect(res.headers()["cache-control"]).toBe("no-store");
  });

  // -----------------------------------------------------------------------
  // Status filter
  // -----------------------------------------------------------------------
  test("filters by status=NEW", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals?status=NEW", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    const statuses = body.data.deals.map((d: any) => d.status);
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    for (const s of statuses) {
      expect(s).toBe("NEW");
    }
  });

  test("filters by status=ACTIVE", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals?status=ACTIVE", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    const statuses = body.data.deals.map((d: any) => d.status);
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    for (const s of statuses) {
      expect(s).toBe("ACTIVE");
    }
  });

  test("filters by status=EXPIRED", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals?status=EXPIRED", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    const statuses = body.data.deals.map((d: any) => d.status);
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    for (const s of statuses) {
      expect(s).toBe("EXPIRED");
    }
  });

  test("returns 400 for invalid status", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals?status=INVALID", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // -----------------------------------------------------------------------
  // Agent filter
  // -----------------------------------------------------------------------
  test("filters by agent_id", async ({ request }) => {
    const res = await request.get(`/api/v1/owner/deals?agent_id=${agent.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.data.deals.length).toBeGreaterThanOrEqual(3);
    for (const deal of body.data.deals) {
      expect(deal.creator_agent_id).toBe(agent.id);
    }
  });

  test("returns empty when agent_id does not belong to owner", async ({ request }) => {
    const otherAgentId = randomId();
    const res = await request.get(`/api/v1/owner/deals?agent_id=${otherAgentId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.data.deals.length).toBe(0);
  });

  test("returns 400 for invalid agent_id", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals?agent_id=not-a-uuid", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 400);
  });

  // -----------------------------------------------------------------------
  // Limit
  // -----------------------------------------------------------------------
  test("respects limit param", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.data.deals.length).toBe(1);
    expect(body.data.next_cursor).toBeTruthy();
  });

  test("returns 400 for limit out of range", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals?limit=200", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 400);
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------
  test("cursor pagination works", async ({ request }) => {
    // Fetch page 1 with limit=1
    const res1 = await request.get("/api/v1/owner/deals?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res1, 200);
    const body1 = await res1.json();
    expect(body1.data.deals.length).toBe(1);
    const cursor = body1.data.next_cursor;
    expect(cursor).toBeTruthy();

    // Fetch page 2 with cursor
    const res2 = await request.get(`/api/v1/owner/deals?limit=1&cursor=${encodeURIComponent(cursor)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res2, 200);
    const body2 = await res2.json();
    expect(body2.data.deals.length).toBe(1);

    // Page 2 deal should be different from page 1
    expect(body2.data.deals[0].deal_id).not.toBe(body1.data.deals[0].deal_id);
  });

  // -----------------------------------------------------------------------
  // Isolation: other owner cannot see these deals
  // -----------------------------------------------------------------------
  test("other owner sees no deals from first owner", async ({ request }) => {
    const otherOwnerId = randomId();
    await ensureOwnerDb(supabase, otherOwnerId);
    const otherAgent = await createAgentDb(supabase, otherOwnerId);
    const { apiKey: otherApiKey } = await createActiveApiKeyDb(supabase, otherAgent.id);

    const res = await request.get("/api/v1/owner/deals", {
      headers: { Authorization: `Bearer ${otherApiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    const ourDealIds = new Set(dealIds);
    const otherDeals = body.data.deals.filter((d: any) => ourDealIds.has(d.deal_id));
    expect(otherDeals.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Response shape
  // -----------------------------------------------------------------------
  test("response includes expected fields", async ({ request }) => {
    const res = await request.get("/api/v1/owner/deals?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    const deal = body.data.deals[0];
    expect(deal).toHaveProperty("deal_id");
    expect(deal).toHaveProperty("title");
    expect(deal).toHaveProperty("status");
    expect(deal).toHaveProperty("temperature");
    expect(deal).toHaveProperty("price");
    expect(deal).toHaveProperty("currency");
    expect(deal).toHaveProperty("created_at");
    expect(deal).toHaveProperty("creator_agent_id");
  });
});
