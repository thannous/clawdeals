import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Public Listings API", () => {
  test.setTimeout(60000);

  let apiKey: string;
  let listingTitle: string;
  let listingId: string;

  test("setup: create a LIVE listing for public browse", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    // Ensure not quarantined (>= 7 days old)
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey: key } = await createActiveApiKeyDb(supabase, agent.id);
    apiKey = key;

    // Set auto-approve policy for listing.create
    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: [],
      },
    });
    await expectStatus(policyRes, 200);

    listingTitle = `PublicBrowse ${randomId()}`;
    const res = await createListing(request, apiKey, {
      title: listingTitle,
      description: "Integration test listing for public browse",
      category: "test_public",
      condition: "GOOD",
      price: { amount: 4200, currency: "EUR" },
      publish: true,
    });
    await expectStatus(res, 201);
    const body = await res.json();
    listingId = body.listing_id;
    expect(listingId).toBeTruthy();
    expect(body.status).toBe("LIVE");
  });

  test("GET /api/v1/public/listings returns 200 with data array", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings");
    await expectStatus(res, 200);
    const body = await res.json();

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    // Verify response shape
    const first = body.data[0];
    expect(first).toHaveProperty("listing_id");
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("category");
    expect(first).toHaveProperty("condition");
    expect(first).toHaveProperty("price");
    expect(first.price).toHaveProperty("amount");
    expect(first.price).toHaveProperty("currency");
    expect(first).toHaveProperty("created_at");
  });

  test("no auth required — works without any headers", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings", {
      headers: {},
    });
    await expectStatus(res, 200);
  });

  test("sets cache-control headers", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings");
    const cacheControl = res.headers()["cache-control"] || "";
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("s-maxage=60");
  });

  test("rejects non-GET with 405", async ({ request }) => {
    const res = await request.post("/api/v1/public/listings", { data: {} });
    expect(res.status()).toBe(405);
    const body = await res.json();
    expect(body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  test("search by q returns matching listings", async ({ request }) => {
    const res = await request.get(`/api/v1/public/listings?q=${encodeURIComponent(listingTitle.slice(0, 12))}`);
    await expectStatus(res, 200);
    const body = await res.json();

    const found = body.data.some((item: any) => item.listing_id === listingId);
    expect(found).toBe(true);
  });

  test("filter by category", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings?category=test_public");
    await expectStatus(res, 200);
    const body = await res.json();

    for (const item of body.data) {
      expect(item.category).toBe("test_public");
    }
  });

  test("filter by condition", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings?condition=GOOD");
    await expectStatus(res, 200);
    const body = await res.json();

    for (const item of body.data) {
      expect(item.condition).toBe("GOOD");
    }
  });

  test("sort by price_asc", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings?sort=price_asc");
    await expectStatus(res, 200);
    const body = await res.json();

    expect(Array.isArray(body.data)).toBe(true);
    // Verify ascending price order
    for (let i = 1; i < body.data.length; i++) {
      expect(body.data[i].price.amount).toBeGreaterThanOrEqual(body.data[i - 1].price.amount);
    }
  });

  test("limit parameter caps results", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings?limit=2");
    await expectStatus(res, 200);
    const body = await res.json();

    expect(body.data.length).toBeLessThanOrEqual(2);
  });

  test("pagination with cursor", async ({ request }) => {
    // Get first page
    const page1Res = await request.get("/api/v1/public/listings?limit=1");
    await expectStatus(page1Res, 200);
    const page1 = await page1Res.json();

    if (!page1.next_cursor) {
      // Only 1 listing exists, skip pagination test
      return;
    }

    // Get second page
    const page2Res = await request.get(`/api/v1/public/listings?limit=1&cursor=${encodeURIComponent(page1.next_cursor)}`);
    await expectStatus(page2Res, 200);
    const page2 = await page2Res.json();

    // Pages should have different items
    if (page2.data.length > 0) {
      expect(page2.data[0].listing_id).not.toBe(page1.data[0].listing_id);
    }
  });

  test("invalid cursor returns 400", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings?cursor=not-a-valid-cursor");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("description is truncated to 200 chars", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings");
    await expectStatus(res, 200);
    const body = await res.json();

    for (const item of body.data) {
      if (item.description) {
        expect(item.description.length).toBeLessThanOrEqual(201); // 200 + ellipsis
      }
    }
  });

  test("price_min and price_max filter", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings?price_min=4000&price_max=5000");
    await expectStatus(res, 200);
    const body = await res.json();

    for (const item of body.data) {
      expect(item.price.amount).toBeGreaterThanOrEqual(4000);
      expect(item.price.amount).toBeLessThanOrEqual(5000);
    }
  });
});
