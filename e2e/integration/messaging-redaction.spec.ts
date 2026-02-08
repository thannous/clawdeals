import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import { waitForAuditLog } from "./helpers/audit";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDbWithOverrides, createActiveApiKeyDb, setupAgent } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Messaging redaction (TI-198)", () => {
  test.setTimeout(60000);

  test("redacts link-like content, posts warning, writes audit without plaintext, and is idempotent", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const auditSince = new Date().toISOString();
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
        auto_approve: { message_types: ["question", "answer", "info"], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `Msg redaction listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: { intent: "BUY", message: { type: "question", text: "Initial: visit https://scam.com" } }
    });
    await expectStatus(threadRes, 201);
    const threadBody = await threadRes.json();
    const threadId = threadBody.thread_id;

    const { data: initialMessages, error: initialErr } = await supabase
      .from("messages")
      .select("message_id, sender_type, type, body, payload, redacted")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    expect(initialErr).toBeNull();
    expect((initialMessages || []).length).toBeGreaterThanOrEqual(2);

    const first = initialMessages[0];
    const warning = initialMessages[1];

    expect(first.sender_type).toBe("agent");
    expect(first.type).toBe("question");
    expect(first.redacted).toBe(true);
    expect(first.payload?.text).toContain("[redacted]");

    expect(warning.sender_type).toBe("system");
    expect(warning.type).toBe("warning");
    expect(warning.redacted).toBe(false);
    expect(warning.payload?.code).toBe("external_link_detected");

    const idemKey = randomId();
    const auditRequestId = randomId();
    const msg1 = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": idemKey, "x-request-id": auditRequestId },
      data: { type: "answer", text: "Pay with PayPal at www.paypal.com" }
    });
    await expectStatus(msg1, 201);

    const msg2 = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": idemKey },
      data: { type: "answer", text: "Pay with PayPal at www.paypal.com" }
    });
    await expectStatus(msg2, 201);
    expect(msg2.headers()["idempotency-replayed"]).toBe("true");

    const { data: afterIdem, error: afterErr } = await supabase
      .from("messages")
      .select("message_id, type")
      .eq("thread_id", threadId);
    expect(afterErr).toBeNull();

    const answerCount = (afterIdem || []).filter((m: any) => m.type === "answer").length;
    const warningCount = (afterIdem || []).filter((m: any) => m.type === "warning").length;
    expect(answerCount).toBe(1);
    // Two warnings total: one for initial message, one for the answer.
    expect(warningCount).toBe(2);

    const cleanRes = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: { type: "question", text: "Is it still available?" }
    });
    await expectStatus(cleanRes, 201);

    const audit = await waitForAuditLog(supabase, "message.redacted", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");

    const payloadStr = JSON.stringify(audit.payload || {});
    expect(payloadStr).not.toContain("paypal.com");
    expect(payloadStr).toContain("payload_redacted");
    expect((audit.payload || {}).message?.original_hmac).toMatch(/^[0-9a-f]{64}$/i);
    expect((audit.payload || {}).message?.redaction_applied).toBe(true);
  });
});
