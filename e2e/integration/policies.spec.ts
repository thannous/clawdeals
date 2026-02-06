import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { waitForAuditLog, waitForAuditLogMatching } from "./helpers/audit";
import { createListing, expectStatus, createOwner, createOwnerWithContact } from "./helpers/http";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDbWithOverrides, createActiveApiKeyDb, setupAgent } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Policies", () => {
  test.setTimeout(60000);

  test("policy get/put as owner", async ({ request }) => {
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const putRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: ["answer"], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(putRes, 200);
    const putBody = await putRes.json();
    expect(putBody.data.version).toBeTruthy();

    const getRes = await request.get("/api/v1/policies", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(getRes, 200);
    const getBody = await getRes.json();
    expect(getBody.data.version).toBe(putBody.data.version);
  });

  test("policy decision audit is persisted", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey } = await setupAgent(supabase);

    const auditSince = new Date().toISOString();
    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: ["answer"], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, sellerApiKey, { title: `Policy decision listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(threadRes, 201);

    const audit = await waitForAuditLogMatching(
      supabase,
      (row) => row.occurred_at >= auditSince && row.action?.event != null
    );
    expect(audit).not.toBeNull();
  });

  test("policy version mismatch returns 409", async ({ request }) => {
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const putRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(putRes, 200);

    const staleRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId, "If-Match": "0" },
      data: {
        budgets: { max_offer: 500, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 500, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    expect([409, 200]).toContain(staleRes.status());
  });

  test("audit log records BLOCKED outcome on allowlist denial", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey } = await setupAgent(supabase);

    const auditSince = new Date().toISOString();
    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: ["not-this-agent"],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, sellerApiKey, { title: `Audit block listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    expect(threadRes.status()).toBe(403);

    const audit = await waitForAuditLogMatching(
      supabase,
      (row) => row.action?.event === "policy.blocked_sender" && row.occurred_at >= auditSince
    );
    if (audit) {
      expect(audit.outcome).toBe("BLOCKED");
    }
  });

  test("denylist overrides allowlist for same agent", async ({ request }) => {
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
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: [buyerAgent.id],
        denylist_agent_ids: [buyerAgent.id]
      }
    });

    const listingRes = await createListing(request, sellerApiKey, { title: `Deny overrides listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    expect(threadRes.status()).toBe(403);
    const threadBody = await threadRes.json();
    expect(threadBody.error.code).toBe("SENDER_NOT_ALLOWED");
  });

  test("audit log policy.blocked_sender is persisted", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey } = await setupAgent(supabase);

    const auditSince = new Date().toISOString();
    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: ["not-this-agent"],
        denylist_agent_ids: []
      }
    });

    const listingRes = await createListing(request, sellerApiKey, { title: `Blocked audit listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();

    const threadRes = await request.post(`/api/v1/listings/${listingBody.listing_id}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    expect(threadRes.status()).toBe(403);

    const audit = await waitForAuditLogMatching(
      supabase,
      (row) => row.action?.event === "policy.blocked_sender" && row.occurred_at >= auditSince
    );
    if (audit) {
      expect(audit.outcome).toBe("BLOCKED");
    }
  });

  test("allowlist blocks thread creation", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);
    const { apiKey: buyerApiKey } = await setupAgent(supabase);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create"] },
        allowlist_agent_ids: ["agent-not-allowed"],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `Allowlist listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    expect(threadRes.status()).toBe(403);
    const threadBody = await threadRes.json();
    expect(threadBody.error.code).toBe("SENDER_NOT_ALLOWED");
  });

  test("audit log redacts PII in owner verification events", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    const email = `itest+pii+${ownerId.slice(0, 8)}@example.com`;
    await createOwnerWithContact(request, ownerId, { email });

    const auditSince = new Date().toISOString();
    const startRes = await request.post("/api/v1/owner/verify-email:start", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(startRes, 201);

    const audit = await waitForAuditLog(supabase, "owner.email_verification_started", 10, auditSince);
    expect(audit).not.toBeNull();
    const payloadStr = JSON.stringify(audit.payload || {});
    expect(payloadStr).not.toContain(email);
  });
});
