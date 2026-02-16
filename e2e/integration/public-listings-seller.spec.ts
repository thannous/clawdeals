import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus, createListing } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDbWithOverrides, createActiveApiKeyDb, ensureOpsConsoleAgent } from "./helpers/supabase";

assertIntegrationEnv();

async function setupPolicy(request: any, ownerId: string) {
  const res = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId },
    data: {
      budgets: { max_offer: 1000, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
      auto_approve: { message_types: ["question", "answer", "info"], actions: ["listing.create", "thread.create"] },
      allowlist_agent_ids: [],
      denylist_agent_ids: [],
    },
  });
  await expectStatus(res, 200);
}

test.describe.serial("Integration: Public Listings — seller snippet", () => {
  test.setTimeout(60000);

  let supabase: ReturnType<typeof createSupabaseAdmin>;
  let ownerId: string;
  let apiKey: string;
  let listingId: string;

  test.beforeAll(async () => {
    supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
  });

  test("setup: create owner with profile, agent, and published listing", async ({ request }) => {
    // Create owner + aged agent (to avoid quarantine so listing goes LIVE)
    ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const agent = await createAgentDbWithOverrides(supabase, ownerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: [],
    });
    const keyResult = await createActiveApiKeyDb(supabase, agent.id);
    apiKey = keyResult.apiKey;

    // Give the owner a profile
    const profileRes = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId },
      data: {
        email: `itest+seller+${ownerId.slice(0, 8)}@example.com`,
        display_name: "Seller McTest",
        avatar_url: "/avatars/default-5.svg",
      },
    });
    await expectStatus(profileRes, 200);

    // Verify email so "verified" appears in snippet
    const startRes = await request.post("/api/v1/owner/verify-email:start", {
      headers: { "x-owner-id": ownerId },
    });
    await expectStatus(startRes, 201);
    const token = (await startRes.json()).data.token;

    const confirmRes = await request.post("/api/v1/owner/verify-email:confirm", {
      headers: { "x-owner-id": ownerId },
      data: { token },
    });
    await expectStatus(confirmRes, 200);

    // Create a published listing (should go LIVE because agent is aged + trusted)
    const listRes = await createListing(request, apiKey, {
      title: `Seller snippet test ${randomId()}`,
      description: "A listing to test seller snippet enrichment",
      category: "electronics",
      condition: "GOOD",
      price: { amount: 25, currency: "EUR" },
      publish: true,
    });
    await expectStatus(listRes, 201);
    const listBody = await listRes.json();
    listingId = listBody.listing_id;
    expect(listingId).toBeTruthy();
    expect(listBody.status).toBe("LIVE");
  });

  test("GET /public/listings returns seller snippet for the listing", async ({ request }) => {
    const res = await request.get("/api/v1/public/listings");
    await expectStatus(res, 200);
    const body = await res.json();

    // Find our listing
    const listing = body.data.find((l: any) => l.listing_id === listingId);
    expect(listing).toBeTruthy();

    // Verify seller snippet
    expect(listing.seller).toBeTruthy();
    expect(listing.seller.display_name).toBe("Seller McTest");
    expect(listing.seller.avatar_url).toBe("/avatars/default-5.svg");
    expect(listing.seller.verified).toBe(true);
  });

  test("seller snippet shows verified=false for unverified owner", async ({ request }) => {
    // Create a second owner (unverified) with aged agent
    const ownerId2 = randomId();
    await ensureOwnerDb(supabase, ownerId2);
    await setupPolicy(request, ownerId2);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const agent2 = await createAgentDbWithOverrides(supabase, ownerId2, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: [],
    });
    const { apiKey: apiKey2 } = await createActiveApiKeyDb(supabase, agent2.id);

    const profileRes = await request.patch("/api/v1/owner", {
      headers: { "x-owner-id": ownerId2 },
      data: {
        email: `itest+unv+${ownerId2.slice(0, 8)}@example.com`,
        display_name: "Unverified Seller",
      },
    });
    await expectStatus(profileRes, 200);

    const listRes = await createListing(request, apiKey2, {
      title: `Unverified seller test ${randomId()}`,
      category: "books",
      condition: "NEW",
      price: { amount: 10, currency: "EUR" },
      publish: true,
    });
    await expectStatus(listRes, 201);
    const listBody = await listRes.json();
    const listingId2 = listBody.listing_id;
    expect(listBody.status).toBe("LIVE");

    const res = await request.get("/api/v1/public/listings");
    await expectStatus(res, 200);
    const body = await res.json();

    const listing = body.data.find((l: any) => l.listing_id === listingId2);
    expect(listing).toBeTruthy();
    expect(listing.seller).toBeTruthy();
    expect(listing.seller.display_name).toBe("Unverified Seller");
    expect(listing.seller.verified).toBe(false);
  });
});
