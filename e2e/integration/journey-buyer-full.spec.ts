import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";

import { assertIntegrationEnv, getApiBaseUrl } from "./helpers/env";
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
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb
} from "./helpers/supabase";

assertIntegrationEnv();

async function loginOwner(api: APIRequestContext, email: string) {
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
  return started.data.owner_id as string;
}

async function setupPolicy(request: any, ownerId: string) {
  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId },
    data: {
      budgets: { max_offer: 1000, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
      auto_approve: {
        message_types: ["question", "answer", "info"],
        actions: ["listing.create", "thread.create", "offer.accept"]
      },
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

test.describe.serial("Integration journey: Buyer full (TI-293)", () => {
  test.setTimeout(120000);

  test("search -> offer -> negotiate -> accept -> contact reveal -> complete -> rating", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const sellerOwnerId = randomId();
    const sellerEmail = `itest+seller-${sellerOwnerId.split("-")[0]}@example.com`;
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);
    await setVerifiedOwnerContact(supabase, sellerOwnerId, {
      email: sellerEmail,
      phoneE164: "+33600001234"
    });
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    const buyerEmail = `itest+buyer-${buyerOwnerId.split("-")[0]}@example.com`;
    await ensureOwnerDb(supabase, buyerOwnerId);
    await setupPolicy(request, buyerOwnerId);
    await setVerifiedOwnerContact(supabase, buyerOwnerId, {
      email: buyerEmail,
      phoneE164: "+33612345678"
    });
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const category = `ti293_buy_${randomId()}`;
    const listingRes = await createListing(request, sellerApiKey, {
      title: `TI-293 buyer journey ${randomId()}`,
      category,
      price: { amount: 199, currency: "EUR" },
      publish: true
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;
    expect(listingBody.status).toBe("LIVE");

    // Buyer searches listings (ensure it is discoverable before making an offer).
    const searchRes = await request.get(
      `/api/v1/listings?sort=price_asc&category=${encodeURIComponent(category)}&limit=20`,
      { headers: { Authorization: `Bearer ${buyerApiKey}` } }
    );
    await expectStatus(searchRes, 200);
    const searchBody = await searchRes.json();
    const ids = (searchBody.data || []).map((row: any) => row.listing_id);
    expect(ids).toContain(listingId);

    // Buyer creates offer; offer.created SSE is only emitted to the buyer (actor).
    const buyerOfferSse = await openSse(
      `/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.created")}`,
      {
        headers: {
          Authorization: `Bearer ${buyerApiKey}`,
          Accept: "text/event-stream"
        }
      }
    );

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
        { threadId: null, amount: 300, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(offerRes, 201);
      const offerBody = await offerRes.json();
      offerId = offerBody.offer_id;
      threadId = offerBody.thread_id;

      const ev = await waitForSseEvent(buyerOfferSse.res, "offer.created");
      expect(ev.entity?.id).toBe(offerId);
      expect(ev.payload?.listing_id).toBe(listingId);
      expect(ev.payload?.thread_id).toBe(threadId);
    } finally {
      buyerOfferSse.controller.abort();
    }

    // Negotiate: seller counters, buyer counters back, seller accepts final offer.
    const expiresAt2 = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const sellerCounterRes = await createCounterOffer(
      request,
      sellerApiKey,
      offerId,
      { amount: 320, currency: "EUR", expiresAt: expiresAt2 },
      { idempotencyKey: randomId() }
    );
    await expectStatus(sellerCounterRes, 201);
    const sellerCounterBody = await sellerCounterRes.json();
    const sellerCounterOfferId = sellerCounterBody.offer_id;

    const expiresAt3 = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const buyerCounterRes = await createCounterOffer(
      request,
      buyerApiKey,
      sellerCounterOfferId,
      { amount: 315, currency: "EUR", expiresAt: expiresAt3 },
      { idempotencyKey: randomId() }
    );
    await expectStatus(buyerCounterRes, 201);
    const buyerCounterBody = await buyerCounterRes.json();
    const finalOfferId = buyerCounterBody.offer_id;

    const acceptTypes = encodeURIComponent("offer.accepted");
    const buyerAcceptSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${acceptTypes}`, {
      headers: {
        Authorization: `Bearer ${buyerApiKey}`,
        Accept: "text/event-stream"
      }
    });
    const sellerAcceptSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${acceptTypes}`, {
      headers: {
        Authorization: `Bearer ${sellerApiKey}`,
        Accept: "text/event-stream"
      }
    });

    let txId: string;

    try {
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

      const acceptRes = await acceptOffer(request, sellerApiKey, finalOfferId, {
        idempotencyKey: randomId()
      });
      await expectStatus(acceptRes, 200);
      const acceptBody = await acceptRes.json();
      txId = acceptBody.transaction?.tx_id;
      expect(typeof txId).toBe("string");

      const buyerAccepted = await waitForSseEvent(buyerAcceptSse.res, "offer.accepted");
      const sellerAccepted = await waitForSseEvent(sellerAcceptSse.res, "offer.accepted");
      for (const ev of [buyerAccepted, sellerAccepted]) {
        expect(ev.payload?.listing_id).toBe(listingId);
        expect(ev.payload?.thread_id).toBe(threadId);
        expect(ev.payload?.transaction_id).toBe(txId);
      }
    } finally {
      buyerAcceptSse.controller.abort();
      sellerAcceptSse.controller.abort();
    }

    // Contact reveal request (buyer) + bilateral owner consent.
    const reqRes = await request.post(`/api/v1/transactions/${encodeURIComponent(txId)}/request-contact-reveal`, {
      headers: {
        Authorization: `Bearer ${buyerApiKey}`,
        "Idempotency-Key": randomId()
      },
      data: {}
    });
    await expectStatus(reqRes, 202);
    const reqBody = await reqRes.json();
    expect(typeof reqBody.approval_id).toBe("string");

    const { data: consents, error: consentError } = await supabase
      .from("approvals")
      .select("approval_id,owner_id")
      .eq("action_type", "contact_reveal_consent")
      .eq("action_ref_id", txId);
    if (consentError) throw consentError;
    const buyerConsent = consents?.find((row) => row.owner_id === buyerOwnerId);
    const sellerConsent = consents?.find((row) => row.owner_id === sellerOwnerId);
    expect(buyerConsent?.approval_id).toBeTruthy();
    expect(sellerConsent?.approval_id).toBeTruthy();

    const baseURL = getApiBaseUrl();
    const origin = new URL(baseURL).origin;
    const buyerOwner = await playwrightRequest.newContext({ baseURL });
    const sellerOwner = await playwrightRequest.newContext({ baseURL });
    try {
      expect(await loginOwner(buyerOwner, buyerEmail)).toBe(buyerOwnerId);
      expect(await loginOwner(sellerOwner, sellerEmail)).toBe(sellerOwnerId);
      const buyerApprove = await buyerOwner.post(`/api/v1/approvals/${buyerConsent?.approval_id}:approve`, {
        headers: { Origin: origin, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(buyerApprove, 200);
      const sellerApprove = await sellerOwner.post(`/api/v1/approvals/${sellerConsent?.approval_id}:approve`, {
        headers: { Origin: origin, "Idempotency-Key": randomId() },
        data: {}
      });
      await expectStatus(sellerApprove, 200);
      expect((await sellerApprove.json()).data.contact_reveal_state).toBe("APPROVED");
    } finally {
      await buyerOwner.dispose();
      await sellerOwner.dispose();
    }

    // Completion + rating.
    const buyerMark = await markTransactionCompleted(request, buyerApiKey, txId, { idempotencyKey: randomId() });
    await expectStatus(buyerMark, 200);

    const sellerMark = await markTransactionCompleted(request, sellerApiKey, txId, { idempotencyKey: randomId() });
    await expectStatus(sellerMark, 200);
    const sellerMarkBody = await sellerMark.json();
    expect(sellerMarkBody.status).toBe("COMPLETED");

    const ratingRes = await createTransactionRating(
      request,
      buyerApiKey,
      txId,
      { score: 5, reasonCode: "AS_DESCRIBED", comment: "All good" },
      { idempotencyKey: randomId() }
    );
    await expectStatus(ratingRes, 201);
    const ratingBody = await ratingRes.json();
    expect(ratingBody.tx_id).toBe(txId);
    expect(ratingBody.rater_agent_id).toBe(buyerAgent.id);
    expect(ratingBody.rated_agent_id).toBe(sellerAgent.id);
  });
});
