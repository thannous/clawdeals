import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import {
  acceptOffer,
  configurePsp,
  createEscrow,
  createListing,
  createOffer,
  expectStatus,
  markDelivered,
  payEscrow,
  confirmReceived,
  postPspWebhook
} from "./helpers/http";
import { createSupabaseAdmin, createAgentDbWithOverrides, createActiveApiKeyDb, ensureOwnerDb, OPS_CONSOLE_OWNER_ID } from "./helpers/supabase";

import { canonicalJsonStringify } from "../../src/server/utils/canonical-json";
import { hmacSha256 } from "../../src/server/utils/hmac";

assertIntegrationEnv();

async function setupPolicy(request: any, ownerId: string) {
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
}

function signWebhook(body: any) {
  const secret = process.env.IDEMPOTENCY_SECRET as string;
  const canonicalBody = canonicalJsonStringify(body);
  return hmacSha256(secret, canonicalBody);
}

test.describe.serial("Integration: Escrow state machine (TI-211)", () => {
  test.setTimeout(90000);

  test("create -> pay -> webhook hold -> deliver -> confirm -> webhook payout -> released", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    await setupPolicy(request, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const configureRes = await configurePsp(
      request,
      OPS_CONSOLE_OWNER_ID,
      { provider: "mock", mode: "sandbox", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: 400 },
      { idempotencyKey: randomId() }
    );
    await expectStatus(configureRes, 200);

    const listingRes = await createListing(request, sellerApiKey, { title: `Escrow listing ${randomId()}`, publish: true });
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

    const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptRes, 200);
    const acceptBody = await acceptRes.json();
    const txId = acceptBody.transaction?.tx_id;
    expect(typeof txId).toBe("string");

    const idemCreate = randomId();
    const createRes = await createEscrow(request, buyerApiKey, txId, { idempotencyKey: idemCreate });
    await expectStatus(createRes, 201);
    const createBody = await createRes.json();
    const escrowId = createBody.escrow_id;
    expect(typeof escrowId).toBe("string");
    expect(createBody.status).toBe("CREATED");

    const replayCreate = await createEscrow(request, buyerApiKey, txId, { idempotencyKey: idemCreate });
    await expectStatus(replayCreate, 201);
    expect(replayCreate.headers()["idempotency-replayed"]).toBe("true");
    const replayBody = await replayCreate.json();
    expect(replayBody.escrow_id).toBe(escrowId);

    const payRes = await payEscrow(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(payRes, 200);
    const payBody = await payRes.json();
    const paymentId = payBody.psp?.payment_id;
    expect(typeof paymentId).toBe("string");

    const paymentWebhook = {
      id: `evt_${randomId()}`,
      type: "payment.succeeded",
      created_at: new Date().toISOString(),
      data: {
        payment_id: paymentId,
        hold_id: `hold_${randomId()}`,
        hold_expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      }
    };
    const paymentSig = signWebhook(paymentWebhook);
    const payHookRes = await postPspWebhook(request, { signature: paymentSig, body: paymentWebhook });
    await expectStatus(payHookRes, 200);

    const { data: escrowAfterHold, error: escrowHoldErr } = await supabase
      .from("escrows")
      .select("escrow_id,status,psp_payment_id,psp_hold_id,hold_expires_at")
      .eq("escrow_id", escrowId)
      .maybeSingle();
    if (escrowHoldErr) throw escrowHoldErr;
    expect(escrowAfterHold?.status).toBe("HOLD");
    expect(escrowAfterHold?.psp_payment_id).toBe(paymentId);
    expect(typeof escrowAfterHold?.psp_hold_id).toBe("string");

    const deliverKey1 = randomId();
    const deliverKey2 = randomId();
    const [deliverRes1, deliverRes2] = await Promise.all([
      markDelivered(request, sellerApiKey, escrowId, { idempotencyKey: deliverKey1 }),
      markDelivered(request, sellerApiKey, escrowId, { idempotencyKey: deliverKey2 })
    ]);
    await expectStatus(deliverRes1, 200);
    await expectStatus(deliverRes2, 200);
    const deliverBody1 = await deliverRes1.json();
    const deliverBody2 = await deliverRes2.json();
    expect(deliverBody1.status).toBe("DELIVERED");
    expect(deliverBody2.status).toBe("DELIVERED");

    const replayDelivered = await markDelivered(request, sellerApiKey, escrowId, { idempotencyKey: deliverKey1 });
    await expectStatus(replayDelivered, 200);
    expect(replayDelivered.headers()["idempotency-replayed"]).toBe("true");

    const confirmRes = await confirmReceived(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(confirmRes, 200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.status).toBe("RELEASE_PENDING");
    const payoutId = confirmBody.psp?.payout_id;
    expect(typeof payoutId).toBe("string");

    const payoutWebhook = {
      id: `evt_${randomId()}`,
      type: "payout.succeeded",
      created_at: new Date().toISOString(),
      data: {
        payout_id: payoutId
      }
    };
    const payoutSig = signWebhook(payoutWebhook);
    const payoutRes = await postPspWebhook(request, { signature: payoutSig, body: payoutWebhook });
    await expectStatus(payoutRes, 200);

    const { data: escrowAfterRelease, error: escrowReleaseErr } = await supabase
      .from("escrows")
      .select("escrow_id,status,released_at")
      .eq("escrow_id", escrowId)
      .maybeSingle();
    if (escrowReleaseErr) throw escrowReleaseErr;
    expect(escrowAfterRelease?.status).toBe("RELEASED");
    expect(escrowAfterRelease?.released_at).toBeTruthy();

    const invalidFinal = await markDelivered(request, sellerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(invalidFinal, 409);
    const invalidBody = await invalidFinal.json();
    expect(invalidBody?.error?.code).toBe("ESCROW_FINALIZED");
  });
});

