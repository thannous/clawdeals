import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import {
  createListing,
  createOffer,
  createCounterOffer,
  acceptOffer,
  markTransactionCompleted,
  createTransactionRating,
  expectStatus
} from "./helpers/http";
import { openSse, waitForSseFrame } from "./helpers/sse";
import {
  createSupabaseAdmin,
  ensureOpsConsoleAgent,
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";

assertIntegrationEnv();

async function setupPolicy(request: any, ownerId: string) {
  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId },
    data: {
      budgets: { max_offer: 1000, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
      auto_approve: { message_types: ["question", "answer", "info"], actions: ["listing.create", "thread.create", "offer.accept"] },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    }
  });
  await expectStatus(policyRes, 200);
}

async function setVerifiedOwnerContact(
  supabase: any,
  ownerId: string,
  { email, phoneE164 }: { email: string; phoneE164: string }
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("owners")
    .update({
      email,
      email_verified_at: now,
      phone_e164: phoneE164,
      phone_verified_at: now,
      updated_at: now
    })
    .eq("owner_id", ownerId);
  if (error) throw error;
}

async function waitForSseEvent(response: Response, eventName: string) {
  const frame = await waitForSseFrame(response, {
    timeoutMs: 7500,
    onFrame: (entry) => (entry.type === "event" && entry.event === eventName ? entry : undefined)
  });
  if (frame.type !== "event") throw new Error("Expected SSE event frame");
  return JSON.parse(frame.data);
}

test.describe.serial("Integration journey: Seller full (TI-293)", () => {
  test.setTimeout(120000);

  test("listing -> offer -> counter chain -> accept -> contact reveal -> complete -> rating", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);
    await setVerifiedOwnerContact(supabase, sellerOwnerId, {
      email: `itest+seller-${sellerOwnerId.split("-")[0]}@example.com`,
      phoneE164: "+33600001234"
    });
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    await setVerifiedOwnerContact(supabase, buyerOwnerId, {
      email: `itest+buyer-${buyerOwnerId.split("-")[0]}@example.com`,
      phoneE164: "+33612345678"
    });
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, {
      title: `TI-293 seller journey ${randomId()}`,
      category: `ti293_${randomId()}`,
      price: { amount: 200, currency: "EUR" },
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    expect(listingBody.status).toBe("LIVE");
    const listingId = listingBody.listing_id;

    // Buyer creates offer; offer.created SSE is only emitted to the buyer (actor).
    const buyerOfferSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.created")}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });

    let offerId: string;
    let threadId: string;

    try {
      expect(buyerOfferSse.res.status).toBe(200);
      await waitForSseFrame(buyerOfferSse.res, {
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
      offerId = offerBody.offer_id;
      threadId = offerBody.thread_id;

      const ev = await waitForSseEvent(buyerOfferSse.res, "offer.created");
      expect(ev.type).toBe("offer.created");
      expect(ev.entity?.id).toBe(offerId);
      expect(ev.payload?.listing_id).toBe(listingId);
      expect(ev.payload?.thread_id).toBe(threadId);
    } finally {
      buyerOfferSse.controller.abort();
    }

    // Seller counters the buyer's offer (countered + created are only emitted to the countering agent).
    const sellerCounterSse = await openSse(
      `/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.countered,offer.created")}`,
      {
        headers: { Authorization: `Bearer ${sellerApiKey}`, Accept: "text/event-stream" }
      }
    );

    let sellerCounterOfferId: string;
    try {
      expect(sellerCounterSse.res.status).toBe(200);
      await waitForSseFrame(sellerCounterSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const counterRes = await createCounterOffer(
        request,
        sellerApiKey,
        offerId,
        { amount: 360, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(counterRes, 201);
      const counterBody = await counterRes.json();
      sellerCounterOfferId = counterBody.offer_id;

      const countered = await waitForSseEvent(sellerCounterSse.res, "offer.countered");
      expect(countered.entity?.id).toBe(offerId);
      expect(countered.payload?.new_offer_id).toBe(sellerCounterOfferId);

      const created = await waitForSseEvent(sellerCounterSse.res, "offer.created");
      expect(created.entity?.id).toBe(sellerCounterOfferId);
      expect(created.payload?.previous_offer_id).toBe(offerId);

      const { data: prevRow, error: prevErr } = await supabase
        .from("offers")
        .select("status")
        .eq("offer_id", offerId)
        .maybeSingle();
      if (prevErr) throw prevErr;
      expect(prevRow?.status).toBe("COUNTERED");
    } finally {
      sellerCounterSse.controller.abort();
    }

    // Buyer counters seller's counter; seller accepts the latest offer (seller-only accept).
    const buyerCounterSse = await openSse(
      `/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.countered,offer.created")}`,
      {
        headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
      }
    );

    let buyerCounterOfferId: string;
    try {
      expect(buyerCounterSse.res.status).toBe(200);
      await waitForSseFrame(buyerCounterSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const counterRes = await createCounterOffer(
        request,
        buyerApiKey,
        sellerCounterOfferId,
        { amount: 355, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(counterRes, 201);
      const counterBody = await counterRes.json();
      buyerCounterOfferId = counterBody.offer_id;

      const countered = await waitForSseEvent(buyerCounterSse.res, "offer.countered");
      expect(countered.entity?.id).toBe(sellerCounterOfferId);
      expect(countered.payload?.new_offer_id).toBe(buyerCounterOfferId);

      const created = await waitForSseEvent(buyerCounterSse.res, "offer.created");
      expect(created.entity?.id).toBe(buyerCounterOfferId);
      expect(created.payload?.previous_offer_id).toBe(sellerCounterOfferId);
    } finally {
      buyerCounterSse.controller.abort();
    }

    const acceptTypes = encodeURIComponent("offer.accepted,transaction.created");
    const buyerAcceptSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${acceptTypes}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });
    const sellerAcceptSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${acceptTypes}`, {
      headers: { Authorization: `Bearer ${sellerApiKey}`, Accept: "text/event-stream" }
    });

    let txId: string;

    try {
      expect(buyerAcceptSse.res.status).toBe(200);
      expect(sellerAcceptSse.res.status).toBe(200);
      await Promise.all([
        waitForSseFrame(buyerAcceptSse.res, {
          timeoutMs: 2500,
          onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
        }),
        waitForSseFrame(sellerAcceptSse.res, {
          timeoutMs: 2500,
          onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
        })
      ]);

      const acceptRes = await acceptOffer(request, sellerApiKey, buyerCounterOfferId, { idempotencyKey: randomId() });
      await expectStatus(acceptRes, 200);
      const acceptBody = await acceptRes.json();
      txId = acceptBody.transaction?.tx_id;
      expect(typeof txId).toBe("string");

      const buyerAccepted = await waitForSseEvent(buyerAcceptSse.res, "offer.accepted");
      const sellerAccepted = await waitForSseEvent(sellerAcceptSse.res, "offer.accepted");
      for (const ev of [buyerAccepted, sellerAccepted]) {
        expect(ev.type).toBe("offer.accepted");
        expect(ev.payload?.listing_id).toBe(listingId);
        expect(ev.payload?.thread_id).toBe(threadId);
        expect(ev.payload?.transaction_id).toBe(txId);
      }

      const { data: listingRow, error: listingErr } = await supabase
        .from("listings")
        .select("status,reserved_at")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (listingErr) throw listingErr;
      expect(listingRow?.status).toBe("RESERVED");
      expect(listingRow?.reserved_at).toBeTruthy();
    } finally {
      buyerAcceptSse.controller.abort();
      sellerAcceptSse.controller.abort();
    }

    // Contact reveal: buyer requests, ops approves.
    const contactTypes = encodeURIComponent("contact_reveal.requested,contact_reveal.approved");
    const buyerContactSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${contactTypes}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });
    const sellerContactSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${contactTypes}`, {
      headers: { Authorization: `Bearer ${sellerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      await Promise.all([
        waitForSseFrame(buyerContactSse.res, {
          timeoutMs: 2500,
          onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
        }),
        waitForSseFrame(sellerContactSse.res, {
          timeoutMs: 2500,
          onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
        })
      ]);

      const reqRes = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/request-contact-reveal`, {
        headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(reqRes, 202);
      const reqBody = await reqRes.json();
      expect(reqBody.tx_id).toBe(txId);
      expect(typeof reqBody.approval_id).toBe("string");

      const approvalId = reqBody.approval_id;

      const buyerRequested = await waitForSseEvent(buyerContactSse.res, "contact_reveal.requested");
      const sellerRequested = await waitForSseEvent(sellerContactSse.res, "contact_reveal.requested");
      for (const ev of [buyerRequested, sellerRequested]) {
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.approval_id).toBe(approvalId);
      }

      const approveRes = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/approve-contact-reveal`, {
        headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(approveRes, 200);
      const approveBody = await approveRes.json();
      expect(approveBody.tx_id).toBe(txId);
      expect(approveBody.contact_reveal_state).toBe("APPROVED");

      const buyerApproved = await waitForSseEvent(buyerContactSse.res, "contact_reveal.approved");
      const sellerApproved = await waitForSseEvent(sellerContactSse.res, "contact_reveal.approved");
      for (const ev of [buyerApproved, sellerApproved]) {
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.contact_reveal_state).toBe("APPROVED");
      }
    } finally {
      buyerContactSse.controller.abort();
      sellerContactSse.controller.abort();
    }

    // Completion: buyer then seller.
    const buyerMark = await markTransactionCompleted(request, buyerApiKey, txId, { idempotencyKey: randomId() });
    await expectStatus(buyerMark, 200);
    const buyerMarkBody = await buyerMark.json();
    expect(buyerMarkBody.status).toBe("COMPLETED_PENDING_CONFIRM");

    const sellerMark = await markTransactionCompleted(request, sellerApiKey, txId, { idempotencyKey: randomId() });
    await expectStatus(sellerMark, 200);
    const sellerMarkBody = await sellerMark.json();
    expect(sellerMarkBody.status).toBe("COMPLETED");

    const { data: txRow, error: txErr } = await supabase
      .from("transactions")
      .select("status,buyer_completed_at,seller_completed_at")
      .eq("tx_id", txId)
      .maybeSingle();
    if (txErr) throw txErr;
    expect(txRow?.status).toBe("COMPLETED");
    expect(txRow?.buyer_completed_at).toBeTruthy();
    expect(txRow?.seller_completed_at).toBeTruthy();

    const { data: listingRowCompleted, error: listingErr2 } = await supabase
      .from("listings")
      .select("status,completed_at")
      .eq("listing_id", listingId)
      .maybeSingle();
    if (listingErr2) throw listingErr2;
    expect(listingRowCompleted?.status).toBe("COMPLETED");
    expect(listingRowCompleted?.completed_at).toBeTruthy();

    // Rating (buyer -> seller).
    const ratingRes = await createTransactionRating(
      request,
      buyerApiKey,
      txId,
      { score: 5, reasonCode: "AS_DESCRIBED", comment: "Great deal" },
      { idempotencyKey: randomId() }
    );
    await expectStatus(ratingRes, 201);
    const ratingBody = await ratingRes.json();
    expect(ratingBody.tx_id).toBe(txId);
    expect(ratingBody.rater_agent_id).toBe(buyerAgent.id);
    expect(ratingBody.rated_agent_id).toBe(sellerAgent.id);
  });
});
