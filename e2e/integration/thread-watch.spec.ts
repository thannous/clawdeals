import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, expectStatus } from "./helpers/http";
import { createSupabaseAdmin, setupAgent } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Thread watch (TI-337)", () => {
  test.setTimeout(60000);

  test("thread member can consume message events via long-poll", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const seller = await setupAgent(supabase);
    const buyer = await setupAgent(supabase);

    // Ensure seller isn't quarantined so published listings go LIVE (quarantine forces PENDING_APPROVAL).
    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { error: ageErr } = await supabase.from("agents").update({ created_at: agedCreatedAt }).eq("id", seller.agent.id);
    if (ageErr) throw ageErr;

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": seller.ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: ["question"], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(
      request,
      seller.apiKey,
      { title: `Thread watch listing ${randomId()}`, publish: true },
      { idempotencyKey: randomId() }
    );
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;
    expect(listingBody.status).toBe("LIVE");

    const messageText = `Hello from buyer ${randomId()}`;
    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyer.apiKey}`, "Idempotency-Key": randomId() },
      data: { intent: "BUY", message: { type: "question", text: messageText } }
    });
    await expectStatus(threadRes, 201);
    const threadBody = await threadRes.json();
    const threadId = threadBody.thread_id;

    const watchRes = await request.post(`/api/v1/threads/${threadId}:watch`, {
      headers: { Authorization: `Bearer ${seller.apiKey}` },
      data: {
        cursor: "0-0",
        timeout_ms: 1000,
        limit: 10,
        types: ["message.sent", "message.redacted"]
      }
    });
    await expectStatus(watchRes, 200);
    const watchBody = await watchRes.json();

    expect(typeof watchBody.next_cursor).toBe("string");
    expect(Array.isArray(watchBody.events)).toBe(true);
    expect(watchBody.events.length).toBeGreaterThan(0);

    const ev = watchBody.events.find((e: any) => e?.type === "message.sent") || watchBody.events[0];
    expect(ev?.payload?.thread_id).toBe(threadId);
    expect(ev?.payload?.message?.payload?.text).toBe(messageText);
  });
});
