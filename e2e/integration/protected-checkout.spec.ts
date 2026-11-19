import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { confirmReceived, expectStatus, markDelivered, openDispute, postPspWebhook, resolveDispute } from "./helpers/http";
import { ensureEvidenceBucket, OPS_CONSOLE_OWNER_ID } from "./helpers/supabase";
import { setupEscrowOnHold, signPspWebhook } from "./helpers/escrow";
import { confirmEvidenceUpload, createEvidenceTestFixture, initEvidenceUpload, uploadEvidenceBytes } from "./helpers/evidence";
import { getProtectedCheckout, postTrackingEvent, randomTrackingNumber, registerShipment } from "./helpers/tracking";

assertIntegrationEnv();

const CARRIER = "colissimo";

async function runInspectionRelease(request: any) {
  const res = await request.post("/api/internal/cron/escrow-inspection-release", {
    headers: { Authorization: `Bearer ${process.env.INTERNAL_CRON_SECRET}` }
  });
  await expectStatus(res, 200);
  return res.json();
}

async function endInspectionWindow(supabase: any, escrowId: string) {
  const { error } = await supabase
    .from("escrows")
    .update({ inspection_ends_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("escrow_id", escrowId);
  if (error) throw error;
}

async function escrowStatus(supabase: any, escrowId: string) {
  const { data, error } = await supabase
    .from("escrows")
    .select("status,inspection_ends_at,inspection_expired_at,psp_payout_id")
    .eq("escrow_id", escrowId)
    .single();
  if (error) throw error;
  return data;
}

async function deliverByCarrier(request: any, fixture: any) {
  const trackingNumber = randomTrackingNumber();
  await expectStatus(await registerShipment(request, fixture.sellerApiKey, fixture.escrowId, { carrier: CARRIER, trackingNumber }), 200);
  await expectStatus(await postTrackingEvent(request, { carrier: CARRIER, trackingNumber, status: "DELIVERED" }), 200);
  return trackingNumber;
}

test.describe.serial("Integration: protected checkout", () => {
  test.setTimeout(120000);

  test("terms are frozen at purchase and survive a later listing edit", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request, { listingTitlePrefix: "Wool jacket" });

    const before = await (await getProtectedCheckout(request, fixture.buyerApiKey, fixture.escrowId)).json();
    expect(before.terms.listing.listing_id).toBe(fixture.listingId);
    expect(before.terms.listing.title).toContain("Wool jacket");
    expect(before.terms.offer.offer_id).toBe(fixture.offerId);
    expect(before.terms.payment.amount_gross_minor).toBe(before.escrow.amount_gross_minor);
    expect(before.terms.sha256).toMatch(/^[0-9a-f]{64}$/);

    const { error: editError } = await fixture.supabase
      .from("listings")
      .update({ title: "Edited after purchase", description: "Different item" })
      .eq("listing_id", fixture.listingId);
    expect(editError).toBeNull();

    const after = await (await getProtectedCheckout(request, fixture.sellerApiKey, fixture.escrowId)).json();
    expect(after.terms.listing.title).toBe(before.terms.listing.title);
    expect(after.terms.sha256).toBe(before.terms.sha256);

    const { error: tamperError } = await fixture.supabase
      .from("escrow_terms_snapshots")
      .update({ terms: { listing: { title: "Tampered" } } })
      .eq("escrow_id", fixture.escrowId);
    // Even the backend role cannot rewrite a snapshot.
    expect(tamperError?.message || "").toMatch(/permission denied|ESCROW_TERMS_SNAPSHOT_IMMUTABLE/);
    const untouched = await (await getProtectedCheckout(request, fixture.buyerApiKey, fixture.escrowId)).json();
    expect(untouched.terms.sha256).toBe(before.terms.sha256);
  });

  test("only the seller registers tracking; a third party sees nothing", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);
    const other = await setupEscrowOnHold(request);
    const trackingNumber = randomTrackingNumber();

    const buyerAttempt = await registerShipment(request, fixture.buyerApiKey, fixture.escrowId, { carrier: CARRIER, trackingNumber });
    await expectStatus(buyerAttempt, 404);

    const strangerView = await getProtectedCheckout(request, other.buyerApiKey, fixture.escrowId);
    await expectStatus(strangerView, 404);

    const registered = await registerShipment(request, fixture.sellerApiKey, fixture.escrowId, { carrier: CARRIER, trackingNumber });
    await expectStatus(registered, 200);
    expect((await registered.json()).shipment.status).toBe("REGISTERED");

    const reused = await registerShipment(request, other.sellerApiKey, other.escrowId, { carrier: CARRIER, trackingNumber });
    await expectStatus(reused, 409);
    expect((await reused.json()).error.code).toBe("TRACKING_NUMBER_IN_USE");

    // With a tracked parcel the seller's word no longer starts the buyer's clock.
    const selfDeclared = await markDelivered(request, fixture.sellerApiKey, fixture.escrowId);
    await expectStatus(selfDeclared, 409);
    expect((await selfDeclared.json()).error.code).toBe("SHIPMENT_TRACKED");
  });

  test("carrier events need a valid signature; delivery starts the inspection window once", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);
    const trackingNumber = randomTrackingNumber();
    await expectStatus(await registerShipment(request, fixture.sellerApiKey, fixture.escrowId, { carrier: CARRIER, trackingNumber }), 200);

    const forged = await postTrackingEvent(request, { carrier: CARRIER, trackingNumber, status: "DELIVERED" }, { signature: "0".repeat(64) });
    await expectStatus(forged, 401);
    expect((await escrowStatus(fixture.supabase, fixture.escrowId)).status).toBe("HOLD");

    await expectStatus(await postTrackingEvent(request, { carrier: CARRIER, trackingNumber, status: "IN_TRANSIT", location: "Lyon" }), 200);
    expect((await escrowStatus(fixture.supabase, fixture.escrowId)).status).toBe("HOLD");

    const deliveredId = `trk_${randomId()}`;
    await expectStatus(await postTrackingEvent(request, { carrier: CARRIER, trackingNumber, status: "DELIVERED", id: deliveredId }), 200);
    const delivered = await escrowStatus(fixture.supabase, fixture.escrowId);
    expect(delivered.status).toBe("DELIVERED");
    const windowMs = Date.parse(delivered.inspection_ends_at) - Date.now();
    expect(windowMs).toBeGreaterThan(47 * 3600_000);
    expect(windowMs).toBeLessThanOrEqual(48 * 3600_000);

    const replay = await postTrackingEvent(request, { carrier: CARRIER, trackingNumber, status: "DELIVERED", id: deliveredId });
    await expectStatus(replay, 200);
    expect((await replay.json()).duplicate).toBe(true);
    expect((await escrowStatus(fixture.supabase, fixture.escrowId)).inspection_ends_at).toBe(delivered.inspection_ends_at);

    const view = await (await getProtectedCheckout(request, fixture.buyerApiKey, fixture.escrowId)).json();
    expect(view.inspection.open).toBe(true);
    expect(view.shipment.status).toBe("DELIVERED");
    expect(view.shipment.events.map((event: any) => event.status).sort()).toEqual(["DELIVERED", "IN_TRANSIT"]);
    expect(view.actions).toMatchObject({ open_dispute: true, confirm_received: true, register_shipment: false });
  });

  test("an undisputed escrow is released when the window ends, and not before", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);
    await deliverByCarrier(request, fixture);

    await runInspectionRelease(request);
    expect((await escrowStatus(fixture.supabase, fixture.escrowId)).status).toBe("DELIVERED");

    await endInspectionWindow(fixture.supabase, fixture.escrowId);
    await runInspectionRelease(request);
    const released = await escrowStatus(fixture.supabase, fixture.escrowId);
    expect(released.status).toBe("RELEASE_PENDING");
    expect(released.inspection_expired_at).toBeTruthy();
    expect(released.psp_payout_id).toBeTruthy();

    const late = await openDispute(request, fixture.buyerApiKey, fixture.escrowId, { reasonCode: "not_as_described" });
    await expectStatus(late, 409);
  });

  test("a dispute after the window is rejected even before the release job runs", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);
    await deliverByCarrier(request, fixture);
    await endInspectionWindow(fixture.supabase, fixture.escrowId);

    const late = await openDispute(request, fixture.buyerApiKey, fixture.escrowId, { reasonCode: "not_as_described" });
    await expectStatus(late, 409);
    expect((await late.json()).error.code).toBe("INSPECTION_WINDOW_CLOSED");
    expect((await escrowStatus(fixture.supabase, fixture.escrowId)).status).toBe("DELIVERED");
  });

  test("a dispute in the window pauses payout; delivery proof does not decide it; the reviewer does", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request, { listingTitlePrefix: "Wool jacket" });
    await ensureEvidenceBucket(fixture.supabase);
    await deliverByCarrier(request, fixture);

    const opened = await openDispute(request, fixture.buyerApiKey, fixture.escrowId, {
      reasonCode: "not_as_described",
      notes: "The box held a brick, not the jacket."
    });
    await expectStatus(opened, 201);
    const disputeId = (await opened.json()).dispute_id;

    // Payout is paused: neither the buyer's confirmation path nor the window ending releases funds.
    await expectStatus(await confirmReceived(request, fixture.buyerApiKey, fixture.escrowId), 409);
    await endInspectionWindow(fixture.supabase, fixture.escrowId);
    await runInspectionRelease(request);
    const paused = await escrowStatus(fixture.supabase, fixture.escrowId);
    expect(paused.status).toBe("DISPUTE_OPEN");
    expect(paused.psp_payout_id).toBeNull();

    for (const [apiKey, statement] of [
      [fixture.buyerApiKey, "Photo shows the opened parcel with a brick inside."],
      [fixture.sellerApiKey, "I packed the jacket; photo of the sealed parcel attached."]
    ] as const) {
      const statementRes = await request.post(`/api/v1/disputes/${disputeId}/statement`, {
        headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
        data: { statement }
      });
      await expectStatus(statementRes, 200);

      const upload = await initEvidenceUpload(request, { disputeId, apiKey });
      const evidence = createEvidenceTestFixture();
      await uploadEvidenceBytes(request, { url: upload.url, bytes: evidence.bytes, contentType: evidence.contentType });
      await confirmEvidenceUpload(request, {
        disputeId,
        apiKey,
        bucket: upload.bucket,
        key: upload.key,
        sha256: evidence.sha256,
        contentType: evidence.contentType,
        bytes: evidence.bytes.byteLength
      });
    }

    // The review bundle is for the reviewer only.
    const partyReview = await request.get(`/api/v1/disputes/${disputeId}/review`, {
      headers: { Authorization: `Bearer ${fixture.buyerApiKey}` }
    });
    await expectStatus(partyReview, 404);

    const reviewRes = await request.get(`/api/v1/disputes/${disputeId}/review`, {
      headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID }
    });
    await expectStatus(reviewRes, 200);
    const review = await reviewRes.json();
    expect(review.terms.listing.title).toContain("Wool jacket");
    expect(review.shipment.status).toBe("DELIVERED");
    expect(review.dispute.reason_code).toBe("not_as_described");
    expect(review.dispute.statements.map((row: any) => row.submitted_by).sort()).toEqual(["BUYER", "SELLER"]);
    expect(review.evidence.buyer).toHaveLength(1);
    expect(review.evidence.seller).toHaveLength(1);
    expect(review.decision).toMatchObject({ required: true, decided_by: "HUMAN_REVIEWER" });
    expect(review.escrow.status).toBe("DISPUTE_OPEN");

    const fileRes = await request.get(
      `/api/v1/disputes/${disputeId}/evidence/${review.evidence.buyer[0].evidence_item_id}`,
      { headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID } }
    );
    await expectStatus(fileRes, 200);
    expect((await fileRes.body()).byteLength).toBe(review.evidence.buyer[0].bytes);

    const resolved = await resolveDispute(request, OPS_CONSOLE_OWNER_ID, disputeId, {
      resolution: "REFUND",
      notes: "Parcel arrived but did not contain the jacket."
    });
    await expectStatus(resolved, 200);
    const resolvedBody = await resolved.json();
    expect(resolvedBody.escrow_status).toBe("REFUND_PENDING");

    const refundWebhook = {
      id: `evt_${randomId()}`,
      type: "refund.succeeded",
      created_at: new Date().toISOString(),
      data: { refund_id: resolvedBody.psp.refund_id }
    };
    await expectStatus(await postPspWebhook(request, { signature: signPspWebhook(refundWebhook), body: refundWebhook }), 200);
    expect((await escrowStatus(fixture.supabase, fixture.escrowId)).status).toBe("REFUNDED");
  });

  test("hand-over without tracking starts the window; the buyer can release early", async ({ request }) => {
    const fixture = await setupEscrowOnHold(request);

    const delivered = await markDelivered(request, fixture.sellerApiKey, fixture.escrowId);
    await expectStatus(delivered, 200);
    expect((await delivered.json()).inspection_ends_at).toBeTruthy();

    const confirmed = await confirmReceived(request, fixture.buyerApiKey, fixture.escrowId);
    await expectStatus(confirmed, 200);
    expect((await confirmed.json()).status).toBe("RELEASE_PENDING");
  });
});
