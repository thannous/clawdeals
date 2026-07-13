import { expect, test } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import {
  acceptOffer,
  createCounterOffer,
  createListing,
  createOffer,
  expectStatus
} from "./helpers/http";
import {
  createActiveApiKeyDb,
  createAgentDbWithOverrides,
  createSupabaseAdmin,
  ensureOwnerDb
} from "./helpers/supabase";

assertIntegrationEnv();

async function setupNegotiation(request: any, { allowAccept }: { allowAccept: boolean }) {
  const supabase = createSupabaseAdmin();
  const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const sellerOwnerId = randomId();
  await ensureOwnerDb(supabase, sellerOwnerId);
  const seller = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
    createdAt: agedCreatedAt
  });
  const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, seller.id);

  const buyerOwnerId = randomId();
  await ensureOwnerDb(supabase, buyerOwnerId);
  const buyer = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
    createdAt: agedCreatedAt
  });
  const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyer.id);

  const actions = ["listing.create", "thread.create"];
  if (allowAccept) actions.push("offer.accept");

  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": sellerOwnerId },
    data: {
      budgets: { max_offer: 500, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 500, contact_reveal: "always" },
      auto_approve: { message_types: [], actions },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    }
  });
  await expectStatus(policyRes, 200);

  const listingRes = await createListing(
    request,
    sellerApiKey,
    { title: `Security offer ${randomId()}`, publish: true },
    { idempotencyKey: randomId() }
  );
  await expectStatus(listingRes, 201);
  const listingId = (await listingRes.json()).listing_id;

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const initialRes = await createOffer(
    request,
    buyerApiKey,
    listingId,
    { amount: 350, currency: "EUR", expiresAt },
    { idempotencyKey: randomId() }
  );
  await expectStatus(initialRes, 201);

  return {
    supabase,
    seller,
    sellerApiKey,
    buyer,
    buyerApiKey,
    initialOffer: await initialRes.json(),
    expiresAt
  };
}

test.describe.serial("Security: offer authorization and state invariants", () => {
  test.setTimeout(60_000);

  test("requires the seller owner's current offer.accept policy", async ({ request }) => {
    const fixture = await setupNegotiation(request, { allowAccept: false });

    const acceptRes = await acceptOffer(
      request,
      fixture.sellerApiKey,
      fixture.initialOffer.offer_id,
      { idempotencyKey: randomId() }
    );
    await expectStatus(acceptRes, 409);
    const body = await acceptRes.json();
    expect(body.error.code).toBe("APPROVAL_REQUIRED");
    expect(body.error.details?.action).toBe("offer.accept");

    const { data: offer, error: offerError } = await fixture.supabase
      .from("offers")
      .select("status")
      .eq("offer_id", fixture.initialOffer.offer_id)
      .single();
    if (offerError) throw offerError;
    expect(offer.status).toBe("CREATED");
  });

  test("blocks seller self-acceptance and expired counters while preserving buyer-to-seller acceptance", async ({ request }) => {
    const fixture = await setupNegotiation(request, { allowAccept: true });

    const sellerCounterRes = await createCounterOffer(
      request,
      fixture.sellerApiKey,
      fixture.initialOffer.offer_id,
      { amount: 390, currency: "EUR", expiresAt: fixture.expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(sellerCounterRes, 201);
    const sellerCounter = await sellerCounterRes.json();

    const selfAcceptRes = await acceptOffer(
      request,
      fixture.sellerApiKey,
      sellerCounter.offer_id,
      { idempotencyKey: randomId() }
    );
    await expectStatus(selfAcceptRes, 409);
    const selfAcceptBody = await selfAcceptRes.json();
    expect(selfAcceptBody.error.code).toBe("OFFER_NOT_ACTIONABLE");
    expect(selfAcceptBody.error.details?.status).toBe("SELF_PROPOSED");

    const { error: expireError } = await fixture.supabase
      .from("offers")
      .update({ expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("offer_id", sellerCounter.offer_id);
    if (expireError) throw expireError;

    const expiredCounterRes = await createCounterOffer(
      request,
      fixture.buyerApiKey,
      sellerCounter.offer_id,
      { amount: 385, currency: "EUR", expiresAt: fixture.expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(expiredCounterRes, 409);
    const expiredBody = await expiredCounterRes.json();
    expect(expiredBody.error.code).toBe("OFFER_NOT_COUNTERABLE");
    expect(expiredBody.error.details?.status).toBe("EXPIRED");

    const { error: restoreError } = await fixture.supabase
      .from("offers")
      .update({ expires_at: fixture.expiresAt })
      .eq("offer_id", sellerCounter.offer_id);
    if (restoreError) throw restoreError;

    const buyerCounterRes = await createCounterOffer(
      request,
      fixture.buyerApiKey,
      sellerCounter.offer_id,
      { amount: 385, currency: "EUR", expiresAt: fixture.expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(buyerCounterRes, 201);
    const buyerCounter = await buyerCounterRes.json();

    const acceptRes = await acceptOffer(
      request,
      fixture.sellerApiKey,
      buyerCounter.offer_id,
      { idempotencyKey: randomId() }
    );
    await expectStatus(acceptRes, 200);
    const accepted = await acceptRes.json();
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.transaction.buyer_agent_id).toBe(fixture.buyer.id);
    expect(accepted.transaction.seller_agent_id).toBe(fixture.seller.id);
  });
});
