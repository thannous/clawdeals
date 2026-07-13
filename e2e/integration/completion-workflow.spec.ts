import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, createOffer, acceptOffer, expectStatus, markTransactionCompleted } from "./helpers/http";
import { openSse, waitForSseFrame } from "./helpers/sse";
import { waitForAuditLogMatching } from "./helpers/audit";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDbWithOverrides, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

const routesExist = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/mark-completed.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id].ts")
].every((candidate) => fs.existsSync(candidate));

async function setupPolicy(request: any, ownerId: string) {
  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": ownerId },
    data: {
      budgets: { max_offer: 1000, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1000, contact_reveal: "always" },
      auto_approve: { message_types: [], actions: ["listing.create", "thread.create", "offer.accept"] },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    }
  });
  await expectStatus(policyRes, 200);
}

async function waitForSseEvent(response: Response, eventName: string) {
  const frame = await waitForSseFrame(response, {
    timeoutMs: 7500,
    onFrame: (entry) => (entry.type === "event" && entry.event === eventName ? entry : undefined)
  });
  if (frame.type !== "event") throw new Error("Expected SSE event frame");
  return JSON.parse(frame.data);
}

test.describe.serial("Integration: Completion workflow (TI-204)", () => {
  test.skip(!routesExist, "Completion endpoints not implemented in this branch");

  test.setTimeout(60000);

  test("double opt-in: buyer then seller => COMPLETED + listing COMPLETED + SSE + audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);
    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Completion listing ${randomId()}`, publish: true });
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

    // Force CONTACT_REVEALED state for this tx to isolate TI-204 tests from TI-203 flows.
    const nowIso = new Date().toISOString();
    const { error: txUpdateErr } = await supabase
      .from("transactions")
      .update({
        status: "CONTACT_REVEALED",
        contact_reveal_state: "APPROVED",
        contact_revealed_at: nowIso,
        updated_at: nowIso
      })
      .eq("tx_id", txId);
    if (txUpdateErr) throw txUpdateErr;

    const { error: listingUpdateErr } = await supabase
      .from("listings")
      .update({ status: "CONTACT_REVEALED", updated_at: nowIso })
      .eq("listing_id", listingId);
    if (listingUpdateErr) throw listingUpdateErr;

    const types = encodeURIComponent("transaction.pending_confirm,transaction.completed");
    const buyerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });
    const sellerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${sellerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      expect(buyerSse.res.status).toBe(200);
      expect(sellerSse.res.status).toBe(200);

      await waitForSseFrame(buyerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });
      await waitForSseFrame(sellerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const auditStart = new Date().toISOString();

      const idemKey = randomId();
      const buyerMark = await markTransactionCompleted(request, buyerApiKey, txId, { idempotencyKey: idemKey });
      await expectStatus(buyerMark, 200);
      const buyerBody = await buyerMark.json();
      expect(buyerBody.tx_id).toBe(txId);
      expect(buyerBody.status).toBe("COMPLETED_PENDING_CONFIRM");
      expect(buyerBody.buyer_completed_at).toBeTruthy();
      expect(buyerBody.seller_completed_at).toBeNull();

      const replay = await markTransactionCompleted(request, buyerApiKey, txId, { idempotencyKey: idemKey });
      await expectStatus(replay, 200);
      expect(replay.headers()["idempotency-replayed"]).toBe("true");
      const replayBody = await replay.json();
      expect(replayBody.status).toBe("COMPLETED_PENDING_CONFIRM");
      expect(replayBody.buyer_completed_at).toBe(buyerBody.buyer_completed_at);

      const { data: txRow1, error: txErr1 } = await supabase
        .from("transactions")
        .select("tx_id,status,buyer_completed_at,seller_completed_at,auto_completed")
        .eq("tx_id", txId)
        .maybeSingle();
      if (txErr1) throw txErr1;
      expect(txRow1?.status).toBe("COMPLETED_PENDING_CONFIRM");
      expect(txRow1?.buyer_completed_at).toBeTruthy();
      expect(txRow1?.seller_completed_at).toBeNull();
      expect(txRow1?.auto_completed).toBe(false);

      const buyerPending = await waitForSseEvent(buyerSse.res, "transaction.pending_confirm");
      const sellerPending = await waitForSseEvent(sellerSse.res, "transaction.pending_confirm");
      for (const ev of [buyerPending, sellerPending]) {
        expect(ev.type).toBe("transaction.pending_confirm");
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.listing_id).toBe(listingId);
        expect(ev.payload?.status).toBe("COMPLETED_PENDING_CONFIRM");
      }

      const markAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "transaction.buyer_marked_completed" &&
          row.payload?.tx_id === txId &&
          Date.parse(row.occurred_at) >= Date.parse(auditStart),
        20
      );
      expect(markAudit).toBeTruthy();

      const sellerMark = await markTransactionCompleted(request, sellerApiKey, txId, { idempotencyKey: randomId() });
      await expectStatus(sellerMark, 200);
      const sellerBody = await sellerMark.json();
      expect(sellerBody.tx_id).toBe(txId);
      expect(sellerBody.status).toBe("COMPLETED");
      expect(sellerBody.auto_completed).toBe(false);
      expect(sellerBody.buyer_completed_at).toBeTruthy();
      expect(sellerBody.seller_completed_at).toBeTruthy();

      const { data: txRow2, error: txErr2 } = await supabase
        .from("transactions")
        .select("tx_id,status,buyer_completed_at,seller_completed_at,auto_completed,listing_id")
        .eq("tx_id", txId)
        .maybeSingle();
      if (txErr2) throw txErr2;
      expect(txRow2?.status).toBe("COMPLETED");
      expect(txRow2?.buyer_completed_at).toBeTruthy();
      expect(txRow2?.seller_completed_at).toBeTruthy();
      expect(txRow2?.auto_completed).toBe(false);

      const { data: listingRow, error: listingErr } = await supabase
        .from("listings")
        .select("listing_id,status,completed_at")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (listingErr) throw listingErr;
      expect(listingRow?.status).toBe("COMPLETED");
      expect(listingRow?.completed_at).toBeTruthy();

      const buyerCompleted = await waitForSseEvent(buyerSse.res, "transaction.completed");
      const sellerCompleted = await waitForSseEvent(sellerSse.res, "transaction.completed");
      for (const ev of [buyerCompleted, sellerCompleted]) {
        expect(ev.type).toBe("transaction.completed");
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.listing_id).toBe(listingId);
        expect(ev.payload?.status).toBe("COMPLETED");
        expect(ev.payload?.auto_completed).toBe(false);
      }

      const completedAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "transaction.completed" &&
          row.payload?.tx_id === txId &&
          Date.parse(row.occurred_at) >= Date.parse(auditStart),
        20
      );
      expect(completedAudit).toBeTruthy();
    } finally {
      buyerSse.controller.abort();
      sellerSse.controller.abort();
    }
  });

  test("concurrency: buyer + seller mark completed concurrently => tx COMPLETED with both timestamps", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);
    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Completion concurrency listing ${randomId()}`, publish: true });
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

    // Force CONTACT_REVEALED state for this tx to isolate TI-204 tests from TI-203 flows.
    const nowIso = new Date().toISOString();
    const { error: txUpdateErr } = await supabase
      .from("transactions")
      .update({
        status: "CONTACT_REVEALED",
        contact_reveal_state: "APPROVED",
        contact_revealed_at: nowIso,
        updated_at: nowIso
      })
      .eq("tx_id", txId);
    if (txUpdateErr) throw txUpdateErr;

    const { error: listingUpdateErr } = await supabase
      .from("listings")
      .update({ status: "CONTACT_REVEALED", updated_at: nowIso })
      .eq("listing_id", listingId);
    if (listingUpdateErr) throw listingUpdateErr;

    const [buyerRes, sellerRes] = await Promise.all([
      markTransactionCompleted(request, buyerApiKey, txId, { idempotencyKey: randomId() }),
      markTransactionCompleted(request, sellerApiKey, txId, { idempotencyKey: randomId() })
    ]);

    await expectStatus(buyerRes, 200);
    await expectStatus(sellerRes, 200);

    const buyerBody = await buyerRes.json();
    const sellerBody = await sellerRes.json();
    const statuses = new Set([buyerBody.status, sellerBody.status]);
    expect(statuses.has("COMPLETED")).toBe(true);
    for (const status of statuses) {
      expect(["COMPLETED_PENDING_CONFIRM", "COMPLETED"]).toContain(status);
    }

    const { data: txRow, error: txErr } = await supabase
      .from("transactions")
      .select("tx_id,status,buyer_completed_at,seller_completed_at,auto_completed")
      .eq("tx_id", txId)
      .maybeSingle();
    if (txErr) throw txErr;
    expect(txRow?.status).toBe("COMPLETED");
    expect(txRow?.buyer_completed_at).toBeTruthy();
    expect(txRow?.seller_completed_at).toBeTruthy();
    expect(txRow?.auto_completed).toBe(false);

    const { data: listingRow, error: listingErr } = await supabase
      .from("listings")
      .select("listing_id,status,completed_at")
      .eq("listing_id", listingId)
      .maybeSingle();
    if (listingErr) throw listingErr;
    expect(listingRow?.status).toBe("COMPLETED");
    expect(listingRow?.completed_at).toBeTruthy();
  });

  test("auto-close job: stale pending confirm => COMPLETED auto_completed=true + audit + SSE", async ({ request }) => {
    test.skip(!process.env.INTERNAL_CRON_SECRET, "Missing INTERNAL_CRON_SECRET for cron endpoint");

    const cronSecret = process.env.INTERNAL_CRON_SECRET as string;

    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);
    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Auto-close listing ${randomId()}`, publish: true });
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

    // Seed tx as stale COMPLETED_PENDING_CONFIRM.
    const oldIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { error: txSeedErr } = await supabase
      .from("transactions")
      .update({
        status: "COMPLETED_PENDING_CONFIRM",
        contact_reveal_state: "APPROVED",
        contact_revealed_at: oldIso,
        buyer_completed_at: oldIso,
        seller_completed_at: null,
        auto_completed: false,
        updated_at: oldIso
      })
      .eq("tx_id", txId);
    if (txSeedErr) throw txSeedErr;

    const { error: listingSeedErr } = await supabase
      .from("listings")
      .update({ status: "CONTACT_REVEALED", updated_at: oldIso })
      .eq("listing_id", listingId);
    if (listingSeedErr) throw listingSeedErr;

    const types = encodeURIComponent("transaction.auto_completed");
    const buyerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });
    const sellerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${sellerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      expect(buyerSse.res.status).toBe(200);
      expect(sellerSse.res.status).toBe(200);

      await waitForSseFrame(buyerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });
      await waitForSseFrame(sellerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const auditStart = new Date().toISOString();

      const cronRes = await request.post("/api/internal/cron/transactions-auto-close?days=1&limit=10", {
        headers: { "x-cron-secret": cronSecret }
      });
      await expectStatus(cronRes, 200);
      const cronBody = await cronRes.json();
      expect(typeof cronBody.auto_completed_count).toBe("number");

      const { data: txRow, error: txErr } = await supabase
        .from("transactions")
        .select("tx_id,status,buyer_completed_at,seller_completed_at,auto_completed")
        .eq("tx_id", txId)
        .maybeSingle();
      if (txErr) throw txErr;
      expect(txRow?.status).toBe("COMPLETED");
      expect(txRow?.buyer_completed_at).toBeTruthy();
      expect(txRow?.seller_completed_at).toBeTruthy();
      expect(txRow?.auto_completed).toBe(true);

      const { data: listingRow, error: listingErr } = await supabase
        .from("listings")
        .select("listing_id,status,completed_at")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (listingErr) throw listingErr;
      expect(listingRow?.status).toBe("COMPLETED");
      expect(listingRow?.completed_at).toBeTruthy();

      const buyerAuto = await waitForSseEvent(buyerSse.res, "transaction.auto_completed");
      const sellerAuto = await waitForSseEvent(sellerSse.res, "transaction.auto_completed");
      for (const ev of [buyerAuto, sellerAuto]) {
        expect(ev.type).toBe("transaction.auto_completed");
        expect(ev.entity?.id).toBe(txId);
        expect(ev.payload?.listing_id).toBe(listingId);
        expect(ev.payload?.status).toBe("COMPLETED");
        expect(ev.payload?.auto_completed).toBe(true);
      }

      const autoAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "transaction.auto_completed" &&
          row.payload?.tx_id === txId &&
          Date.parse(row.occurred_at) >= Date.parse(auditStart),
        25
      );
      expect(autoAudit).toBeTruthy();
    } finally {
      buyerSse.controller.abort();
      sellerSse.controller.abort();
    }
  });
});
