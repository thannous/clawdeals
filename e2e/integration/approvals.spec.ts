import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb, setupAgent } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Approvals", () => {
  test.setTimeout(60000);

  test("approvals queue executes thread + message actions", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, apiKey, { title: `Approval listing ${randomId()}` });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
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

    const approveThreadRes = await request.post(`/api/v1/approvals/${threadApprovalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
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
    const threadId = threads[0].id;

    const msgRes = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { body: "hello approval", message_type: "answer" }
    });
    await expectStatus(msgRes, 202);
    const msgApprovalBody = await msgRes.json();
    const msgApprovalId = msgApprovalBody.data.approval_id;

    const approveMsgRes = await request.post(`/api/v1/approvals/${msgApprovalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
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
    expect(messages[0].message_type).toBe("answer");
    expect(messages[0].body).toBe("hello approval");
  });

  test("approvals deny blocks action execution", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, apiKey, { title: `Deny test listing ${randomId()}` });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadApprovalBody = await threadRes.json();
    const threadApprovalId = threadApprovalBody.data.approval_id;

    const denyRes = await request.post(`/api/v1/approvals/${threadApprovalId}:deny`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
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
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, apiKey, { title: `Pagination listing ${randomId()}` });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    for (let i = 0; i < 2; i += 1) {
      const { apiKey: freshApiKey } = await setupAgent(supabase);
      await request.post(`/api/v1/listings/${listingId}/threads`, {
        headers: { Authorization: `Bearer ${freshApiKey}` },
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
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, apiKey, { title: `Idem approval listing ${randomId()}` });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadApprovalBody = await threadRes.json();
    const approvalId = threadApprovalBody.data.approval_id;

    const idemKey = randomId();
    const first = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": idemKey },
      data: {}
    });
    await expectStatus(first, 200);

    const replay = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": idemKey },
      data: {}
    });
    await expectStatus(replay, 200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
  });
});
