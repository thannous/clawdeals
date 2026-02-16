import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Public Deals API", () => {
  test.setTimeout(60000);

  let apiKey: string;
  let dealTitle: string;

  test("setup: create a deal for public browse", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    // Ensure not quarantined (>= 7 days old)
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey: key } = await createActiveApiKeyDb(supabase, agent.id);
    apiKey = key;

    dealTitle = `PublicDeal ${randomId()}`;
    const res = await request.post("/api/v1/deals", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": randomId(),
      },
      data: {
        title: dealTitle,
        url: `https://example.com/deal/${randomId()}`,
        price: 49.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["test", "integration"],
      },
    });
    await expectStatus(res, 201);
    const body = await res.json();
    expect(body.deal.deal_id).toBeTruthy();
  });

  test("GET /api/v1/public/deals returns 200 with data array", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals");
    await expectStatus(res, 200);
    const body = await res.json();

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Verify response shape
    const first = body.data[0];
    expect(first).toHaveProperty("deal_id");
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("status");
    expect(first).toHaveProperty("tags");
    expect(first).toHaveProperty("created_at");
  });

  test("no auth required — works without any headers", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals", {
      headers: {},
    });
    await expectStatus(res, 200);
  });

  test("sets cache-control headers", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals");
    const cacheControl = res.headers()["cache-control"] || "";
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("s-maxage=60");
  });

  test("rejects non-GET with 405", async ({ request }) => {
    const res = await request.post("/api/v1/public/deals", { data: {} });
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  test("temperature is masked for NEW deals", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals?status=NEW");
    await expectStatus(res, 200);
    const body = await res.json();

    for (const deal of body.data) {
      expect(deal.status).toBe("NEW");
      expect(deal.temperature).toBeNull();
    }
  });

  test("sort by temp", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals?sort=temp");
    await expectStatus(res, 200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("sort by trend", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals?sort=trend");
    await expectStatus(res, 200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("filter by status (comma-separated)", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals?status=NEW,ACTIVE");
    await expectStatus(res, 200);
    const body = await res.json();

    for (const deal of body.data) {
      expect(["NEW", "ACTIVE"]).toContain(deal.status);
    }
  });

  test("search by q returns matching deals", async ({ request }) => {
    const res = await request.get(`/api/v1/public/deals?q=${encodeURIComponent(dealTitle.slice(0, 10))}`);
    await expectStatus(res, 200);
    const body = await res.json();

    const found = body.data.some((item: any) => item.title === dealTitle);
    expect(found).toBe(true);
  });

  test("filter by tags", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals?tags=test");
    await expectStatus(res, 200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("limit parameter caps results", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals?limit=2");
    await expectStatus(res, 200);
    const body = await res.json();

    expect(body.data.length).toBeLessThanOrEqual(2);
  });

  test("pagination with cursor", async ({ request }) => {
    // Get first page
    const page1Res = await request.get("/api/v1/public/deals?limit=1");
    await expectStatus(page1Res, 200);
    const page1 = await page1Res.json();

    if (!page1.next_cursor) {
      // Only 1 deal exists, skip pagination test
      return;
    }

    // Get second page
    const page2Res = await request.get(`/api/v1/public/deals?limit=1&cursor=${encodeURIComponent(page1.next_cursor)}`);
    await expectStatus(page2Res, 200);
    const page2 = await page2Res.json();

    // Pages should have different items
    if (page2.data.length > 0) {
      expect(page2.data[0].deal_id).not.toBe(page1.data[0].deal_id);
    }
  });

  test("invalid cursor returns 400", async ({ request }) => {
    const res = await request.get("/api/v1/public/deals?cursor=not-a-valid-cursor");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("cursor sort mismatch returns 400", async ({ request }) => {
    // Get a cursor for sort=new
    const page1 = await request.get("/api/v1/public/deals?limit=1&sort=new");
    await expectStatus(page1, 200);
    const body = await page1.json();

    if (!body.next_cursor) return;

    // Use that cursor with sort=temp — should fail
    const res = await request.get(`/api/v1/public/deals?sort=temp&cursor=${encodeURIComponent(body.next_cursor)}`);
    expect(res.status()).toBe(400);
    const errBody = await res.json();
    expect(errBody.error.code).toBe("VALIDATION_ERROR");
    expect(errBody.error.message).toContain("cursor does not match sort");
  });
});
