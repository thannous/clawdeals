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
  openDispute,
  payEscrow,
  postPspWebhook,
  resolveDispute
} from "./helpers/http";
import {
  createSupabaseAdmin,
  createAgentDbWithOverrides,
  createActiveApiKeyDb,
  ensureEvidenceBucket,
  ensureOwnerDb,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";
import {
  confirmEvidenceUpload,
  createEvidenceTestFixture,
  initEvidenceUpload,
  uploadEvidenceBytes
} from "./helpers/evidence";

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

async function setupEscrowOnHold(request: any) {
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

  const configureRes = await configurePsp(
    request,
    OPS_CONSOLE_OWNER_ID,
    { provider: "mock", mode: "sandbox", webhookSecretRef: "env:IDEMPOTENCY_SECRET", platformFeeBpsDefault: 400 },
    { idempotencyKey: randomId() }
  );
  await expectStatus(configureRes, 200);

  const listingRes = await createListing(request, sellerApiKey, { title: `Dispute listing ${randomId()}`, publish: true });
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

  const createRes = await createEscrow(request, buyerApiKey, txId, { idempotencyKey: randomId() });
  await expectStatus(createRes, 201);
  const createBody = await createRes.json();
  const escrowId = createBody.escrow_id;
  expect(typeof escrowId).toBe("string");

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

  const { data: escrowAfterHold, error: holdErr } = await supabase
    .from("escrows")
    .select("escrow_id,status,psp_payment_id")
    .eq("escrow_id", escrowId)
    .maybeSingle();
  if (holdErr) throw holdErr;
  expect(escrowAfterHold?.status).toBe("HOLD");

  return {
    supabase,
    sellerApiKey,
    buyerApiKey,
    escrowId,
    paymentId,
    createBody
  };
}

test.describe.serial("Integration: Disputes (TI-212) + Ledger (TI-213)", () => {
  test.setTimeout(90000);

  test("open dispute -> resolve REFUND -> refund webhook -> REFUNDED + ledger", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);

    const openPayload = {
      reasonCode: "item_not_received",
      notes: "Need a refund, contact me at test@example.com"
    } as const;

    const idemOpen = randomId();
    const openRes = await openDispute(
      request,
      fixture.buyerApiKey,
      fixture.escrowId,
      openPayload,
      { idempotencyKey: idemOpen }
    );
    await expectStatus(openRes, 201);
    const openBody = await openRes.json();
    expect(openBody.escrow_status).toBe("DISPUTE_OPEN");
    const disputeId = openBody.dispute_id;
    expect(typeof disputeId).toBe("string");

    // Note: idempotency replay is not tested here because disputes.open has a
    // 1/10m owner-scoped rate limit and the pipeline enforces rate limiting before idempotency.

    const { data: evidencePack, error: packErr } = await fixture.supabase
      .from("evidence_packs")
      .select("evidence_pack_id,dispute_id")
      .eq("dispute_id", disputeId)
      .maybeSingle();
    if (packErr) throw packErr;
    expect(evidencePack?.dispute_id).toBe(disputeId);

    const resolvePayload = {
      resolution: "REFUND",
      notes: "Refund approved."
    } as const;

    const idemResolve = randomId();
    const resolveRes = await resolveDispute(
      request,
      OPS_CONSOLE_OWNER_ID,
      disputeId,
      resolvePayload,
      { idempotencyKey: idemResolve }
    );
    await expectStatus(resolveRes, 200);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.escrow_status).toBe("REFUND_PENDING");
    const refundId = resolveBody.psp?.refund_id;
    expect(typeof refundId).toBe("string");

    const replayResolve = await resolveDispute(
      request,
      OPS_CONSOLE_OWNER_ID,
      disputeId,
      resolvePayload,
      { idempotencyKey: idemResolve }
    );
    await expectStatus(replayResolve, 200);
    expect(replayResolve.headers()["idempotency-replayed"]).toBe("true");

    const refundWebhook = {
      id: `evt_${randomId()}`,
      type: "refund.succeeded",
      created_at: new Date().toISOString(),
      data: {
        refund_id: refundId
      }
    };
    const refundSig = signWebhook(refundWebhook);
    const refundRes = await postPspWebhook(request, { signature: refundSig, body: refundWebhook });
    await expectStatus(refundRes, 200);

    const { data: escrowAfterRefund, error: refundErr } = await fixture.supabase
      .from("escrows")
      .select("escrow_id,status,refunded_at,psp_refund_id")
      .eq("escrow_id", fixture.escrowId)
      .maybeSingle();
    if (refundErr) throw refundErr;
    expect(escrowAfterRefund?.status).toBe("REFUNDED");
    expect(escrowAfterRefund?.refunded_at).toBeTruthy();
    expect(escrowAfterRefund?.psp_refund_id).toBe(refundId);

    const { data: refundLedger, error: refundLedgerErr } = await fixture.supabase
      .from("ledger_entries")
      .select("type,amount_minor,currency,psp_reference_id")
      .eq("escrow_id", fixture.escrowId)
      .in("type", ["GROSS", "REFUND"]);
    if (refundLedgerErr) throw refundLedgerErr;
    const refundTypes = new Set((refundLedger || []).map((row: any) => row.type));
    expect(refundTypes.has("GROSS")).toBe(true);
    expect(refundTypes.has("REFUND")).toBe(true);
    const refundEntry = (refundLedger || []).find((row: any) => row.type === "REFUND");
    expect(refundEntry?.amount_minor).toBe(fixture.createBody.amount_gross_minor);
    expect(refundEntry?.currency).toBe(fixture.createBody.currency);
    expect(refundEntry?.psp_reference_id).toBe(refundId);
  });

  test("open dispute -> upload evidence -> resolve REFUND -> refund webhook -> REFUNDED + evidence + ledger (TI-294)", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);
    await ensureEvidenceBucket(fixture.supabase);

    const openRes = await openDispute(
      request,
      fixture.buyerApiKey,
      fixture.escrowId,
      { reasonCode: "item_not_received", notes: "Submitting proof for refund." },
      { idempotencyKey: randomId() }
    );
    await expectStatus(openRes, 201);
    const openBody = await openRes.json();
    expect(openBody.escrow_status).toBe("DISPUTE_OPEN");
    const disputeId = openBody.dispute_id;
    expect(typeof disputeId).toBe("string");

    const upload = await initEvidenceUpload(request, { disputeId, apiKey: fixture.buyerApiKey });
    const evidence = createEvidenceTestFixture();
    await uploadEvidenceBytes(request, { url: upload.url, bytes: evidence.bytes, contentType: evidence.contentType });
    await confirmEvidenceUpload(request, {
      disputeId,
      apiKey: fixture.buyerApiKey,
      bucket: upload.bucket,
      key: upload.key,
      sha256: evidence.sha256,
      contentType: evidence.contentType,
      bytes: evidence.bytes.byteLength
    });

    const listRes = await request.get(`/api/v1/disputes/${encodeURIComponent(disputeId)}/evidence`, {
      headers: { Authorization: `Bearer ${fixture.buyerApiKey}` }
    });
    await expectStatus(listRes, 200);
    const listBody = await listRes.json();
    expect(listBody.dispute_id).toBe(disputeId);
    expect(Array.isArray(listBody.items)).toBe(true);
    const matched = (listBody.items || []).find((item: any) => item.sha256 === evidence.sha256);
    expect(matched).toBeTruthy();
    expect(matched.storage_bucket).toBe(upload.bucket);
    expect(matched.storage_key).toBe(upload.key);

    const resolveRes = await resolveDispute(
      request,
      OPS_CONSOLE_OWNER_ID,
      disputeId,
      { resolution: "REFUND", notes: "Refund approved with evidence." },
      { idempotencyKey: randomId() }
    );
    await expectStatus(resolveRes, 200);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.escrow_status).toBe("REFUND_PENDING");
    const refundId = resolveBody.psp?.refund_id;
    expect(typeof refundId).toBe("string");

    const refundWebhook = {
      id: `evt_${randomId()}`,
      type: "refund.succeeded",
      created_at: new Date().toISOString(),
      data: { refund_id: refundId }
    };
    const refundSig = signWebhook(refundWebhook);
    await expectStatus(await postPspWebhook(request, { signature: refundSig, body: refundWebhook }), 200);

    const { data: escrowAfterRefund, error: refundErr } = await fixture.supabase
      .from("escrows")
      .select("escrow_id,status,refunded_at,psp_refund_id")
      .eq("escrow_id", fixture.escrowId)
      .maybeSingle();
    if (refundErr) throw refundErr;
    expect(escrowAfterRefund?.status).toBe("REFUNDED");
    expect(escrowAfterRefund?.refunded_at).toBeTruthy();
    expect(escrowAfterRefund?.psp_refund_id).toBe(refundId);

    const { data: refundLedger, error: refundLedgerErr } = await fixture.supabase
      .from("ledger_entries")
      .select("type,amount_minor,currency,psp_reference_id")
      .eq("escrow_id", fixture.escrowId)
      .in("type", ["GROSS", "REFUND"]);
    if (refundLedgerErr) throw refundLedgerErr;
    const types = new Set((refundLedger || []).map((row: any) => row.type));
    expect(types.has("GROSS")).toBe(true);
    expect(types.has("REFUND")).toBe(true);
    const refundEntry = (refundLedger || []).find((row: any) => row.type === "REFUND");
    expect(refundEntry?.amount_minor).toBe(fixture.createBody.amount_gross_minor);
    expect(refundEntry?.currency).toBe(fixture.createBody.currency);
    expect(refundEntry?.psp_reference_id).toBe(refundId);
  });

  test("opening a second dispute on same escrow is rejected (TI-294)", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);

    const openRes = await openDispute(
      request,
      fixture.buyerApiKey,
      fixture.escrowId,
      { reasonCode: "item_not_received", notes: "First dispute." },
      { idempotencyKey: randomId() }
    );
    await expectStatus(openRes, 201);
    const openBody = await openRes.json();
    const disputeId = openBody.dispute_id;
    expect(typeof disputeId).toBe("string");

    // Try opening again from the seller owner context to avoid owner-scoped rate limiting.
    const secondRes = await openDispute(
      request,
      fixture.sellerApiKey,
      fixture.escrowId,
      { reasonCode: "other", notes: "Second dispute attempt." },
      { idempotencyKey: randomId() }
    );
    await expectStatus(secondRes, 409);
    const secondBody = await secondRes.json();
    expect(secondBody?.error?.code).toBe("DISPUTE_ALREADY_EXISTS");

    const { data: disputes, error: disputesErr } = await fixture.supabase
      .from("disputes")
      .select("dispute_id")
      .eq("escrow_id", fixture.escrowId);
    if (disputesErr) throw disputesErr;
    expect(disputes || []).toHaveLength(1);
    expect(disputes?.[0]?.dispute_id).toBe(disputeId);
  });

  test("early refund webhook is replayed by resolve REFUND (TI-258)", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);

    const openRes = await openDispute(
      request,
      fixture.buyerApiKey,
      fixture.escrowId,
      { reasonCode: "item_not_received", notes: "Requesting refund." },
      { idempotencyKey: randomId() }
    );
    await expectStatus(openRes, 201);
    const disputeId = (await openRes.json()).dispute_id;
    expect(typeof disputeId).toBe("string");

    // Send refund.succeeded BEFORE resolveDispute (refund_id is predictable: mock_refund_{escrowId})
    const earlyRefundWebhook = {
      id: `evt_${randomId()}`,
      type: "refund.succeeded",
      created_at: new Date().toISOString(),
      data: { refund_id: `mock_refund_${fixture.escrowId}` }
    };
    const earlyRes = await postPspWebhook(request, { signature: signWebhook(earlyRefundWebhook), body: earlyRefundWebhook });
    await expectStatus(earlyRes, 200);
    const earlyBody = await earlyRes.json();
    expect(earlyBody.deferred).toBe(true); // webhook stored as PENDING_RETRY

    // Escrow should still be DISPUTE_OPEN (refund_id not set yet)
    const { data: escrowBeforeResolve, error: escrowBeforeErr } = await fixture.supabase
      .from("escrows")
      .select("status,psp_refund_id")
      .eq("escrow_id", fixture.escrowId)
      .maybeSingle();
    if (escrowBeforeErr) throw escrowBeforeErr;
    expect(escrowBeforeResolve?.status).toBe("DISPUTE_OPEN");
    expect(escrowBeforeResolve?.psp_refund_id).toBeNull();

    // resolveDispute should claim the orphaned webhook and replay it -> REFUNDED
    const resolveRes = await resolveDispute(
      request,
      OPS_CONSOLE_OWNER_ID,
      disputeId,
      { resolution: "REFUND", notes: "Refund approved." },
      { idempotencyKey: randomId() }
    );
    await expectStatus(resolveRes, 200);

    const { data: escrowAfter, error: escrowErr } = await fixture.supabase
      .from("escrows")
      .select("escrow_id,status,refunded_at,psp_refund_id")
      .eq("escrow_id", fixture.escrowId)
      .maybeSingle();
    if (escrowErr) throw escrowErr;
    expect(escrowAfter?.status).toBe("REFUNDED");
    expect(escrowAfter?.refunded_at).toBeTruthy();
    expect(escrowAfter?.psp_refund_id).toBe(`mock_refund_${fixture.escrowId}`);

    // Verify the orphaned webhook event was claimed and applied
    const { data: webhookEvent } = await fixture.supabase
      .from("psp_webhook_events")
      .select("psp_event_id,status,escrow_id")
      .eq("psp_event_id", earlyRefundWebhook.id)
      .maybeSingle();
    expect(webhookEvent?.status).toBe("APPLIED");
    expect(webhookEvent?.escrow_id).toBe(fixture.escrowId);

    // Verify REFUND ledger entry exists (refund was applied)
    const { data: refundLedger, error: refundLedgerErr } = await fixture.supabase
      .from("ledger_entries")
      .select("type,psp_reference_id")
      .eq("escrow_id", fixture.escrowId)
      .eq("type", "REFUND");
    if (refundLedgerErr) throw refundLedgerErr;
    expect((refundLedger || []).length).toBe(1);
    expect(refundLedger?.[0]?.psp_reference_id).toBe(`mock_refund_${fixture.escrowId}`);
  });

  test("open dispute -> resolve RELEASE -> payout webhook -> RELEASED + ledger", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);

    const openRes = await openDispute(
      request,
      fixture.buyerApiKey,
      fixture.escrowId,
      { reasonCode: "not_as_described", notes: "Please review." },
      { idempotencyKey: randomId() }
    );
    await expectStatus(openRes, 201);
    const openBody = await openRes.json();
    expect(openBody.escrow_status).toBe("DISPUTE_OPEN");
    const disputeId = openBody.dispute_id;
    expect(typeof disputeId).toBe("string");

    const resolveRes = await resolveDispute(
      request,
      OPS_CONSOLE_OWNER_ID,
      disputeId,
      { resolution: "RELEASE", notes: "Release approved." },
      { idempotencyKey: randomId() }
    );
    await expectStatus(resolveRes, 200);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.escrow_status).toBe("RELEASE_PENDING");
    const payoutId = resolveBody.psp?.payout_id;
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

    const { data: escrowAfterRelease, error: releaseErr } = await fixture.supabase
      .from("escrows")
      .select("escrow_id,status,released_at")
      .eq("escrow_id", fixture.escrowId)
      .maybeSingle();
    if (releaseErr) throw releaseErr;
    expect(escrowAfterRelease?.status).toBe("RELEASED");
    expect(escrowAfterRelease?.released_at).toBeTruthy();

    const { data: feeLedger, error: feeLedgerErr } = await fixture.supabase
      .from("ledger_entries")
      .select("type,amount_minor,psp_reference_id")
      .eq("escrow_id", fixture.escrowId)
      .in("type", ["GROSS", "PLATFORM_FEE", "NET_TO_SELLER"]);
    if (feeLedgerErr) throw feeLedgerErr;
    const feeTypes = new Set((feeLedger || []).map((row: any) => row.type));
    expect(feeTypes.has("GROSS")).toBe(true);
    expect(feeTypes.has("PLATFORM_FEE")).toBe(true);
    expect(feeTypes.has("NET_TO_SELLER")).toBe(true);

    const platformFee = (feeLedger || []).find((row: any) => row.type === "PLATFORM_FEE");
    const netToSeller = (feeLedger || []).find((row: any) => row.type === "NET_TO_SELLER");
    expect(platformFee?.amount_minor).toBe(fixture.createBody.amount_platform_fee_minor);
    expect(netToSeller?.amount_minor).toBe(fixture.createBody.amount_net_minor);
    expect(platformFee?.psp_reference_id).toBe(payoutId);
    expect(netToSeller?.psp_reference_id).toBe(payoutId);
  });
});
