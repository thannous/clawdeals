import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import {
  expectStatus,
  openDispute,
  postPspWebhook,
  resolveDispute
} from "./helpers/http";
import {
  ensureEvidenceBucket,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";
import { setupEscrowOnHold, signPspWebhook } from "./helpers/escrow";
import {
  confirmEvidenceUpload,
  createEvidenceTestFixture,
  initEvidenceUpload,
  uploadEvidenceBytes
} from "./helpers/evidence";

assertIntegrationEnv();

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
    const refundSig = signPspWebhook(refundWebhook);
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
    const refundSig = signPspWebhook(refundWebhook);
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
    const earlyRes = await postPspWebhook(request, { signature: signPspWebhook(earlyRefundWebhook), body: earlyRefundWebhook });
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
    const payoutSig = signPspWebhook(payoutWebhook);
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
