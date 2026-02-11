import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, createOffer, createCounterOffer, expectStatus } from "./helpers/http";
import { openSse, waitForSseFrame } from "./helpers/sse";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb
} from "./helpers/supabase";

assertIntegrationEnv();

const counterRouteExists = [
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter.js"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter/index.js")
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

test.describe.serial("Integration: Counter offers (TI-200)", () => {
  test.skip(!counterRouteExists, "TI-200 counter offer endpoint not implemented in this branch");

  test.setTimeout(60000);

  test("under budget => old COUNTERED + new CREATED + counter_offer message + SSE", async ({ request }) => {
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

    const listingRes = await createListing(request, sellerApiKey, { title: `Counter offer listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

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

    const sse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.countered,offer.created")}`, {
      headers: {
        Authorization: `Bearer ${sellerApiKey}`,
        Accept: "text/event-stream"
      }
    });

    try {
      expect(sse.res.status).toBe(200);
      await waitForSseFrame(sse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const counterRes = await createCounterOffer(
        request,
        sellerApiKey,
        offerId,
        { amount: 360, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(counterRes, 201);
      const counterBody = await counterRes.json();
      const newOfferId = counterBody.offer_id;

      expect(counterBody.previous_offer_id).toBe(offerId);
      expect(counterBody.thread_id).toBe(threadId);
      expect(counterBody.listing_id).toBe(listingId);
      expect(counterBody.buyer_agent_id).toBe(buyerAgent.id);
      expect(counterBody.seller_agent_id).toBe(sellerAgent.id);
      expect(counterBody.amount).toBe(360);
      expect(counterBody.currency).toBe("EUR");
      expect(counterBody.status).toBe("CREATED");

      const { data: oldRow, error: oldErr } = await supabase
        .from("offers")
        .select("offer_id,status")
        .eq("offer_id", offerId)
        .maybeSingle();
      if (oldErr) throw oldErr;
      expect(oldRow?.status).toBe("COUNTERED");

      const { data: newRow, error: newErr } = await supabase
        .from("offers")
        .select("offer_id,status,previous_offer_id,thread_id,listing_id,amount,currency")
        .eq("offer_id", newOfferId)
        .maybeSingle();
      if (newErr) throw newErr;
      expect(newRow?.status).toBe("CREATED");
      expect(newRow?.previous_offer_id).toBe(offerId);
      expect(newRow?.thread_id).toBe(threadId);
      expect(newRow?.listing_id).toBe(listingId);
      expect(newRow?.amount).toBe(360);
      expect(newRow?.currency).toBe("EUR");

      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("message_id,type,payload,thread_id,created_at,sender_id")
        .eq("thread_id", threadId)
        .eq("type", "counter_offer")
        .order("created_at", { ascending: false })
        .limit(1);
      if (msgErr) throw msgErr;
      expect((messages || []).length).toBeGreaterThan(0);
      expect(messages[0].payload?.type).toBe("counter_offer");
      expect(messages[0].payload?.offer_id).toBe(newOfferId);
      expect(messages[0].payload?.previous_offer_id).toBe(offerId);
      expect(messages[0].sender_id).toBe(sellerAgent.id);

      const counteredFrame = await waitForSseFrame(sse.res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "offer.countered" ? entry : undefined)
      });
      if (counteredFrame.type !== "event") throw new Error("Expected SSE event frame");
      const counteredEvent = JSON.parse(counteredFrame.data);
      expect(counteredEvent?.type).toBe("offer.countered");
      expect(counteredEvent?.entity?.id).toBe(offerId);
      expect(counteredEvent?.payload?.new_offer_id).toBe(newOfferId);
      expect(counteredEvent?.payload?.thread_id).toBe(threadId);
      expect(counteredEvent?.payload?.listing_id).toBe(listingId);

      const createdFrame = await waitForSseFrame(sse.res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "offer.created" ? entry : undefined)
      });
      if (createdFrame.type !== "event") throw new Error("Expected SSE event frame");
      const createdEvent = JSON.parse(createdFrame.data);
      expect(createdEvent?.type).toBe("offer.created");
      expect(createdEvent?.entity?.id).toBe(newOfferId);
      expect(createdEvent?.payload?.thread_id).toBe(threadId);
      expect(createdEvent?.payload?.listing_id).toBe(listingId);
      expect(createdEvent?.payload?.status).toBe("CREATED");
      expect(createdEvent?.payload?.previous_offer_id).toBe(offerId);
    } finally {
      sse.controller.abort();
    }
  });

  test("over budget => 409 APPROVAL_REQUIRED; approve counters old + creates new + counter_offer message", async ({ request }) => {
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

    const listingRes = await createListing(request, sellerApiKey, { title: `Counter over budget listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

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

    const counterRes = await createCounterOffer(
      request,
      sellerApiKey,
      offerId,
      { amount: 500, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(counterRes, 409);
    const counterBody = await counterRes.json();
    expect(counterBody?.error?.code).toBe("APPROVAL_REQUIRED");

    const approvalId = extractApprovalId(counterBody);
    expect(approvalId).toBeTruthy();

    const { data: approvalRow, error: approvalErr } = await supabase
      .from("approvals")
      .select("approval_id,action_type,state")
      .eq("approval_id", approvalId)
      .maybeSingle();
    if (approvalErr) throw approvalErr;
    expect(approvalRow?.action_type).toBe("offer_over_budget");
    expect(approvalRow?.state).toBe("PENDING");

    const approveRes = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(approveRes, 200);
    const approveBody = await approveRes.json();
    expect(approveBody?.data?.state).toBe("APPROVED");

    const { data: oldRow, error: oldErr } = await supabase
      .from("offers")
      .select("offer_id,status")
      .eq("offer_id", offerId)
      .maybeSingle();
    if (oldErr) throw oldErr;
    expect(oldRow?.status).toBe("COUNTERED");

    const { data: newOffers, error: newErr } = await supabase
      .from("offers")
      .select("offer_id,previous_offer_id,thread_id,amount,currency,status,created_at")
      .eq("previous_offer_id", offerId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (newErr) throw newErr;
    expect((newOffers || []).length).toBeGreaterThan(0);
    const newOffer = newOffers[0];
    expect(newOffer.previous_offer_id).toBe(offerId);
    expect(newOffer.thread_id).toBe(threadId);
    expect(newOffer.amount).toBe(500);
    expect(newOffer.currency).toBe("EUR");
    expect(newOffer.status).toBe("CREATED");

    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("message_id,type,payload,thread_id,created_at")
      .eq("thread_id", threadId)
      .eq("type", "counter_offer")
      .order("created_at", { ascending: false })
      .limit(1);
    if (msgErr) throw msgErr;
    expect((messages || []).length).toBeGreaterThan(0);
    expect(messages[0].payload?.type).toBe("counter_offer");
    expect(messages[0].payload?.offer_id).toBe(newOffer.offer_id);
    expect(messages[0].payload?.previous_offer_id).toBe(offerId);
  });

  test("idempotency replay => same offer_id + no duplicate offer/message", async ({ request }) => {
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

    const listingRes = await createListing(request, sellerApiKey, { title: `Counter idempotency listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

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

    const idemKey = randomId();
    const first = await createCounterOffer(
      request,
      sellerApiKey,
      offerId,
      { amount: 360, currency: "EUR", expiresAt },
      { idempotencyKey: idemKey }
    );
    await expectStatus(first, 201);
    const firstBody = await first.json();
    const newOfferId = firstBody.offer_id;

    const second = await createCounterOffer(
      request,
      sellerApiKey,
      offerId,
      { amount: 360, currency: "EUR", expiresAt },
      { idempotencyKey: idemKey }
    );
    await expectStatus(second, 201);
    expect(second.headers()["idempotency-replayed"]).toBe("true");
    const secondBody = await second.json();
    expect(secondBody.offer_id).toBe(newOfferId);

    const { data: offers, error: offersErr } = await supabase
      .from("offers")
      .select("offer_id")
      .eq("thread_id", threadId)
      .eq("previous_offer_id", offerId);
    if (offersErr) throw offersErr;
    expect((offers || []).length).toBe(1);

    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("message_id")
      .eq("thread_id", threadId)
      .eq("type", "counter_offer");
    if (msgErr) throw msgErr;
    expect((messages || []).length).toBe(1);
  });

  test("non-party cannot counter => 404 OFFER_NOT_FOUND", async ({ request }) => {
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

    const thirdOwnerId = randomId();
    await ensureOwnerDb(supabase, thirdOwnerId);
    const thirdAgent = await createAgentDbWithOverrides(supabase, thirdOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: thirdApiKey } = await createActiveApiKeyDb(supabase, thirdAgent.id);

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

    const listingRes = await createListing(request, sellerApiKey, { title: `Counter non-party listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

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

    const counterRes = await createCounterOffer(
      request,
      thirdApiKey,
      offerId,
      { amount: 360, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(counterRes, 404);
    const counterBody = await counterRes.json();
    expect(counterBody?.error?.code).toBe("OFFER_NOT_FOUND");
  });

  test("offer not counterable => 409 OFFER_NOT_COUNTERABLE", async ({ request }) => {
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

    const listingRes = await createListing(request, sellerApiKey, { title: `Counter not counterable listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

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

    const { error: updateErr } = await supabase.from("offers").update({ status: "DECLINED" }).eq("offer_id", offerId);
    if (updateErr) throw updateErr;

    const counterRes = await createCounterOffer(
      request,
      sellerApiKey,
      offerId,
      { amount: 360, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(counterRes, 409);
    const counterBody = await counterRes.json();
    expect(counterBody?.error?.code).toBe("OFFER_NOT_COUNTERABLE");
    expect(counterBody?.error?.details?.status).toBe("DECLINED");
  });

  test("counter chain => previous_offer_id linked list; only one CREATED", async ({ request }) => {
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

    const listingRes = await createListing(request, sellerApiKey, { title: `Counter chain listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

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
    const originalOfferId = offerBody.offer_id;
    const threadId = offerBody.thread_id;

    const counter1Res = await createCounterOffer(
      request,
      sellerApiKey,
      originalOfferId,
      { amount: 360, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(counter1Res, 201);
    const counter1Body = await counter1Res.json();
    const counter1Id = counter1Body.offer_id;
    expect(counter1Body.previous_offer_id).toBe(originalOfferId);

    const counter2Res = await createCounterOffer(
      request,
      buyerApiKey,
      counter1Id,
      { amount: 370, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(counter2Res, 201);
    const counter2Body = await counter2Res.json();
    const counter2Id = counter2Body.offer_id;
    expect(counter2Body.previous_offer_id).toBe(counter1Id);

    const { data: offers, error: offersErr } = await supabase
      .from("offers")
      .select("offer_id,status,previous_offer_id")
      .eq("thread_id", threadId);
    if (offersErr) throw offersErr;

    const byId: Record<string, any> = {};
    (offers || []).forEach((o: any) => {
      byId[o.offer_id] = o;
    });

    expect(byId[originalOfferId]?.status).toBe("COUNTERED");
    expect(byId[counter1Id]?.status).toBe("COUNTERED");
    expect(byId[counter2Id]?.status).toBe("CREATED");

    expect(byId[counter1Id]?.previous_offer_id).toBe(originalOfferId);
    expect(byId[counter2Id]?.previous_offer_id).toBe(counter1Id);

    const open = (offers || []).filter((o: any) => o.status === "CREATED");
    expect(open.length).toBe(1);
    expect(open[0].offer_id).toBe(counter2Id);
  });

  test("concurrent counters on same offer => only one succeeds", async ({ request }) => {
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
        budgets: { max_offer: 1000, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `Counter race listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingId = (await listingRes.json()).listing_id;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const offerRes = await createOffer(
      request,
      buyerApiKey,
      listingId,
      { threadId: null, amount: 350, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(offerRes, 201);
    const offerId = (await offerRes.json()).offer_id;

    const [sellerCounterRes, buyerCounterRes] = await Promise.all([
      createCounterOffer(
        request,
        sellerApiKey,
        offerId,
        { amount: 360, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      ),
      createCounterOffer(
        request,
        buyerApiKey,
        offerId,
        { amount: 355, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      )
    ]);

    const statuses = [sellerCounterRes.status(), buyerCounterRes.status()].sort();
    expect(statuses).toEqual([201, 409]);

    const okRes = sellerCounterRes.status() === 201 ? sellerCounterRes : buyerCounterRes;
    const failRes = sellerCounterRes.status() === 409 ? sellerCounterRes : buyerCounterRes;

    const okBody = await okRes.json();
    const failBody = await failRes.json();
    expect(okBody.offer_id).toBeTruthy();
    expect(okBody.previous_offer_id).toBe(offerId);
    expect(["OFFER_ALREADY_OPEN", "OFFER_NOT_COUNTERABLE"]).toContain(failBody?.error?.code);

    const { data: children, error: childrenErr } = await supabase
      .from("offers")
      .select("offer_id,status,previous_offer_id")
      .eq("previous_offer_id", offerId);
    if (childrenErr) throw childrenErr;
    expect((children || []).length).toBe(1);
    expect(children?.[0]?.status).toBe("CREATED");

    const { data: sourceOffer, error: sourceErr } = await supabase
      .from("offers")
      .select("offer_id,status")
      .eq("offer_id", offerId)
      .maybeSingle();
    if (sourceErr) throw sourceErr;
    expect(sourceOffer?.status).toBe("COUNTERED");
  });
});
