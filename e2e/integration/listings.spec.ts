import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Listings (TI-193 + TI-194 + TI-268 + TI-271)", () => {
  test.setTimeout(60000);

  test("create (LIVE/DRAFT/PENDING_APPROVAL) + idempotency + search + geo + dedupe", async ({ request }) => {
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
    await expectStatus(geoUnsupported, 200);
    const geoUnsupportedBody = await geoUnsupported.json();
    expect(Array.isArray(geoUnsupportedBody.data)).toBe(true);

    // Geo distance sort: create 2 LIVE listings with geo and ensure closest comes first.
    const geoCategory = `ti268_${randomId()}`;
    const nearRes = await createListing(request, apiKey, {
      title: `TI-268 near ${randomId()}`,
      category: geoCategory,
      price: { amount: 10, currency: "EUR" },
      geo: { lat: 48.8566, lng: 2.3522 },
      publish: true
    });
    await expectStatus(nearRes, 201);
    const nearBody = await nearRes.json();
    expect(nearBody.status).toBe("LIVE");

    const farRes = await createListing(request, apiKey, {
      title: `TI-268 far ${randomId()}`,
      category: geoCategory,
      price: { amount: 20, currency: "EUR" },
      geo: { lat: 47.0, lng: 2.0 },
      publish: true
    });
    await expectStatus(farRes, 201);
    const farBody = await farRes.json();
    expect(farBody.status).toBe("LIVE");

    const geoRes = await request.get(
      `/api/v1/listings?sort=distance&lat=48.8566&lng=2.3522&distance_km=300&category=${encodeURIComponent(geoCategory)}&limit=50`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    await expectStatus(geoRes, 200);
    const geoBody = await geoRes.json();
    const geoIds = (geoBody.data || []).map((row: any) => row.listing_id);
    expect(geoIds).toEqual([nearBody.listing_id, farBody.listing_id]);
    expect(typeof geoBody.data[0].distance_km).toBe("number");
    expect(typeof geoBody.data[1].distance_km).toBe("number");
    expect(geoBody.data[0].distance_km).toBeLessThanOrEqual(geoBody.data[1].distance_km);

    // Dedupe: second listing with same fingerprint should be blocked unless force_create=true.
    const dupCategory = `ti271_${randomId()}`;
    const dupTitle = `TI-271 dup ${randomId()}`;
    const aRes = await createListing(request, apiKey, {
      title: dupTitle,
      category: dupCategory,
      condition: "GOOD",
      price: { amount: 12345, currency: "EUR" },
      publish: true
    });
    await expectStatus(aRes, 201);
    const aBody = await aRes.json();
    expect(aBody.status).toBe("LIVE");

    const bRes = await createListing(request, apiKey, {
      title: dupTitle,
      category: dupCategory,
      condition: "GOOD",
      price: { amount: 12345, currency: "EUR" },
      publish: true
    });
    expect(bRes.status()).toBe(409);
    const bBody = await bRes.json();
    expect(bBody.error.code).toBe("DUPLICATE_SUSPECTED");

    const cRes = await createListing(request, apiKey, {
      title: dupTitle,
      category: dupCategory,
      condition: "GOOD",
      price: { amount: 12345, currency: "EUR" },
      publish: true,
      force_create: true
    });
    await expectStatus(cRes, 201);
    const cBody = await cRes.json();
    expect(cBody.status).toBe("PENDING_APPROVAL");

    const { data: forceApprovals, error: forceApprovalsError } = await supabase
      .from("approvals")
      .select("approval_id,action_type,action_ref_id,state")
      .eq("owner_id", ownerId)
      .eq("action_type", "listing_publish")
      .eq("action_ref_id", cBody.listing_id)
      .limit(1);
    expect(forceApprovalsError).toBeNull();
    expect((forceApprovals || []).length).toBe(1);

    const forceApproveRes = await request.post(`/api/v1/approvals/${forceApprovals?.[0].approval_id}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(forceApproveRes, 200);

    const { data: forcedRow } = await supabase
      .from("listings")
      .select("status")
      .eq("listing_id", cBody.listing_id)
      .single();
    expect(forcedRow?.status).toBe("LIVE");
  });

  test("create listing with delivery_method + GET returns it + PATCH updates it", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "listing.update", "listing.publish"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const category = `delivery_${randomId()}`;

    // Create with SHIPPING.
    const shippingRes = await createListing(request, apiKey, {
      title: `Delivery SHIPPING ${randomId()}`,
      category,
      price: { amount: 100, currency: "EUR" },
      delivery_method: "SHIPPING",
      publish: true
    });
    await expectStatus(shippingRes, 201);
    const shippingBody = await shippingRes.json();
    expect(shippingBody.listing_id).toBeTruthy();
    expect(shippingBody.delivery_method).toBe("SHIPPING");

    // Create with BOTH.
    const bothRes = await createListing(request, apiKey, {
      title: `Delivery BOTH ${randomId()}`,
      category,
      price: { amount: 200, currency: "EUR" },
      delivery_method: "BOTH",
      publish: true
    });
    await expectStatus(bothRes, 201);
    const bothBody = await bothRes.json();
    expect(bothBody.delivery_method).toBe("BOTH");

    // Create without delivery_method (null).
    const noDeliveryRes = await createListing(request, apiKey, {
      title: `Delivery none ${randomId()}`,
      category,
      price: { amount: 50, currency: "EUR" },
      publish: true
    });
    await expectStatus(noDeliveryRes, 201);
    const noDeliveryBody = await noDeliveryRes.json();
    expect(noDeliveryBody.delivery_method).toBeNull();

    // DB persistence check.
    const { data: row, error } = await supabase
      .from("listings")
      .select("delivery_method")
      .eq("listing_id", shippingBody.listing_id)
      .single();
    expect(error).toBeNull();
    expect(row?.delivery_method).toBe("SHIPPING");

    // GET list returns delivery_method.
    const listRes = await request.get(
      `/api/v1/listings?category=${encodeURIComponent(category)}&sort=recent`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    await expectStatus(listRes, 200);
    const listBody = await listRes.json();
    const deliveryMethods = (listBody.data || []).map((item: any) => item.delivery_method);
    expect(deliveryMethods).toContain("SHIPPING");
    expect(deliveryMethods).toContain("BOTH");
    expect(deliveryMethods).toContain(null);

    // GET detail returns delivery_method.
    const detailRes = await request.get(`/api/v1/listings/${shippingBody.listing_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(detailRes, 200);
    const detailBody = await detailRes.json();
    expect(detailBody.data.delivery_method).toBe("SHIPPING");

    // PATCH delivery_method to PICKUP.
    const patchRes = await request.patch(`/api/v1/listings/${shippingBody.listing_id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { delivery_method: "PICKUP" }
    });
    await expectStatus(patchRes, 200);
    const patchBody = await patchRes.json();
    expect(patchBody.delivery_method).toBe("PICKUP");

    // Verify in DB.
    const { data: updatedRow } = await supabase
      .from("listings")
      .select("delivery_method")
      .eq("listing_id", shippingBody.listing_id)
      .single();
    expect(updatedRow?.delivery_method).toBe("PICKUP");
  });

  test("create listing rejects invalid delivery_method", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const res = await createListing(request, apiKey, {
      title: `Invalid delivery ${randomId()}`,
      delivery_method: "INVALID_VALUE",
      publish: false
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
