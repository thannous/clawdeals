import { test, expect, type APIRequestContext } from "@playwright/test";

import { assertIntegrationEnv, getApiBaseUrl } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb,
  setupAgent
} from "./helpers/supabase";

assertIntegrationEnv();

async function loginOwner(api: APIRequestContext, supabase: ReturnType<typeof createSupabaseAdmin>, ownerId: string) {
  const email = `itest+approvals+${ownerId.slice(0, 8)}@example.com`;
  const { error } = await supabase
    .from("owners")
    .update({ email, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId);
  if (error) throw error;

  const start = await api.post("/api/v1/auth/login:start", { data: { email } });
  await expectStatus(start, 201);
  const started = await start.json();

  const confirm = await api.post("/api/v1/auth/login:confirm", {
    data: {
      session_id: started.data.session_id,
      token: started.data.session_token
    }
  });
  await expectStatus(confirm, 200);
  expect(started.data.owner_id).toBe(ownerId);
}

test.describe.serial("Integration: Approvals", () => {
  test.setTimeout(60000);

  test("approvals queue executes thread + message actions", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, {
      createdAt: agedCreatedAt
    });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey, agent: buyerAgent } = await setupAgent(supabase);

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

    const listingRes = await createListing(request, sellerApiKey, {
      title: `Approval listing ${randomId()}`,
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: {
        Authorization: `Bearer ${buyerApiKey}`,
        "Idempotency-Key": randomId()
      },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadApprovalBody = await threadRes.json();
    const threadApprovalId = threadApprovalBody.data.approval_id;

    const approvalsRes = await request.get("/api/v1/approvals?state=PENDING", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(approvalsRes, 200);
    const approvalsBody = await approvalsRes.json();
    const pendingIds = approvalsBody.data.approvals.map((item: any) => item.approval_id);
    expect(pendingIds).toContain(threadApprovalId);

    await loginOwner(request, supabase, ownerId);
    const approveThreadRes = await request.post(`/api/v1/approvals/${threadApprovalId}:approve`, {
      headers: {
        Origin: new URL(getApiBaseUrl()).origin,
        "Idempotency-Key": randomId()
      },
      data: {}
    });
    await expectStatus(approveThreadRes, 200);
    const approveThreadBody = await approveThreadRes.json();
    expect(approveThreadBody.data.state).toBe("APPROVED");

    const { data: threads, error: threadsError } = await supabase
      .from("threads")
      .select("*")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (threadsError) throw threadsError;
    expect(threads.length).toBeGreaterThan(0);
    const threadId = threads[0].thread_id;
    expect(threads[0].buyer_agent_id).toBe(buyerAgent.id);

    const msgRes = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: {
        Authorization: `Bearer ${buyerApiKey}`,
        "Idempotency-Key": randomId()
      },
      data: { type: "question", text: "hello approval" }
    });
    await expectStatus(msgRes, 202);
    const msgApprovalBody = await msgRes.json();
    const msgApprovalId = msgApprovalBody.data.approval_id;

    const approveMsgRes = await request.post(`/api/v1/approvals/${msgApprovalId}:approve`, {
      headers: {
        Origin: new URL(getApiBaseUrl()).origin,
        "Idempotency-Key": randomId()
      },
      data: {}
    });
    await expectStatus(approveMsgRes, 200);
    const approveMsgBody = await approveMsgRes.json();
    expect(approveMsgBody.data.state).toBe("APPROVED");

    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (messagesError) throw messagesError;
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].type).toBe("question");
    expect(messages[0].payload?.type).toBe("question");
    expect(messages[0].payload?.text).toBe("hello approval");
  });

  test("approvals deny blocks action execution", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, {
      createdAt: agedCreatedAt
    });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey } = await setupAgent(supabase);

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

    const listingRes = await createListing(request, sellerApiKey, {
      title: `Deny test listing ${randomId()}`,
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: {
        Authorization: `Bearer ${buyerApiKey}`,
        "Idempotency-Key": randomId()
      },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadApprovalBody = await threadRes.json();
    const threadApprovalId = threadApprovalBody.data.approval_id;

    await loginOwner(request, supabase, ownerId);
    const denyRes = await request.post(`/api/v1/approvals/${threadApprovalId}:deny`, {
      headers: {
        Origin: new URL(getApiBaseUrl()).origin,
        "Idempotency-Key": randomId()
      },
      data: {}
    });
    await expectStatus(denyRes, 200);
    const denyBody = await denyRes.json();
    expect(denyBody.data.state).toBe("DENIED");

    const { data: threads } = await supabase.from("threads").select("*").eq("listing_id", listingId);
    expect((threads || []).length).toBe(0);
  });

  test("approvals pagination with cursor", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, {
      createdAt: agedCreatedAt
    });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

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
      title: `Pagination listing ${randomId()}`,
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    for (let i = 0; i < 2; i += 1) {
      const { apiKey: freshApiKey } = await setupAgent(supabase);
      await request.post(`/api/v1/listings/${listingId}/threads`, {
        headers: {
          Authorization: `Bearer ${freshApiKey}`,
          "Idempotency-Key": randomId()
        },
        data: {}
      });
    }

    const page1 = await request.get("/api/v1/approvals?state=PENDING&limit=1", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(page1, 200);
    const page1Body = await page1.json();
    expect(page1Body.data.approvals.length).toBe(1);
    expect(page1Body.data.next_cursor).toBeTruthy();

    const page2 = await request.get(`/api/v1/approvals?state=PENDING&limit=1&cursor=${page1Body.data.next_cursor}`, {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(page2, 200);
    const page2Body = await page2.json();
    expect(page2Body.data.approvals.length).toBe(1);
    expect(page2Body.data.approvals[0].approval_id).not.toBe(page1Body.data.approvals[0].approval_id);
  });

  test("approve idempotency replay is stable", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, {
      createdAt: agedCreatedAt
    });
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
      title: `Idem approval listing ${randomId()}`,
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: {
        Authorization: `Bearer ${buyerApiKey}`,
        "Idempotency-Key": randomId()
      },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadApprovalBody = await threadRes.json();
    const approvalId = threadApprovalBody.data.approval_id;

    await loginOwner(request, supabase, ownerId);
    const idemKey = randomId();
    const first = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: {
        Origin: new URL(getApiBaseUrl()).origin,
        "Idempotency-Key": idemKey
      },
      data: {}
    });
    await expectStatus(first, 200);

    const replay = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: {
        Origin: new URL(getApiBaseUrl()).origin,
        "Idempotency-Key": idemKey
      },
      data: {}
    });
    await expectStatus(replay, 200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
  });
});
