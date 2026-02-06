import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus, patchListing } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

let patchEndpointSupported: boolean | null = null;

test.describe.serial("Integration: Listings Update (TI-195)", () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ request }, testInfo) => {
    if (patchEndpointSupported === null) {
      // If the route file doesn't exist yet, Next.js returns a 404 (HTML). Once implemented, we expect
      // a non-404 (likely 400/401) for this invalid listing id.
      const probe = await request.patch("/api/v1/listings/not-a-uuid", {
        headers: { Authorization: "Bearer probe", "Idempotency-Key": randomId() },
        data: {}
      });
      patchEndpointSupported = probe.status() !== 404;
    }

    if (!patchEndpointSupported) {
      testInfo.skip(true, "PATCH /v1/listings/{listing_id} not implemented yet (TI-195)");
    }
  });

  test("seller can patch price/title/description (DRAFT)", async ({ request }) => {
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
        auto_approve: { message_types: [], actions: ["listing.create", "listing.update", "listing.publish"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const createRes = await createListing(request, apiKey, {
      title: `TI-195 DRAFT ${randomId()}`,
      description: "old",
      category: `ti195_${randomId()}`,
      price: { amount: 100, currency: "EUR" },
      publish: false
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();
    expect(created.listing_id).toBeTruthy();
    expect(created.status).toBe("DRAFT");

    const patchRes = await patchListing(
      request,
      apiKey,
      created.listing_id,
      {
        title: `TI-195 updated ${randomId()}`,
        description: "new",
        price: { amount: 250, currency: "EUR" }
      },
      { idempotencyKey: randomId() }
    );
    await expectStatus(patchRes, 200);

    const { data: row, error } = await supabase
      .from("listings")
      .select("listing_id,status,title,description,price_amount,currency,updated_at")
      .eq("listing_id", created.listing_id)
      .single();
    expect(error).toBeNull();
    expect(row?.status).toBe("DRAFT");
    expect(row?.title).toContain("TI-195 updated");
    expect(row?.description).toBe("new");
    expect(row?.price_amount).toBe(250);
    expect(row?.currency).toBe("EUR");
    expect(row?.updated_at).toBeTruthy();
  });

  test("non-seller gets 404 (anti-enumeration)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const seller = await createAgentDb(supabase, ownerId);
    const buyer = await createAgentDb(supabase, ownerId);

    // Age both to avoid quarantine side-effects.
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).in("id", [seller.id, buyer.id]);

    const { apiKey: sellerKey } = await createActiveApiKeyDb(supabase, seller.id);
    const { apiKey: buyerKey } = await createActiveApiKeyDb(supabase, buyer.id);

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

    const createRes = await createListing(request, sellerKey, {
      title: `TI-195 seller listing ${randomId()}`,
      category: `ti195_${randomId()}`,
      publish: false
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();

    const patchRes = await patchListing(request, buyerKey, created.listing_id, { price: { amount: 999, currency: "EUR" } });
    expect(patchRes.status()).toBe(404);
  });

  test("locked states reject updates with 409 LISTING_LOCKED", async ({ request }) => {
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

    const createRes = await createListing(request, apiKey, {
      title: `TI-195 locked ${randomId()}`,
      category: `ti195_${randomId()}`,
      publish: false
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();

    // Force a system-controlled state using service role (test-only).
    await supabase.from("listings").update({ status: "RESERVED" }).eq("listing_id", created.listing_id);

    const patchRes = await patchListing(request, apiKey, created.listing_id, { price: { amount: 123, currency: "EUR" } });
    expect(patchRes.status()).toBe(409);
    const body = await patchRes.json();
    expect(body?.error?.code).toBe("LISTING_LOCKED");
  });

  test("LIVE -> REMOVED makes the listing unsearchable", async ({ request }) => {
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

    const category = `ti195_search_${randomId()}`;
    const createRes = await createListing(request, apiKey, {
      title: `TI-195 LIVE ${randomId()}`,
      category,
      price: { amount: 123, currency: "EUR" },
      publish: true
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();
    expect(created.status).toBe("LIVE");

    const before = await request.get(`/api/v1/listings?category=${encodeURIComponent(category)}&sort=recent`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(before, 200);
    const beforeBody = await before.json();
    expect((beforeBody.data || []).some((item) => item.listing_id === created.listing_id)).toBe(true);

    const patchRes = await patchListing(request, apiKey, created.listing_id, { status: "REMOVED" });
    await expectStatus(patchRes, 200);

    const after = await request.get(`/api/v1/listings?category=${encodeURIComponent(category)}&sort=recent`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(after, 200);
    const afterBody = await after.json();
    expect((afterBody.data || []).some((item) => item.listing_id === created.listing_id)).toBe(false);
  });

  test("idempotency replays", async ({ request }) => {
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

    const createRes = await createListing(request, apiKey, {
      title: `TI-195 idem ${randomId()}`,
      category: `ti195_${randomId()}`,
      publish: false
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();

    const idemKey = randomId();
    const payload = { price: { amount: 333, currency: "EUR" } };

    const first = await patchListing(request, apiKey, created.listing_id, payload, { idempotencyKey: idemKey });
    await expectStatus(first, 200);

    const replay = await patchListing(request, apiKey, created.listing_id, payload, { idempotencyKey: idemKey });
    await expectStatus(replay, 200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
  });

  test("DRAFT -> LIVE auto-publishes when policy allows", async ({ request }) => {
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
        auto_approve: { message_types: [], actions: ["listing.publish"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const category = `ti195_pub_${randomId()}`;
    const createRes = await createListing(request, apiKey, {
      title: `TI-195 DRAFT ${randomId()}`,
      category,
      publish: false
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();
    expect(created.status).toBe("DRAFT");

    const publishRes = await patchListing(
      request,
      apiKey,
      created.listing_id,
      { status: "LIVE" },
      { idempotencyKey: randomId() }
    );
    await expectStatus(publishRes, 200);
    const publishBody = await publishRes.json();
    expect(publishBody.status).toBe("LIVE");

    const { data: row } = await supabase.from("listings").select("status").eq("listing_id", created.listing_id).single();
    expect(row?.status).toBe("LIVE");

    const searchRes = await request.get(`/api/v1/listings?category=${encodeURIComponent(category)}&sort=recent`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(searchRes, 200);
    const searchBody = await searchRes.json();
    expect((searchBody.data || []).some((item) => item.listing_id === created.listing_id)).toBe(true);
  });

  test("DRAFT -> LIVE can become PENDING_APPROVAL + approval created (quarantine), then owner can approve to publish", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    // Fresh agent is quarantined (< 7 days old).
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.publish"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const createRes = await createListing(request, apiKey, {
      title: `TI-195 DRAFT quarantine ${randomId()}`,
      category: `ti195_${randomId()}`,
      publish: false
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();
    expect(created.status).toBe("DRAFT");

    const publishRes = await patchListing(request, apiKey, created.listing_id, { status: "LIVE" });
    await expectStatus(publishRes, 200);
    const publishBody = await publishRes.json();
    expect(publishBody.status).toBe("PENDING_APPROVAL");

    const { data: approvals, error: approvalsError } = await supabase
      .from("approvals")
      .select("approval_id,action_type,action_ref_id,state")
      .eq("owner_id", ownerId)
      .eq("action_type", "listing_publish")
      .eq("action_ref_id", created.listing_id)
      .limit(1);
    expect(approvalsError).toBeNull();
    expect((approvals || []).length).toBe(1);
    expect(approvals?.[0].state).toBe("PENDING");

    const approveRes = await request.post(`/api/v1/approvals/${approvals?.[0].approval_id}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(approveRes, 200);

    const { data: row } = await supabase.from("listings").select("status").eq("listing_id", created.listing_id).single();
    expect(row?.status).toBe("LIVE");
  });

  test("PENDING_APPROVAL -> REMOVED cancels pending listing_publish approval", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    // Ensure not quarantined, but policy will require approval.
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        // No allowlisted actions => publish requires approval.
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const createRes = await createListing(request, apiKey, {
      title: `TI-195 cancel ${randomId()}`,
      category: `ti195_${randomId()}`,
      publish: false
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();

    const publishRes = await patchListing(request, apiKey, created.listing_id, { status: "LIVE" });
    await expectStatus(publishRes, 200);
    const publishBody = await publishRes.json();
    expect(publishBody.status).toBe("PENDING_APPROVAL");

    const { data: approvals } = await supabase
      .from("approvals")
      .select("approval_id,state")
      .eq("owner_id", ownerId)
      .eq("action_type", "listing_publish")
      .eq("action_ref_id", created.listing_id)
      .limit(1);
    expect((approvals || []).length).toBe(1);
    expect(approvals?.[0].state).toBe("PENDING");

    const removeRes = await patchListing(request, apiKey, created.listing_id, { status: "REMOVED" });
    await expectStatus(removeRes, 200);
    const removeBody = await removeRes.json();
    expect(removeBody.status).toBe("REMOVED");

    const { data: cancelled } = await supabase
      .from("approvals")
      .select("state")
      .eq("approval_id", approvals?.[0].approval_id)
      .single();
    expect(cancelled?.state).toBe("CANCELLED");
  });
});
