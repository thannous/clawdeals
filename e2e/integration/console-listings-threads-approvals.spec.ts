import { hybridTest as test, expect } from "./helpers/fixtures";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb,
  setupAgent
} from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Console Listings/Threads/Approvals", () => {
  test.setTimeout(60000);

  // ── Console Listings ──────────────────────────────────────────────────

  test("console listings list returns items array", async ({ request }) => {
    const res = await request.get("/api/console/listings");
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("console listings list filters by status", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const category = `clt_draft_${randomId()}`;
    const draftRes = await createListing(request, apiKey, {
      title: `Console draft ${randomId()}`,
      category,
      publish: false
    });
    await expectStatus(draftRes, 201);
    const draftBody = await draftRes.json();
    expect(draftBody.status).toBe("DRAFT");

    const res = await request.get(`/api/console/listings?status=DRAFT&category=${encodeURIComponent(category)}`);
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.every((i: any) => i.status === "DRAFT")).toBe(true);
  });

  test("console listings list supports pagination", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const category = `clt_pag_${randomId()}`;
    for (let i = 0; i < 3; i++) {
      const r = await createListing(request, apiKey, {
        title: `Console pag ${i} ${randomId()}`,
        category,
        price: { amount: 100 + i, currency: "EUR" },
        publish: false
      });
      await expectStatus(r, 201);
    }

    const page1 = await request.get(`/api/console/listings?category=${encodeURIComponent(category)}&limit=1`);
    await expectStatus(page1, 200);
    const page1Body = await page1.json();
    expect(page1Body.items).toHaveLength(1);
    expect(page1Body.next_cursor).toBeTruthy();

    const page2 = await request.get(
      `/api/console/listings?category=${encodeURIComponent(category)}&limit=1&cursor=${encodeURIComponent(page1Body.next_cursor)}`
    );
    await expectStatus(page2, 200);
    const page2Body = await page2.json();
    expect(page2Body.items).toHaveLength(1);
    expect(page2Body.items[0].listing_id).not.toBe(page1Body.items[0].listing_id);
  });

  test("console listings detail returns listing by id", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agent = await createAgentDb(supabase, ownerId);
    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("agents").update({ created_at: createdAt }).eq("id", agent.id);

    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const createRes = await createListing(request, apiKey, {
      title: `Console detail ${randomId()}`,
      publish: false
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();

    const res = await request.get(`/api/console/listings/${created.listing_id}`);
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.listing).toBeDefined();
    expect(body.listing.listing_id).toBe(created.listing_id);
  });

  test("console listings detail returns 404 for missing listing", async ({ request }) => {
    const res = await request.get("/api/console/listings/00000000-0000-4000-a000-000000000099");
    await expectStatus(res, 404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("console listings detail returns 400 for bad UUID", async ({ request }) => {
    const res = await request.get("/api/console/listings/bad-id");
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ── Console Threads ───────────────────────────────────────────────────

  test("console threads list returns items array", async ({ request }) => {
    const res = await request.get("/api/console/threads");
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("console threads detail + messages for a real thread", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey, agent: buyerAgent } = await setupAgent(supabase);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: ["question"], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, sellerApiKey, {
      title: `Console thread listing ${randomId()}`,
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    // Create thread via the public API.
    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: { intent: "BUY", message: { type: "question", text: "Is this still available?" } }
    });
    await expectStatus(threadRes, 201);
    const threadBody = await threadRes.json();
    const threadId = threadBody.thread_id;
    expect(threadId).toBeTruthy();

    // Console: list threads filtered by listing_id.
    const listRes = await request.get(`/api/console/threads?listing_id=${listingId}`);
    await expectStatus(listRes, 200);
    const listBody = await listRes.json();
    expect(listBody.items.length).toBeGreaterThanOrEqual(1);
    const found = listBody.items.find((t: any) => t.thread_id === threadId);
    expect(found).toBeTruthy();

    // Console: thread detail.
    const detailRes = await request.get(`/api/console/threads/${threadId}`);
    await expectStatus(detailRes, 200);
    const detailBody = await detailRes.json();
    expect(detailBody.thread).toBeDefined();
    expect(detailBody.thread.thread_id).toBe(threadId);
    expect(detailBody.thread.buyer_agent_id).toBe(buyerAgent.id);
    expect(detailBody.messages).toBeDefined();
    expect(Array.isArray(detailBody.messages)).toBe(true);
    expect(detailBody.messages.length).toBeGreaterThanOrEqual(1);

    // Console: thread messages endpoint.
    const msgsRes = await request.get(`/api/console/threads/${threadId}/messages`);
    await expectStatus(msgsRes, 200);
    const msgsBody = await msgsRes.json();
    expect(msgsBody.items).toBeDefined();
    expect(Array.isArray(msgsBody.items)).toBe(true);
    expect(msgsBody.items.length).toBeGreaterThanOrEqual(1);
  });

  test("console threads detail returns 404 for missing thread", async ({ request }) => {
    const res = await request.get("/api/console/threads/00000000-0000-4000-a000-000000000099");
    await expectStatus(res, 404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("console threads detail returns 400 for bad UUID", async ({ request }) => {
    const res = await request.get("/api/console/threads/bad-id");
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("console threads messages returns 400 for bad thread UUID", async ({ request }) => {
    const res = await request.get("/api/console/threads/bad-id/messages");
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  // ── Console Approvals ─────────────────────────────────────────────────

  test("console approvals list returns items array", async ({ request }) => {
    const res = await request.get("/api/console/approvals");
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("console approvals list filters by state", async ({ request }) => {
    const res = await request.get("/api/console/approvals?state=PENDING");
    await expectStatus(res, 200);
    const body = await res.json();
    body.items.forEach((item: any) => {
      expect(item.state).toBe("PENDING");
    });
  });

  test("console approvals list filters by action_type", async ({ request }) => {
    const res = await request.get("/api/console/approvals?action_type=listing_publish&state=PENDING");
    await expectStatus(res, 200);
    const body = await res.json();
    body.items.forEach((item: any) => {
      expect(item.action_type).toBe("listing_publish");
    });
  });

  test("console approvals list rejects bad agent_id", async ({ request }) => {
    const res = await request.get("/api/console/approvals?agent_id=not-a-uuid");
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("console approval detail + resolve flow", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey } = await setupAgent(supabase);

    // Policy that requires approval for thread creation.
    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, sellerApiKey, {
      title: `Console approval listing ${randomId()}`,
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    // Thread creation should require approval (not in auto_approve actions).
    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadApprovalBody = await threadRes.json();
    const approvalId = threadApprovalBody.data.approval_id;
    expect(approvalId).toBeTruthy();

    // Console: GET approval detail.
    const detailRes = await request.get(`/api/console/approvals/${approvalId}`);
    await expectStatus(detailRes, 200);
    const detailBody = await detailRes.json();
    expect(detailBody.approval).toBeDefined();
    expect(detailBody.approval.approval_id).toBe(approvalId);
    expect(detailBody.approval.state).toBe("PENDING");

    // Console: POST resolve approval (approve).
    const resolveRes = await request.post(`/api/console/approvals/${approvalId}`, {
      data: { action: "approve" }
    });
    await expectStatus(resolveRes, 200);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.approval.state).toBe("APPROVED");

    // Verify the approval is now visible as APPROVED in the list.
    const approvedRes = await request.get("/api/console/approvals?state=APPROVED");
    await expectStatus(approvedRes, 200);
    const approvedBody = await approvedRes.json();
    const foundApproved = approvedBody.items.find((a: any) => a.approval_id === approvalId);
    expect(foundApproved).toBeTruthy();
    expect(foundApproved.state).toBe("APPROVED");
  });

  test("console approval resolve rejects already-resolved approval", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey } = await setupAgent(supabase);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, sellerApiKey, {
      title: `Console already-resolved listing ${randomId()}`,
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingId = (await listingRes.json()).listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const approvalId = (await threadRes.json()).data.approval_id;

    // Approve once.
    const first = await request.post(`/api/console/approvals/${approvalId}`, {
      data: { action: "approve" }
    });
    await expectStatus(first, 200);

    // Try to resolve again => 409 CONFLICT.
    const second = await request.post(`/api/console/approvals/${approvalId}`, {
      data: { action: "deny" }
    });
    await expectStatus(second, 409);
    const body = await second.json();
    expect(body.error.code).toBe("CONFLICT");
  });

  test("console approval detail returns 404 for missing approval", async ({ request }) => {
    const res = await request.get("/api/console/approvals/00000000-0000-4000-a000-000000000099");
    await expectStatus(res, 404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  test("console approval detail returns 400 for bad UUID", async ({ request }) => {
    const res = await request.get("/api/console/approvals/bad-id");
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("console approval resolve validates action field", async ({ request }) => {
    const res = await request.post("/api/console/approvals/00000000-0000-4000-a000-000000000099", {
      data: { action: "invalid" }
    });
    await expectStatus(res, 400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("console approval deny flow", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey } = await setupAgent(supabase);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, sellerApiKey, {
      title: `Console deny listing ${randomId()}`,
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingId = (await listingRes.json()).listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const approvalId = (await threadRes.json()).data.approval_id;

    const denyRes = await request.post(`/api/console/approvals/${approvalId}`, {
      data: { action: "deny" }
    });
    await expectStatus(denyRes, 200);
    const denyBody = await denyRes.json();
    expect(denyBody.approval.state).toBe("DENIED");

    // Thread should not have been created.
    const { data: threads } = await supabase.from("threads").select("*").eq("listing_id", listingId);
    expect((threads || []).length).toBe(0);
  });
});
