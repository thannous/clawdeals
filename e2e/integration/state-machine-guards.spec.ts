import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import {
  acceptOffer,
  confirmReceived,
  createCounterOffer,
  createEscrow,
  createListing,
  createOffer,
  declineOffer,
  expectStatus,
  markDelivered,
  openDispute,
  payEscrow,
  configurePsp
} from "./helpers/http";
import { setupEscrowOnHold } from "./helpers/escrow";
import { createAcceptedTransactionFixture, setupPolicyForOwner } from "./helpers/marketplace";
import {
  createActiveApiKeyDb,
  createAgentDbWithOverrides,
  createSupabaseAdmin,
  ensureOwnerDb,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";

assertIntegrationEnv();

async function setupOfferFixture(request: any) {
  const supabase = createSupabaseAdmin();

  const sellerOwnerId = randomId();
  await ensureOwnerDb(supabase, sellerOwnerId);
  await setupPolicyForOwner(request, sellerOwnerId);
  const buyerOwnerId = randomId();
  await ensureOwnerDb(supabase, buyerOwnerId);

  const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
    createdAt: agedCreatedAt,
    trustScore: 90,
    trustFlags: []
  });
  const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

  const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
    createdAt: agedCreatedAt,
    trustScore: 90,
    trustFlags: []
  });
  const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

  const listingRes = await createListing(request, sellerApiKey, { title: `State guard listing ${randomId()}`, publish: true });
  await expectStatus(listingRes, 201);
  const listingId = (await listingRes.json()).listing_id;

  const threadRes = await request.post(`/api/v1/listings/${encodeURIComponent(listingId)}/threads`, {
    headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
    data: {}
  });
  await expectStatus(threadRes, 201);
  const threadId = (await threadRes.json()).thread_id;

  const seedNow = Date.now();
  const { data: seededOffer, error: seedErr } = await supabase
    .from("offers")
    .insert({
      thread_id: threadId,
      listing_id: listingId,
      buyer_agent_id: buyerAgent.id,
      seller_agent_id: sellerAgent.id,
      amount: 350,
      currency: "EUR",
      created_at: new Date(seedNow - 5 * 60 * 1000).toISOString(),
      updated_at: new Date(seedNow - 5 * 60 * 1000).toISOString(),
      expires_at: new Date(seedNow + 5 * 60 * 1000).toISOString(),
      status: "CREATED"
    })
    .select("offer_id")
    .single();
  if (seedErr) throw seedErr;
  const offerId = seededOffer.offer_id;

  return {
    supabase,
    sellerApiKey,
    buyerApiKey,
    listingId,
    offerId
  };
}

test.describe.serial("Integration: State machine guards", () => {
  test.setTimeout(120000);

  test("offer actions guard invalid transitions", async ({ request }) => {
    const fixture = await setupOfferFixture(request);

    const declineRes = await declineOffer(request, fixture.sellerApiKey, fixture.offerId, { idempotencyKey: randomId() });
    await expectStatus(declineRes, 200);

    const acceptDeclined = await acceptOffer(request, fixture.sellerApiKey, fixture.offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptDeclined, 409);
    const acceptDeclinedBody = await acceptDeclined.json();
    expect(acceptDeclinedBody?.error?.code).toBe("OFFER_NOT_ACTIONABLE");
    expect(acceptDeclinedBody?.error?.details?.status).toBe("DECLINED");

    const createdAtPast = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiresAtPast = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error: expireErr } = await fixture.supabase
      .from("offers")
      .update({
        created_at: createdAtPast,
        status: "EXPIRED",
        expires_at: expiresAtPast,
        updated_at: new Date().toISOString()
      })
      .eq("offer_id", fixture.offerId);
    if (expireErr) throw expireErr;

    const { data: expiredRow, error: expiredRowErr } = await fixture.supabase
      .from("offers")
      .select("status,created_at,expires_at")
      .eq("offer_id", fixture.offerId)
      .maybeSingle();
    if (expiredRowErr) throw expiredRowErr;
    expect(expiredRow?.status).toBe("EXPIRED");
    expect(Date.parse(String(expiredRow?.expires_at))).toBeLessThan(Date.now());

    const acceptExpired = await acceptOffer(request, fixture.sellerApiKey, fixture.offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptExpired, 409);
    const acceptExpiredBody = await acceptExpired.json();
    expect(acceptExpiredBody?.error?.code).toBe("OFFER_NOT_ACTIONABLE");
    expect(acceptExpiredBody?.error?.details?.status).toBe("EXPIRED");

    const futureOfferDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error: reopenErr } = await fixture.supabase
      .from("offers")
      .update({
        status: "CREATED",
        expires_at: futureOfferDate,
        updated_at: new Date().toISOString()
      })
      .eq("offer_id", fixture.offerId);
    if (reopenErr) throw reopenErr;

    const acceptRes = await acceptOffer(request, fixture.sellerApiKey, fixture.offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptRes, 200);

    const counterAccepted = await createCounterOffer(
      request,
      fixture.sellerApiKey,
      fixture.offerId,
      { amount: 380, currency: "EUR", expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
      { idempotencyKey: randomId() }
    );
    await expectStatus(counterAccepted, 409);
    const counterAcceptedBody = await counterAccepted.json();
    expect(counterAcceptedBody?.error?.code).toBe("OFFER_NOT_COUNTERABLE");
    expect(counterAcceptedBody?.error?.details?.status).toBe("ACCEPTED");

    const { error: markDeclinedErr } = await fixture.supabase
      .from("offers")
      .update({
        status: "DECLINED",
        updated_at: new Date().toISOString()
      })
      .eq("offer_id", fixture.offerId);
    if (markDeclinedErr) throw markDeclinedErr;

    const counterDeclined = await createCounterOffer(
      request,
      fixture.sellerApiKey,
      fixture.offerId,
      { amount: 380, currency: "EUR", expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() },
      { idempotencyKey: randomId() }
    );
    await expectStatus(counterDeclined, 409);
    const counterDeclinedBody = await counterDeclined.json();
    expect(counterDeclinedBody?.error?.code).toBe("OFFER_NOT_COUNTERABLE");
    expect(counterDeclinedBody?.error?.details?.status).toBe("DECLINED");
  });

  test("listing guards: self-offer and not-live states", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicyForOwner(request, sellerOwnerId);
    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingSelfRes = await createListing(request, sellerApiKey, { title: `Self offer listing ${randomId()}`, publish: true });
    await expectStatus(listingSelfRes, 201);
    const listingSelfId = (await listingSelfRes.json()).listing_id;

    const selfOfferRes = await createOffer(
      request,
      sellerApiKey,
      listingSelfId,
      { threadId: null, amount: 200, currency: "EUR", expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
      { idempotencyKey: randomId() }
    );
    await expectStatus(selfOfferRes, 400);
    const selfOfferBody = await selfOfferRes.json();
    expect(selfOfferBody?.error?.code).toBe("SELF_OFFER_FORBIDDEN");

    for (const status of ["COMPLETED", "REMOVED", "RESERVED"]) {
      const listingRes = await createListing(request, sellerApiKey, { title: `Not live ${status} ${randomId()}`, publish: true });
      await expectStatus(listingRes, 201);
      const listingId = (await listingRes.json()).listing_id;

      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = { status, updated_at: nowIso };
      if (status === "COMPLETED") {
        patch.completed_at = nowIso;
      }
      if (status === "RESERVED") {
        patch.reserved_at = nowIso;
      }

      const { error: statusErr } = await supabase.from("listings").update(patch).eq("listing_id", listingId);
      if (statusErr) throw statusErr;

      const offerRes = await createOffer(
        request,
        buyerApiKey,
        listingId,
        { threadId: null, amount: 210, currency: "EUR", expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
        { idempotencyKey: randomId() }
      );
      await expectStatus(offerRes, 409);
      const body = await offerRes.json();
      expect(body?.error?.code).toBe("LISTING_NOT_LIVE");
    }

    // Keep the fixture used to avoid lint false positives on buyer agent setup.
    expect(buyerAgent.id).toBeTruthy();
  });

  test("escrow guards: invalid actions on CREATED", async ({ request }) => {
    const fixture = await createAcceptedTransactionFixture(request, { listingTitlePrefix: "Escrow guards listing", setupBuyerPolicy: true });

    const configureRes = await configurePsp(
      request,
      OPS_CONSOLE_OWNER_ID,
      { provider: "mock", mode: "sandbox", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: 400 },
      { idempotencyKey: randomId() }
    );
    await expectStatus(configureRes, 200);

    const createRes = await createEscrow(request, fixture.buyerApiKey, fixture.txId, { idempotencyKey: randomId() });
    await expectStatus(createRes, 201);
    const escrowId = (await createRes.json()).escrow_id;

    const deliverRes = await markDelivered(request, fixture.sellerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(deliverRes, 409);
    const deliverBody = await deliverRes.json();
    expect(deliverBody?.error?.code).toBe("INVALID_STATE");
    expect(deliverBody?.error?.details?.status).toBe("CREATED");

    const payRes = await payEscrow(request, fixture.buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(payRes, 200);

    const confirmRes = await confirmReceived(request, fixture.buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(confirmRes, 409);
    const confirmBody = await confirmRes.json();
    expect(confirmBody?.error?.code).toBe("INVALID_STATE");
    expect(confirmBody?.error?.details?.status).toBe("CREATED");
  });

  test("dispute guards: cannot open on RELEASED/REFUNDED", async ({ request }) => {
    const releasedFixture = await setupEscrowOnHold(request, { listingTitlePrefix: "Dispute guard released listing" });
    const releasedAt = new Date().toISOString();
    const { error: releasePatchErr } = await releasedFixture.supabase
      .from("escrows")
      .update({ status: "RELEASED", released_at: releasedAt, updated_at: releasedAt })
      .eq("escrow_id", releasedFixture.escrowId);
    if (releasePatchErr) throw releasePatchErr;

    const releaseDisputeRes = await openDispute(
      request,
      releasedFixture.buyerApiKey,
      releasedFixture.escrowId,
      { reasonCode: "other", notes: "should fail released" },
      { idempotencyKey: randomId() }
    );
    await expectStatus(releaseDisputeRes, 409);
    const releaseBody = await releaseDisputeRes.json();
    expect(releaseBody?.error?.code).toBe("INVALID_STATE");
    expect(releaseBody?.error?.details?.status).toBe("RELEASED");

    const refundedFixture = await setupEscrowOnHold(request, { listingTitlePrefix: "Dispute guard refunded listing" });
    const refundedAt = new Date().toISOString();
    const { error: refundPatchErr } = await refundedFixture.supabase
      .from("escrows")
      .update({ status: "REFUNDED", refunded_at: refundedAt, updated_at: refundedAt })
      .eq("escrow_id", refundedFixture.escrowId);
    if (refundPatchErr) throw refundPatchErr;

    const refundDisputeRes = await openDispute(
      request,
      refundedFixture.buyerApiKey,
      refundedFixture.escrowId,
      { reasonCode: "other", notes: "should fail refunded" },
      { idempotencyKey: randomId() }
    );
    await expectStatus(refundDisputeRes, 409);
    const refundBody = await refundDisputeRes.json();
    expect(refundBody?.error?.code).toBe("INVALID_STATE");
    expect(refundBody?.error?.details?.status).toBe("REFUNDED");
  });
});
