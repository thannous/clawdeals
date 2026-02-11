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

    const baselineRes = await request.post(`/api/v1/threads/${threadId}:watch`, {
      headers: { Authorization: `Bearer ${seller.apiKey}` },
      data: {
        cursor: "0-0",
        timeout_ms: 250,
        limit: 10
      }
    });
    await expectStatus(baselineRes, 200);
    const baselineBody = await baselineRes.json();
    let cursor = typeof baselineBody?.next_cursor === "string" ? baselineBody.next_cursor : "0-0";

    const followUpText = `Watch follow-up ${randomId()}`;
    const sendRes = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${buyer.apiKey}`, "Idempotency-Key": randomId() },
      data: { type: "question", text: followUpText }
    });
    await expectStatus(sendRes, 201);
    const sendBody = await sendRes.json();
    const sentMessageId = sendBody?.message_id;
    expect(typeof sentMessageId).toBe("string");

    let watchBody: any = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const watchRes = await request.post(`/api/v1/threads/${threadId}:watch`, {
        headers: { Authorization: `Bearer ${seller.apiKey}` },
        data: {
          cursor,
          timeout_ms: 1000,
          limit: 10
        }
      });
      await expectStatus(watchRes, 200);
      watchBody = await watchRes.json();
      if (typeof watchBody?.next_cursor === "string" && watchBody.next_cursor) {
        cursor = watchBody.next_cursor;
      }
      if (Array.isArray(watchBody?.events) && watchBody.events.length > 0) {
        break;
      }
    }

    expect(typeof watchBody?.next_cursor).toBe("string");
    expect(Array.isArray(watchBody?.events)).toBe(true);
    expect(watchBody.events.length).toBeGreaterThan(0);

    const extractPayload = (event: any) => event?.payload || event?.data?.payload || null;
    const eventForThread = watchBody.events.find((e: any) => {
      const payload = extractPayload(e);
      return payload?.thread_id === threadId || payload?.message?.thread_id === threadId;
    });
    expect(Boolean(eventForThread)).toBe(true);

    const hasSentMessage = watchBody.events.some((e: any) => {
      const payload = extractPayload(e);
      return payload?.message_id === sentMessageId || payload?.message?.message_id === sentMessageId;
    });
    expect(hasSentMessage).toBe(true);
  });
});
