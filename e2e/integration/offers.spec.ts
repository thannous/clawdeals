import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, createOffer, expectStatus } from "./helpers/http";
import { openSse, waitForSseFrame } from "./helpers/sse";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDbWithOverrides, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

const offersRouteExists = [
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers.ts"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers.js"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers/index.js")
].some((candidate) => fs.existsSync(candidate));

function extractApprovalId(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  const details = body?.error?.details;
  if (details && typeof details === "object") {
    const fromDetails = (details as any).approval_id;
    if (typeof fromDetails === "string" && fromDetails) return fromDetails;
  }
  return null;
}

test.describe.serial("Integration: Offers (TI-199)", () => {
  test.skip(!offersRouteExists, "TI-199 offers endpoint not implemented in this branch");

  test.setTimeout(60000);

  test("under budget => offer created + typed message + SSE; duplicate open offer => 409", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `Offer approval listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const buyerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.created")}`, {
      headers: {
        Authorization: `Bearer ${buyerApiKey}`,
        Accept: "text/event-stream"
      }
    });

    try {
      expect(buyerSse.res.status).toBe(200);

      // Wait for ping so we know the streams are up before triggering the event.
      await waitForSseFrame(buyerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const offerRes = await createOffer(
        request,
        buyerApiKey,
        listingId,
        { threadId: null, amount: 350, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(offerRes, 201);
      const offerBody = await offerRes.json();

      const offerId = offerBody.offer_id;
      const threadId = offerBody.thread_id;

      expect(typeof offerId).toBe("string");
      expect(typeof threadId).toBe("string");
      expect(offerBody.listing_id).toBe(listingId);
      expect(offerBody.buyer_agent_id).toBe(buyerAgent.id);
      expect(offerBody.seller_agent_id).toBe(sellerAgent.id);
      expect(offerBody.status).toBe("CREATED");

      const { data: offerRow, error: offerErr } = await supabase
        .from("offers")
        .select("offer_id,thread_id,listing_id,buyer_agent_id,seller_agent_id,amount,currency,expires_at,status")
        .eq("offer_id", offerId)
        .maybeSingle();
      if (offerErr) throw offerErr;

      expect(offerRow?.offer_id).toBe(offerId);
      expect(offerRow?.thread_id).toBe(threadId);
      expect(offerRow?.listing_id).toBe(listingId);
      expect(offerRow?.buyer_agent_id).toBe(buyerAgent.id);
      expect(offerRow?.seller_agent_id).toBe(sellerAgent.id);
      expect(offerRow?.amount).toBe(350);
      expect(offerRow?.currency).toBe("EUR");
      expect(offerRow?.status).toBe("CREATED");

      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("message_id,type,payload,thread_id,created_at")
        .eq("thread_id", threadId)
        .eq("type", "offer")
        .order("created_at", { ascending: false })
        .limit(1);
      if (msgErr) throw msgErr;
      expect((messages || []).length).toBeGreaterThan(0);
      expect(messages[0].payload?.type).toBe("offer");
      expect(messages[0].payload?.offer_id).toBe(offerId);

      const frame = await waitForSseFrame(buyerSse.res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "offer.created" ? entry : undefined)
      });

      if (frame.type !== "event") {
        throw new Error("Expected SSE event frame");
      }
      expect(frame.event).toBe("offer.created");

      const eventBody = JSON.parse(frame.data);
      expect(eventBody?.type).toBe("offer.created");
      expect(eventBody?.entity?.id).toBe(offerId);
      expect(eventBody?.payload?.listing_id).toBe(listingId);
      expect(eventBody?.payload?.thread_id).toBe(threadId);
      expect(eventBody?.payload?.status).toBe("CREATED");

      const dupRes = await createOffer(
        request,
        buyerApiKey,
        listingId,
        { threadId: null, amount: 350, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(dupRes, 409);
      const dupBody = await dupRes.json();
      expect(dupBody?.error?.code).toBe("OFFER_ALREADY_OPEN");
      expect(dupBody?.error?.details?.existing_offer_id).toBe(offerId);
    } finally {
      buyerSse.controller.abort();
    }
  });

  test("over budget => 409 APPROVAL_REQUIRED; approve creates offer row + offer message", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `Offer over budget listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(threadRes, 201);
    const threadBody = await threadRes.json();
    const threadId = threadBody.thread_id;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const offerRes = await createOffer(
      request,
      buyerApiKey,
      listingId,
      { threadId, amount: 500, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(offerRes, 409);
    const offerBody = await offerRes.json();
    expect(offerBody?.error?.code).toBe("APPROVAL_REQUIRED");

    const approvalId = extractApprovalId(offerBody);
    expect(approvalId).toBeTruthy();

    const { data: approvalRow, error: approvalErr } = await supabase
      .from("approvals")
      .select("approval_id,action_type,state")
      .eq("approval_id", approvalId)
      .maybeSingle();
    if (approvalErr) throw approvalErr;
    expect(approvalRow?.approval_id).toBe(approvalId);
    expect(approvalRow?.action_type).toBe("offer_over_budget");
    expect(approvalRow?.state).toBe("PENDING");

    const approveRes = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(approveRes, 200);
    const approveBody = await approveRes.json();
    expect(approveBody?.data?.state).toBe("APPROVED");

    const { data: offerRows, error: offerErr } = await supabase
      .from("offers")
      .select("offer_id,thread_id,listing_id,buyer_agent_id,seller_agent_id,amount,currency,expires_at,status,created_at")
      .eq("thread_id", threadId)
      .eq("buyer_agent_id", buyerAgent.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (offerErr) throw offerErr;
    expect((offerRows || []).length).toBeGreaterThan(0);
    const offer = offerRows[0];
    expect(offer.thread_id).toBe(threadId);
    expect(offer.listing_id).toBe(listingId);
    expect(offer.buyer_agent_id).toBe(buyerAgent.id);
    expect(offer.seller_agent_id).toBe(sellerAgent.id);
    expect(offer.amount).toBe(500);
    expect(offer.currency).toBe("EUR");
    expect(offer.status).toBe("CREATED");

    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("message_id,type,payload,thread_id,created_at")
      .eq("thread_id", threadId)
      .eq("type", "offer")
      .order("created_at", { ascending: false })
      .limit(1);
    if (msgErr) throw msgErr;
    expect((messages || []).length).toBeGreaterThan(0);
    expect(messages[0].payload?.type).toBe("offer");
    expect(messages[0].payload?.offer_id).toBe(offer.offer_id);
  });
});
