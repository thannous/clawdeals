import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Listings (TI-193 + TI-194)", () => {
  test.setTimeout(60000);

  test("create (LIVE/DRAFT/PENDING_APPROVAL) + idempotency + search + geo errors", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    // Ensure not quarantined (>= 7 days old).
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const livePayload = {
      title: `TI-193 LIVE ${randomId()}`,
      description: "",
      category: `cat_${randomId()}`,
      condition: "GOOD",
      price: { amount: 12345, currency: "EUR" },
      publish: true
    };

    const idemKey = randomId();
    const first = await createListing(request, apiKey, livePayload, { idempotencyKey: idemKey });
    await expectStatus(first, 201);
    const firstBody = await first.json();
    expect(firstBody.listing_id).toBeTruthy();
    expect(firstBody.status).toBe("LIVE");

    const replay = await createListing(request, apiKey, livePayload, { idempotencyKey: idemKey });
    await expectStatus(replay, 201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    const replayBody = await replay.json();
    expect(replayBody.listing_id).toBe(firstBody.listing_id);

    const { data: persisted, error: persistedError } = await supabase
      .from("listings")
      .select("listing_id,status,seller_agent_id,category,condition,price_amount,currency,geo_lat,geo_lng,photos,owner_id,agent_id")
      .eq("listing_id", firstBody.listing_id)
      .single();
    expect(persistedError).toBeNull();
    expect(persisted?.listing_id).toBe(firstBody.listing_id);
    expect(persisted?.status).toBe("LIVE");
    expect(persisted?.seller_agent_id).toBe(agent.id);
    expect(persisted?.category).toBe(livePayload.category);
    expect(persisted?.condition).toBe("GOOD");
    expect(persisted?.price_amount).toBe(12345);
    expect(persisted?.currency).toBe("EUR");
    expect(persisted?.owner_id).toBe(ownerId);
    expect(persisted?.agent_id).toBe(agent.id);

    const draftRes = await createListing(request, apiKey, {
      title: `TI-193 DRAFT ${randomId()}`,
      category: livePayload.category,
      publish: false
    });
    await expectStatus(draftRes, 201);
    const draftBody = await draftRes.json();
    expect(draftBody.status).toBe("DRAFT");

    // Quarantined agent (created "now") => PENDING_APPROVAL even if policy auto-approves.
    const quarantinedAgent = await createAgentDb(supabase, ownerId);
    const { apiKey: quarantinedKey } = await createActiveApiKeyDb(supabase, quarantinedAgent.id);

    const pendingRes = await createListing(request, quarantinedKey, {
      title: `TI-193 PENDING ${randomId()}`,
      category: livePayload.category,
      publish: true
    });
    await expectStatus(pendingRes, 201);
    const pendingBody = await pendingRes.json();
    expect(pendingBody.status).toBe("PENDING_APPROVAL");
    expect(pendingBody.listing_id).toBeTruthy();

    const { data: approvals, error: approvalsError } = await supabase
      .from("approvals")
      .select("approval_id,action_type,action_ref_id,state,action_ref")
      .eq("owner_id", ownerId)
      .eq("action_type", "listing_publish")
      .eq("action_ref_id", pendingBody.listing_id)
      .limit(1);
    expect(approvalsError).toBeNull();
    expect((approvals || []).length).toBe(1);
    expect(approvals?.[0].state).toBe("PENDING");

    const approveRes = await request.post(`/api/v1/approvals/${approvals?.[0].approval_id}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(approveRes, 200);

    const { data: pendingRow } = await supabase
      .from("listings")
      .select("status")
      .eq("listing_id", pendingBody.listing_id)
      .single();
    expect(pendingRow?.status).toBe("LIVE");

    // Search: only LIVE are visible.
    const searchCategory = `ti194_${randomId()}`;
    const low = await createListing(request, apiKey, {
      title: `TI-194 low ${randomId()}`,
      category: searchCategory,
      price: { amount: 100, currency: "EUR" },
      publish: true
    });
    await expectStatus(low, 201);
    const lowBody = await low.json();
    expect(lowBody.status).toBe("LIVE");

    const high = await createListing(request, apiKey, {
      title: `TI-194 high ${randomId()}`,
      category: searchCategory,
      price: { amount: 200, currency: "EUR" },
      publish: true
    });
    await expectStatus(high, 201);
    const highBody = await high.json();
    expect(highBody.status).toBe("LIVE");

    const hidden = await createListing(request, apiKey, {
      title: `TI-194 hidden ${randomId()}`,
      category: searchCategory,
      price: { amount: 150, currency: "EUR" },
      publish: false
    });
    await expectStatus(hidden, 201);

    const ascRes = await request.get(`/api/v1/listings?category=${encodeURIComponent(searchCategory)}&sort=price_asc`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(ascRes, 200);
    const ascBody = await ascRes.json();
    expect((ascBody.data || []).length).toBe(2);
    expect(ascBody.data[0].price.amount).toBe(100);
    expect(ascBody.data[1].price.amount).toBe(200);

    const descRes = await request.get(`/api/v1/listings?category=${encodeURIComponent(searchCategory)}&sort=price_desc`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(descRes, 200);
    const descBody = await descRes.json();
    expect((descBody.data || []).length).toBe(2);
    expect(descBody.data[0].price.amount).toBe(200);
    expect(descBody.data[1].price.amount).toBe(100);

    const page1 = await request.get(
      `/api/v1/listings?category=${encodeURIComponent(searchCategory)}&sort=price_asc&limit=1`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    await expectStatus(page1, 200);
    const page1Body = await page1.json();
    expect((page1Body.data || []).length).toBe(1);
    expect(page1Body.next_cursor).toBeTruthy();

    const page2 = await request.get(
      `/api/v1/listings?category=${encodeURIComponent(searchCategory)}&sort=price_asc&limit=1&cursor=${encodeURIComponent(page1Body.next_cursor)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    await expectStatus(page2, 200);
    const page2Body = await page2.json();
    expect((page2Body.data || []).length).toBe(1);
    expect(page2Body.data[0].listing_id).not.toBe(page1Body.data[0].listing_id);

    // Geo behavior.
    const geoMissing = await request.get("/api/v1/listings?distance_km=10", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    expect(geoMissing.status()).toBe(400);
    const geoMissingBody = await geoMissing.json();
    expect(geoMissingBody.error.code).toBe("GEO_REQUIRED");

    const geoUnsupported = await request.get("/api/v1/listings?lat=1&lng=2", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    expect(geoUnsupported.status()).toBe(501);
    const geoUnsupportedBody = await geoUnsupported.json();
    expect(geoUnsupportedBody.error.code).toBe("GEO_NOT_SUPPORTED");
  });
});

