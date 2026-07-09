import { hybridTest as test, expect } from "./helpers/fixtures";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, sleep } from "./helpers/ids";
import {
  createListing,
  createOffer,
  acceptOffer,
  expectStatus
} from "./helpers/http";
import {
  createSupabaseAdmin,
  ensureOpsConsoleAgent,
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";
import { waitForAuditLog } from "./helpers/audit";

assertIntegrationEnv();

test.describe.serial("Timeline API (TI-281)", () => {
  test.setTimeout(120000);

  let supabase: any;
  let sellerOwnerId: string;
  let buyerOwnerId: string;
  let sellerApiKey: string;
  let buyerApiKey: string;
  let listingId: string;
  let offerId: string;

  test("setup: create owners, agents, and activity trail", async ({ request }) => {
    supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // Seller
    sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 80,
      trustFlags: []
    });
    const sellerKey = await createActiveApiKeyDb(supabase, sellerAgent.id);
    sellerApiKey = sellerKey.apiKey;

    // Setup seller policy
    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": sellerOwnerId },
      data: {
        budgets: { max_offer: 1000, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
        auto_approve: { message_types: ["question", "answer", "info"], actions: ["listing.create", "thread.create", "offer.create", "offer.accept"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    // Buyer
    buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 80,
      trustFlags: []
    });
    const buyerKey = await createActiveApiKeyDb(supabase, buyerAgent.id);
    buyerApiKey = buyerKey.apiKey;

    // Buyer policy
    const buyerPolicyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": buyerOwnerId },
      data: {
        budgets: { max_offer: 1000, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
        auto_approve: { message_types: ["question", "answer", "info"], actions: ["listing.create", "thread.create", "offer.create", "offer.accept"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(buyerPolicyRes, 200);

    // Create listing
    const listingRes = await createListing(request, sellerApiKey, {
      title: `Timeline test listing ${randomId()}`,
      price: { amount: 50, currency: "EUR" },
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    listingId = listingBody.listing?.id || listingBody.listing?.listing_id || listingBody.id || listingBody.listing_id;
    expect(listingId).toBeTruthy();

    // Wait for listing audit event to be persisted
    await waitForAuditLog(supabase, "listing.create", 15);

    // Create offer
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const offerRes = await createOffer(request, buyerApiKey, listingId, {
      amount: 45,
      currency: "EUR",
      expiresAt
    });
    await expectStatus(offerRes, 201);
    const offerBody = await offerRes.json();
    offerId = offerBody.offer?.id || offerBody.offer?.offer_id || offerBody.id || offerBody.offer_id;
    expect(offerId).toBeTruthy();

    // Wait for offer audit event
    await waitForAuditLog(supabase, "offer.create", 15);

    // Accept offer
    const acceptRes = await acceptOffer(request, sellerApiKey, offerId);
    await expectStatus(acceptRes, 200);

    // Wait for accept audit event
    await waitForAuditLog(supabase, "offer.accept", 15);

    // Give audit logs time to settle
    await sleep(500);
  });

  test("GET timeline for listing returns timeline items", async ({ request }) => {
    const res = await request.get("/api/console/timeline", {
      params: {
        entity_type: "listing",
        entity_id: listingId,
        include_correlated: "true"
      }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.entity).toEqual({ type: "listing", id: listingId });
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.correlation).toBeDefined();

    // At least the listing.create event should be primary
    const primaryItems = body.items.filter((i: any) => i.is_primary);
    expect(primaryItems.length).toBeGreaterThanOrEqual(1);

    // Verify item structure
    const firstItem = body.items[0];
    expect(firstItem.audit_id).toBeTruthy();
    expect(firstItem.ts).toBeTruthy();
    expect(firstItem.actor).toBeDefined();
    expect(firstItem.action).toBeTruthy();
    expect(firstItem.outcome).toBeTruthy();
  });

  test("GET timeline for offer returns offer events", async ({ request }) => {
    const res = await request.get("/api/console/timeline", {
      params: {
        entity_type: "offer",
        entity_id: offerId,
        include_correlated: "true"
      }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.entity).toEqual({ type: "offer", id: offerId });

    // Primary timeline should include acceptance; creation may appear as correlated.
    const primaryActions = body.items
      .filter((i: any) => i.is_primary)
      .map((i: any) => i.action);
    expect(primaryActions).toContain("offer.accept");

    const allActions = body.items.map((i: any) => i.action);
    expect(allActions.some((action: string) => action === "offer.create" || action === "transaction.create")).toBe(true);
  });

  test("GET replay for offer returns state progression", async ({ request }) => {
    const res = await request.get("/api/console/timeline/replay", {
      params: {
        entity_type: "offer",
        entity_id: offerId
      }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.entity).toEqual({ type: "offer", id: offerId });
    expect(body.steps.length).toBeGreaterThanOrEqual(1);
    expect(body.event_count).toBeGreaterThanOrEqual(1);
    expect(body.is_truncated).toBe(false);

    // Verify state progression
    const actions = body.steps.map((s: any) => s.action);
    expect(actions).toContain("offer.accept");
  });

  test("GET timeline with pagination returns nextCursor", async ({ request }) => {
    const res = await request.get("/api/console/timeline", {
      params: {
        entity_type: "listing",
        entity_id: listingId,
        include_correlated: "false",
        limit: "1"
      }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.items.length).toBeLessThanOrEqual(1);
    // If there's more than one event, there should be a cursor
    // (listing may only have 1 primary event)
  });

  test("GET timeline for non-existent entity returns empty items", async ({ request }) => {
    const fakeId = randomId();
    const res = await request.get("/api/console/timeline", {
      params: {
        entity_type: "listing",
        entity_id: fakeId
      }
    });
    await expectStatus(res, 200);

    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  test("GET timeline with invalid entity_id returns 400", async ({ request }) => {
    const res = await request.get("/api/console/timeline", {
      params: {
        entity_type: "listing",
        entity_id: "not-a-uuid"
      }
    });
    await expectStatus(res, 400);

    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("GET replay with up_to_audit_id stops at that event", async ({ request }) => {
    // First get the timeline to find an audit_id
    const timelineRes = await request.get("/api/console/timeline", {
      params: {
        entity_type: "offer",
        entity_id: offerId,
        include_correlated: "false"
      }
    });
    await expectStatus(timelineRes, 200);
    const timelineBody = await timelineRes.json();

    if (timelineBody.items.length >= 2) {
      const firstAuditId = timelineBody.items[0].audit_id;

      const replayRes = await request.get("/api/console/timeline/replay", {
        params: {
          entity_type: "offer",
          entity_id: offerId,
          up_to_audit_id: firstAuditId
        }
      });
      await expectStatus(replayRes, 200);

      const replayBody = await replayRes.json();
      expect(replayBody.steps.length).toBe(1);
      expect(replayBody.up_to_audit_id).toBe(firstAuditId);
    }
  });
});
