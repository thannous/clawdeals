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
  postPspWebhook,
  pspOnboardSeller
} from "./helpers/http";
import { createSupabaseAdmin, createAgentDbWithOverrides, createActiveApiKeyDb, ensureOwnerDb, OPS_CONSOLE_OWNER_ID } from "./helpers/supabase";

import { canonicalJsonStringify } from "../../src/server/utils/canonical-json";
import { hmacSha256 } from "../../src/server/utils/hmac";

assertIntegrationEnv();

async function setupPolicy(request: any, ownerId: string) {
  function randomTestIp() {
    // Must be a valid inet for audit logs, but unique enough to avoid rate-limit key collisions.
    const hex = randomId().replace(/-/g, "");
    const a = (parseInt(hex.slice(0, 2), 16) % 250) + 1;
    const b = (parseInt(hex.slice(2, 4), 16) % 250) + 1;
    const c = (parseInt(hex.slice(4, 6), 16) % 250) + 1;
    return `10.${a}.${b}.${c}`;
  }

  const policyRes = await request.put("/api/v1/policies", {
    // Many owner-scoped routes fall back to IP for rate limiting when no agentId is present.
    // Use a unique IP per call to prevent cross-test interference when Upstash state persists.
    headers: { "x-owner-id": ownerId, "x-forwarded-for": randomTestIp() },
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

    const { data: grossLedger, error: grossLedgerErr } = await supabase
      .from("ledger_entries")
      .select("ledger_entry_id,type,amount_minor,currency,psp_reference_id")
      .eq("escrow_id", escrowId)
      .eq("type", "GROSS");
    if (grossLedgerErr) throw grossLedgerErr;
    expect((grossLedger || []).length).toBe(1);
    expect(grossLedger?.[0]?.amount_minor).toBe(createBody.amount_gross_minor);
    expect(grossLedger?.[0]?.currency).toBe(createBody.currency);
    expect(grossLedger?.[0]?.psp_reference_id).toBe(paymentId);

    // Duplicate webhook event id (different psp_event_id) should not create a second ledger entry.
    const duplicatePaymentWebhook = {
      id: `evt_${randomId()}`,
      type: "payment.succeeded",
      created_at: new Date().toISOString(),
      data: {
        payment_id: paymentId,
        hold_id: `hold_${randomId()}`,
        hold_expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      }
    };
    const duplicateSig = signWebhook(duplicatePaymentWebhook);
    const dupRes = await postPspWebhook(request, { signature: duplicateSig, body: duplicatePaymentWebhook });
    await expectStatus(dupRes, 200);

    const { data: grossLedgerAfterDup, error: grossLedgerDupErr } = await supabase
      .from("ledger_entries")
      .select("ledger_entry_id,type")
      .eq("escrow_id", escrowId)
      .eq("type", "GROSS");
    if (grossLedgerDupErr) throw grossLedgerDupErr;
    expect((grossLedgerAfterDup || []).length).toBe(1);

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

    const { data: feeLedger, error: feeLedgerErr } = await supabase
      .from("ledger_entries")
      .select("type,amount_minor,currency,psp_reference_id")
      .eq("escrow_id", escrowId)
      .in("type", ["PLATFORM_FEE", "NET_TO_SELLER"]);
    if (feeLedgerErr) throw feeLedgerErr;
    const types = new Set((feeLedger || []).map((row: any) => row.type));
    expect(types.has("PLATFORM_FEE")).toBe(true);
    expect(types.has("NET_TO_SELLER")).toBe(true);

    const platformFee = (feeLedger || []).find((row: any) => row.type === "PLATFORM_FEE");
    const netToSeller = (feeLedger || []).find((row: any) => row.type === "NET_TO_SELLER");
    expect(platformFee?.amount_minor).toBe(createBody.amount_platform_fee_minor);
    expect(netToSeller?.amount_minor).toBe(createBody.amount_net_minor);
    expect(platformFee?.currency).toBe(createBody.currency);
    expect(netToSeller?.currency).toBe(createBody.currency);
    expect(platformFee?.psp_reference_id).toBe(payoutId);
    expect(netToSeller?.psp_reference_id).toBe(payoutId);

    const invalidFinal = await markDelivered(request, sellerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(invalidFinal, 409);
    const invalidBody = await invalidFinal.json();
    expect(invalidBody?.error?.code).toBe("ESCROW_FINALIZED");
  });

  test("seller onboarding + KYC verified gates escrow:create in production mode (TI-294)", async ({ request }) => {
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

    // Production mode enables KYC gating in escrow:create.
    await expectStatus(
      await configurePsp(
        request,
        OPS_CONSOLE_OWNER_ID,
        { provider: "mock", mode: "production", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: 400 },
        { idempotencyKey: randomId() }
      ),
      200
    );

    const listingRes = await createListing(request, sellerApiKey, { title: `KYC escrow listing ${randomId()}`, publish: true });
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

    const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptRes, 200);
    const txId = (await acceptRes.json()).transaction?.tx_id;
    expect(typeof txId).toBe("string");

    // Without a VERIFIED PSP account, escrow:create must be blocked in production mode.
    const blockedRes = await createEscrow(request, buyerApiKey, txId, { idempotencyKey: randomId() });
    await expectStatus(blockedRes, 403);
    const blockedBody = await blockedRes.json();
    expect(blockedBody?.error?.code).toBe("SELLER_KYC_REQUIRED");

    // Seller onboarding + KYC webhook -> VERIFIED.
    const onboardRes = await pspOnboardSeller(request, sellerOwnerId, { idempotencyKey: randomId() });
    await expectStatus(onboardRes, 200);

    const kycEvent = {
      id: `evt_${randomId()}`,
      type: "account.updated",
      created_at: new Date().toISOString(),
      data: {
        external_account_id: `mock_acct_${sellerOwnerId}`,
        kyc_status: "VERIFIED",
        requirements_due: { fields: [] }
      }
    };
    await expectStatus(await postPspWebhook(request, { signature: signWebhook(kycEvent), body: kycEvent }), 200);

    // Now escrow:create should succeed.
    const createRes = await createEscrow(request, buyerApiKey, txId, { idempotencyKey: randomId() });
    await expectStatus(createRes, 201);
    const createBody = await createRes.json();
    const escrowId = createBody.escrow_id;
    expect(typeof escrowId).toBe("string");

    const payRes = await payEscrow(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(payRes, 200);
    const paymentId = (await payRes.json()).psp?.payment_id;
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
    await expectStatus(await postPspWebhook(request, { signature: signWebhook(paymentWebhook), body: paymentWebhook }), 200);

    await expectStatus(await markDelivered(request, sellerApiKey, escrowId, { idempotencyKey: randomId() }), 200);

    const confirmRes = await confirmReceived(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(confirmRes, 200);
    const payoutId = (await confirmRes.json()).psp?.payout_id;
    expect(typeof payoutId).toBe("string");

    const payoutWebhook = {
      id: `evt_${randomId()}`,
      type: "payout.succeeded",
      created_at: new Date().toISOString(),
      data: { payout_id: payoutId }
    };
    await expectStatus(await postPspWebhook(request, { signature: signWebhook(payoutWebhook), body: payoutWebhook }), 200);

    const { data: escrowAfterRelease, error: releaseErr } = await supabase
      .from("escrows")
      .select("escrow_id,status,released_at")
      .eq("escrow_id", escrowId)
      .maybeSingle();
    if (releaseErr) throw releaseErr;
    expect(escrowAfterRelease?.status).toBe("RELEASED");
    expect(escrowAfterRelease?.released_at).toBeTruthy();
  });

  test("fee edge cases (0 bps / rounding / max) are reflected in escrow amounts + ledger (TI-294)", async ({ request }) => {
    test.setTimeout(120000);

    const cases = [
      { feeBps: 0, amount: 250 },
      { feeBps: 333, amount: 351 },
      { feeBps: 2000, amount: 250 }
    ];

    for (const testCase of cases) {
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

      await expectStatus(
        await configurePsp(
          request,
          OPS_CONSOLE_OWNER_ID,
          { provider: "mock", mode: "sandbox", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: testCase.feeBps },
          { idempotencyKey: randomId() }
        ),
        200
      );

      const listingRes = await createListing(request, sellerApiKey, { title: `Fee listing ${randomId()}`, publish: true });
      await expectStatus(listingRes, 201);
      const listingId = (await listingRes.json()).listing_id;

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const offerRes = await createOffer(
        request,
        buyerApiKey,
        listingId,
        { threadId: null, amount: testCase.amount, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(offerRes, 201);
      const offerId = (await offerRes.json()).offer_id;

      const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
      await expectStatus(acceptRes, 200);
      const txId = (await acceptRes.json()).transaction?.tx_id;
      expect(typeof txId).toBe("string");

      const createRes = await createEscrow(request, buyerApiKey, txId, { idempotencyKey: randomId() });
      await expectStatus(createRes, 201);
      const createBody = await createRes.json();
      const escrowId = createBody.escrow_id;
      expect(typeof escrowId).toBe("string");
      expect(createBody.platform_fee_bps).toBe(testCase.feeBps);

      const expectedFee = Math.round((createBody.amount_gross_minor * testCase.feeBps) / 10000);
      const expectedNet = createBody.amount_gross_minor - expectedFee;
      expect(createBody.amount_platform_fee_minor).toBe(expectedFee);
      expect(createBody.amount_net_minor).toBe(expectedNet);

      const payRes = await payEscrow(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
      await expectStatus(payRes, 200);
      const paymentId = (await payRes.json()).psp?.payment_id;
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
      await expectStatus(await postPspWebhook(request, { signature: signWebhook(paymentWebhook), body: paymentWebhook }), 200);

      await expectStatus(await markDelivered(request, sellerApiKey, escrowId, { idempotencyKey: randomId() }), 200);

      const confirmRes = await confirmReceived(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
      await expectStatus(confirmRes, 200);
      const payoutId = (await confirmRes.json()).psp?.payout_id;
      expect(typeof payoutId).toBe("string");

      const payoutWebhook = {
        id: `evt_${randomId()}`,
        type: "payout.succeeded",
        created_at: new Date().toISOString(),
        data: { payout_id: payoutId }
      };
      await expectStatus(await postPspWebhook(request, { signature: signWebhook(payoutWebhook), body: payoutWebhook }), 200);

      const { data: feeLedger, error: feeLedgerErr } = await supabase
        .from("ledger_entries")
        .select("type,amount_minor,currency,psp_reference_id")
        .eq("escrow_id", escrowId)
        .in("type", ["GROSS", "PLATFORM_FEE", "NET_TO_SELLER"]);
      if (feeLedgerErr) throw feeLedgerErr;
      const types = new Set((feeLedger || []).map((row: any) => row.type));
      expect(types.has("GROSS")).toBe(true);
      expect(types.has("PLATFORM_FEE")).toBe(true);
      expect(types.has("NET_TO_SELLER")).toBe(true);

      const platformFee = (feeLedger || []).find((row: any) => row.type === "PLATFORM_FEE");
      const netToSeller = (feeLedger || []).find((row: any) => row.type === "NET_TO_SELLER");
      expect(platformFee?.amount_minor).toBe(expectedFee);
      expect(netToSeller?.amount_minor).toBe(expectedNet);
      expect(platformFee?.currency).toBe(createBody.currency);
      expect(netToSeller?.currency).toBe(createBody.currency);
      expect(platformFee?.psp_reference_id).toBe(payoutId);
      expect(netToSeller?.psp_reference_id).toBe(payoutId);
    }
  });

  test("early payout webhook is replayed by confirm-received (TI-256)", async ({ request }) => {
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

    await expectStatus(
      await configurePsp(request, OPS_CONSOLE_OWNER_ID, { provider: "mock", mode: "sandbox", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: 400 }, { idempotencyKey: randomId() }),
      200
    );

    // Build escrow through HOLD
    const listingRes = await createListing(request, sellerApiKey, { title: `Early payout listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingId = (await listingRes.json()).listing_id;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const offerRes = await createOffer(request, buyerApiKey, listingId, { threadId: null, amount: 250, currency: "EUR", expiresAt }, { idempotencyKey: randomId() });
    await expectStatus(offerRes, 201);
    const offerId = (await offerRes.json()).offer_id;

    const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptRes, 200);
    const txId = (await acceptRes.json()).transaction?.tx_id;

    const escrowRes = await createEscrow(request, buyerApiKey, txId, { idempotencyKey: randomId() });
    await expectStatus(escrowRes, 201);
    const escrowId = (await escrowRes.json()).escrow_id;

    const payRes = await payEscrow(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(payRes, 200);
    const paymentId = (await payRes.json()).psp?.payment_id;

    const paymentWebhook = {
      id: `evt_${randomId()}`,
      type: "payment.succeeded",
      created_at: new Date().toISOString(),
      data: { payment_id: paymentId, hold_id: `hold_${randomId()}`, hold_expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() }
    };
    await expectStatus(await postPspWebhook(request, { signature: signWebhook(paymentWebhook), body: paymentWebhook }), 200);

    // mark-delivered → DELIVERED
    await expectStatus(await markDelivered(request, sellerApiKey, escrowId, { idempotencyKey: randomId() }), 200);

    // Send payout.succeeded BEFORE confirm-received (the payout_id is predictable: mock_payout_{escrowId})
    const earlyPayoutWebhook = {
      id: `evt_${randomId()}`,
      type: "payout.succeeded",
      created_at: new Date().toISOString(),
      data: { payout_id: `mock_payout_${escrowId}` }
    };
    const earlyRes = await postPspWebhook(request, { signature: signWebhook(earlyPayoutWebhook), body: earlyPayoutWebhook });
    await expectStatus(earlyRes, 200);
    const earlyBody = await earlyRes.json();
    expect(earlyBody.deferred).toBe(true); // webhook stored as PENDING_RETRY

    // Escrow should still be DELIVERED (payout_id not set yet)
    const { data: escrowBeforeConfirm } = await supabase.from("escrows").select("status").eq("escrow_id", escrowId).maybeSingle();
    expect(escrowBeforeConfirm?.status).toBe("DELIVERED");

    // confirm-received should claim the orphaned webhook and replay it → RELEASED
    const confirmRes = await confirmReceived(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(confirmRes, 200);

    // The escrow should now be RELEASED (confirm-received claimed + replayed the early payout webhook)
    const { data: escrowAfter, error: escrowErr } = await supabase
      .from("escrows")
      .select("escrow_id,status,released_at")
      .eq("escrow_id", escrowId)
      .maybeSingle();
    if (escrowErr) throw escrowErr;
    expect(escrowAfter?.status).toBe("RELEASED");
    expect(escrowAfter?.released_at).toBeTruthy();

    // Verify the orphaned webhook event was claimed and applied
    const { data: webhookEvents } = await supabase
      .from("psp_webhook_events")
      .select("psp_event_id,status,escrow_id")
      .eq("psp_event_id", earlyPayoutWebhook.id)
      .maybeSingle();
    expect(webhookEvents?.status).toBe("APPLIED");
    expect(webhookEvents?.escrow_id).toBe(escrowId);

    // Verify ledger entries: PLATFORM_FEE + NET_TO_SELLER exist (payout was applied)
    const { data: feeLedger } = await supabase
      .from("ledger_entries")
      .select("type")
      .eq("escrow_id", escrowId)
      .in("type", ["PLATFORM_FEE", "NET_TO_SELLER"]);
    const types = new Set((feeLedger || []).map((r: any) => r.type));
    expect(types.has("PLATFORM_FEE")).toBe(true);
    expect(types.has("NET_TO_SELLER")).toBe(true);
  });

  test("early payment webhook is replayed by pay (TI-257)", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    await setupPolicy(request, buyerOwnerId);

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

    await expectStatus(
      await configurePsp(
        request,
        OPS_CONSOLE_OWNER_ID,
        { provider: "mock", mode: "sandbox", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: 400 },
        { idempotencyKey: randomId() }
      ),
      200
    );

    // Build escrow but DO NOT call /pay yet.
    const listingRes = await createListing(request, sellerApiKey, { title: `Early payment listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingId = (await listingRes.json()).listing_id;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const offerRes = await createOffer(request, buyerApiKey, listingId, { threadId: null, amount: 250, currency: "EUR", expiresAt }, { idempotencyKey: randomId() });
    await expectStatus(offerRes, 201);
    const offerId = (await offerRes.json()).offer_id;

    const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptRes, 200);
    const txId = (await acceptRes.json()).transaction?.tx_id;

    const escrowRes = await createEscrow(request, buyerApiKey, txId, { idempotencyKey: randomId() });
    await expectStatus(escrowRes, 201);
    const escrowId = (await escrowRes.json()).escrow_id;

    // Send payment.succeeded BEFORE /pay (the payment_id is predictable: mock_pay_{escrowId})
    const earlyPaymentWebhook = {
      id: `evt_${randomId()}`,
      type: "payment.succeeded",
      created_at: new Date().toISOString(),
      data: { payment_id: `mock_pay_${escrowId}`, hold_id: `hold_${randomId()}`, hold_expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() }
    };
    const earlyRes = await postPspWebhook(request, { signature: signWebhook(earlyPaymentWebhook), body: earlyPaymentWebhook });
    await expectStatus(earlyRes, 200);
    const earlyBody = await earlyRes.json();
    expect(earlyBody.deferred).toBe(true); // webhook stored as PENDING_RETRY

    // Escrow should still be CREATED (payment_id not set yet)
    const { data: escrowBeforePay } = await supabase.from("escrows").select("status,psp_payment_id").eq("escrow_id", escrowId).maybeSingle();
    expect(escrowBeforePay?.status).toBe("CREATED");
    expect(escrowBeforePay?.psp_payment_id).toBeNull();

    // /pay should claim the orphaned webhook and replay it -> HOLD
    const payRes = await payEscrow(request, buyerApiKey, escrowId, { idempotencyKey: randomId() });
    await expectStatus(payRes, 200);

    const { data: escrowAfter, error: escrowErr } = await supabase
      .from("escrows")
      .select("escrow_id,status,psp_payment_id,psp_hold_id,hold_expires_at")
      .eq("escrow_id", escrowId)
      .maybeSingle();
    if (escrowErr) throw escrowErr;
    expect(escrowAfter?.status).toBe("HOLD");
    expect(escrowAfter?.psp_payment_id).toBe(`mock_pay_${escrowId}`);
    expect(escrowAfter?.psp_hold_id).toBeTruthy();

    // Verify the orphaned webhook event was claimed and applied
    const { data: webhookEvent } = await supabase
      .from("psp_webhook_events")
      .select("psp_event_id,status,escrow_id")
      .eq("psp_event_id", earlyPaymentWebhook.id)
      .maybeSingle();
    expect(webhookEvent?.status).toBe("APPLIED");
    expect(webhookEvent?.escrow_id).toBe(escrowId);

    // Verify ledger entry: GROSS exists (hold was applied)
    const { data: grossLedger } = await supabase
      .from("ledger_entries")
      .select("type")
      .eq("escrow_id", escrowId)
      .eq("type", "GROSS");
    expect((grossLedger || []).length).toBe(1);
  });
});
