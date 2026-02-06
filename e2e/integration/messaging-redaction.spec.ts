import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import { waitForAuditLog } from "./helpers/audit";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDb, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Messaging redaction (TI-198)", () => {
  test.setTimeout(60000);

  test("redacts link-like content, posts warning, writes audit without plaintext, and is idempotent", async ({ request }) => {
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
        auto_approve: { message_types: ["question", "answer", "info"], actions: ["thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, apiKey, { title: `Msg redaction listing ${randomId()}` });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { body: "Initial: visit https://scam.com", message_type: "question" }
    });
    await expectStatus(threadRes, 201);
    const threadBody = await threadRes.json();
    const threadId = threadBody.data.id;

    const { data: initialMessages, error: initialErr } = await supabase
      .from("messages")
      .select("id, sender_type, message_type, body, redacted")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    expect(initialErr).toBeNull();
    expect((initialMessages || []).length).toBeGreaterThanOrEqual(2);

    const first = initialMessages[0];
    const warning = initialMessages[1];

    expect(first.sender_type).toBe("agent");
    expect(first.message_type).toBe("question");
    expect(first.redacted).toBe(true);
    expect(first.body).toContain("[redacted]");

    expect(warning.sender_type).toBe("system");
    expect(warning.message_type).toBe("warning");
    expect(warning.redacted).toBe(false);
    const warningJson = JSON.parse(warning.body);
    expect(warningJson.code).toBe("external_link_detected");

    const idemKey = randomId();
    const msg1 = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idemKey },
      data: { body: "Pay with PayPal at www.paypal.com", message_type: "answer" }
    });
    await expectStatus(msg1, 201);

    const msg2 = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idemKey },
      data: { body: "Pay with PayPal at www.paypal.com", message_type: "answer" }
    });
    await expectStatus(msg2, 201);
    expect(msg2.headers()["idempotency-replayed"]).toBe("true");

    const { data: afterIdem, error: afterErr } = await supabase
      .from("messages")
      .select("id, message_type")
      .eq("thread_id", threadId);
    expect(afterErr).toBeNull();

    const answerCount = (afterIdem || []).filter((m: any) => m.message_type === "answer").length;
    const warningCount = (afterIdem || []).filter((m: any) => m.message_type === "warning").length;
    expect(answerCount).toBe(1);
    // Two warnings total: one for initial message, one for the answer.
    expect(warningCount).toBe(2);

    const cleanRes = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { body: "Is it still available?", message_type: "question" }
    });
    await expectStatus(cleanRes, 201);

    const audit = await waitForAuditLog(supabase, "message.redacted");
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");

    const payloadStr = JSON.stringify(audit.payload || {});
    expect(payloadStr).not.toContain("paypal.com");
    expect(payloadStr).toContain("body_redacted");
    expect((audit.payload || {}).body_hmac).toMatch(/^[0-9a-f]{64}$/i);
    expect((audit.payload || {}).redaction_applied).toBe(true);
  });
});
