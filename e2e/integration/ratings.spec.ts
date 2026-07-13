import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createListing, createOffer, acceptOffer, expectStatus, createTransactionRating } from "./helpers/http";
import { openSse, waitForSseFrame } from "./helpers/sse";
import { waitForAuditLogMatching } from "./helpers/audit";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDbWithOverrides, createActiveApiKeyDb } from "./helpers/supabase";

import { runTrustScoreRecalcQueue } from "../../src/server/trustscore/recalc-queue";
import { computeRatingPoints } from "../../src/server/trustscore/ratings";
import { computeTrustScore } from "../../src/server/trustscore/compute";

assertIntegrationEnv();

const routesExist = [
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/ratings.ts"),
  path.join(process.cwd(), "src/pages/api/v1/transactions/[tx_id]/ratings.js")
].some((candidate) => fs.existsSync(candidate));

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

async function createCompletedTransaction({
  request,
  supabase,
  sellerApiKey,
  buyerApiKey,
  listingTitle,
  autoCompleted
}: any) {
  const listingRes = await createListing(request, sellerApiKey, { title: listingTitle, publish: true });
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

  const nowIso = new Date().toISOString();
  const { error: txUpdateErr } = await supabase
    .from("transactions")
    .update({
      status: "COMPLETED",
      contact_reveal_state: "APPROVED",
      contact_revealed_at: nowIso,
      buyer_completed_at: nowIso,
      seller_completed_at: nowIso,
      auto_completed: Boolean(autoCompleted),
      updated_at: nowIso
    })
    .eq("tx_id", txId);
  if (txUpdateErr) throw txUpdateErr;

  const { error: listingUpdateErr } = await supabase
    .from("listings")
    .update({ status: "COMPLETED", completed_at: nowIso, updated_at: nowIso })
    .eq("listing_id", listingId);
  if (listingUpdateErr) throw listingUpdateErr;

  return { listingId, txId };
}

test.describe.serial("Integration: Ratings after completion (TI-205)", () => {
  test.skip(!routesExist, "Ratings endpoint not implemented in this branch");

  test.setTimeout(60000);

  test("happy path: 201 + redaction + idempotency replay + SSE + audit + queue", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt, trustScore: 90, trustFlags: [] });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const { txId } = await createCompletedTransaction({
      request,
      supabase,
      sellerApiKey,
      buyerApiKey,
      listingTitle: `Ratings listing ${randomId()}`,
      autoCompleted: false
    });

    const types = encodeURIComponent("rating.created");
    const buyerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${types}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      expect(buyerSse.res.status).toBe(200);
      await waitForSseFrame(buyerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const auditStart = new Date().toISOString();

      const idemKey = randomId();
      const comment = "Check my site [https://example.com](<https://example.com>)";
      const ratingRes = await createTransactionRating(
        request,
        buyerApiKey,
        txId,
        { score: 5, reasonCode: "AS_DESCRIBED", comment },
        { idempotencyKey: idemKey }
      );
      await expectStatus(ratingRes, 201);
      const body = await ratingRes.json();
      expect(body.tx_id).toBe(txId);
      expect(body.rater_agent_id).toBe(buyerAgent.id);
      expect(body.rated_agent_id).toBe(sellerAgent.id);
      expect(body.comment_redacted).toContain("[redacted]");

      const replayRes = await createTransactionRating(
        request,
        buyerApiKey,
        txId,
        { score: 5, reasonCode: "AS_DESCRIBED", comment },
        { idempotencyKey: idemKey }
      );
      await expectStatus(replayRes, 201);
      expect(replayRes.headers()["idempotency-replayed"]).toBe("true");

      const { data: ratingRow, error: ratingErr } = await supabase
        .from("ratings")
        .select("rating_id, tx_id, rater_agent_id, rated_agent_id, score, reason_code, comment_redacted")
        .eq("tx_id", txId)
        .eq("rater_agent_id", buyerAgent.id)
        .maybeSingle();
      if (ratingErr) throw ratingErr;
      expect(ratingRow?.rating_id).toBeTruthy();
      expect(ratingRow?.comment_redacted).toContain("[redacted]");

      const ev = await waitForSseEvent(buyerSse.res, "rating.created");
      expect(ev.type).toBe("rating.created");
      expect(ev.payload?.tx_id).toBe(txId);
      expect(ev.payload?.rated_agent_id).toBe(sellerAgent.id);
      expect(ev.payload?.score).toBe(5);

      const audit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "rating.created" &&
          row.payload?.tx_id === txId &&
          Date.parse(row.occurred_at) >= Date.parse(auditStart),
        20
      );
      expect(audit).toBeTruthy();
      const payloadStr = JSON.stringify(audit.payload || {});
      expect(payloadStr).not.toContain("example.com");
      expect(payloadStr).toContain("comment_redacted");

      const { data: queueRow, error: queueErr } = await supabase
        .from("trustscore_recalc_queue")
        .select("agent_id, last_reason")
        .eq("agent_id", sellerAgent.id)
        .maybeSingle();
      if (queueErr) throw queueErr;
      expect(queueRow?.agent_id).toBe(sellerAgent.id);
      expect(queueRow?.last_reason).toBe("rating.created");
    } finally {
      buyerSse.controller.abort();
    }
  });

  test("duplicate rating => 409 ALREADY_RATED", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);
    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const { txId } = await createCompletedTransaction({
      request,
      supabase,
      sellerApiKey,
      buyerApiKey,
      listingTitle: `Duplicate rating listing ${randomId()}`,
      autoCompleted: false
    });

    const r1 = await createTransactionRating(request, buyerApiKey, txId, { score: 5 }, { idempotencyKey: randomId() });
    await expectStatus(r1, 201);

    const r2 = await createTransactionRating(request, buyerApiKey, txId, { score: 5 }, { idempotencyKey: randomId() });
    await expectStatus(r2, 409);
    const body = await r2.json();
    expect(body.error.code).toBe("ALREADY_RATED");
  });

  test("tx not COMPLETED => 409 TX_NOT_COMPLETED", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);
    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Not completed listing ${randomId()}`, publish: true });
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

    // Force non-COMPLETED state.
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

    const ratingRes = await createTransactionRating(request, buyerApiKey, txId, { score: 5 }, { idempotencyKey: randomId() });
    await expectStatus(ratingRes, 409);
    const body = await ratingRes.json();
    expect(body.error.code).toBe("TX_NOT_COMPLETED");
  });

  test("non-party caller => 404 TX_NOT_FOUND", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);
    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const otherOwnerId = randomId();
    await ensureOwnerDb(supabase, otherOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const otherAgent = await createAgentDbWithOverrides(supabase, otherOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: otherApiKey } = await createActiveApiKeyDb(supabase, otherAgent.id);

    const { txId } = await createCompletedTransaction({
      request,
      supabase,
      sellerApiKey,
      buyerApiKey,
      listingTitle: `Non-party listing ${randomId()}`,
      autoCompleted: false
    });

    const ratingRes = await createTransactionRating(request, otherApiKey, txId, { score: 5 }, { idempotencyKey: randomId() });
    await expectStatus(ratingRes, 404);
    const body = await ratingRes.json();
    expect(body.error.code).toBe("TX_NOT_FOUND");
  });

  test("cannot rate self => 400 CANNOT_RATE_SELF", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const { listingId, txId } = await createCompletedTransaction({
      request,
      supabase,
      sellerApiKey,
      buyerApiKey,
      listingTitle: `Self rate listing ${randomId()}`,
      autoCompleted: false
    });

    // Force buyer == seller edge case (shouldn't exist in normal flows).
    const nowIso = new Date().toISOString();
    const { error: txUpdateErr } = await supabase
      .from("transactions")
      .update({
        buyer_agent_id: buyerAgent.id,
        seller_agent_id: buyerAgent.id,
        updated_at: nowIso
      })
      .eq("tx_id", txId);
    if (txUpdateErr) throw txUpdateErr;

    // Ensure listing keeps consistency for cascade joins (not strictly required).
    const { error: listingErr } = await supabase.from("listings").update({ updated_at: nowIso }).eq("listing_id", listingId);
    if (listingErr) throw listingErr;

    const ratingRes = await createTransactionRating(request, buyerApiKey, txId, { score: 5 }, { idempotencyKey: randomId() });
    await expectStatus(ratingRes, 400);
    const body = await ratingRes.json();
    expect(body.error.code).toBe("CANNOT_RATE_SELF");
  });

  test("trustscore: auto_completed ratings have reduced weight", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    await setupPolicy(request, sellerOwnerId);

    const buyer1OwnerId = randomId();
    await ensureOwnerDb(supabase, buyer1OwnerId);
    const buyer2OwnerId = randomId();
    await ensureOwnerDb(supabase, buyer2OwnerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyer1Agent = await createAgentDbWithOverrides(supabase, buyer1OwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyer1ApiKey } = await createActiveApiKeyDb(supabase, buyer1Agent.id);

    const buyer2Agent = await createAgentDbWithOverrides(supabase, buyer2OwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyer2ApiKey } = await createActiveApiKeyDb(supabase, buyer2Agent.id);

    const tx1 = await createCompletedTransaction({
      request,
      supabase,
      sellerApiKey,
      buyerApiKey: buyer1ApiKey,
      listingTitle: `Trustscore rating manual ${randomId()}`,
      autoCompleted: false
    });

    const tx2 = await createCompletedTransaction({
      request,
      supabase,
      sellerApiKey,
      buyerApiKey: buyer2ApiKey,
      listingTitle: `Trustscore rating auto ${randomId()}`,
      autoCompleted: true
    });

    const r1 = await createTransactionRating(request, buyer1ApiKey, tx1.txId, { score: 5 }, { idempotencyKey: randomId() });
    await expectStatus(r1, 201);

    const r2 = await createTransactionRating(request, buyer2ApiKey, tx2.txId, { score: 5 }, { idempotencyKey: randomId() });
    await expectStatus(r2, 201);

    await runTrustScoreRecalcQueue({ limit: 50 });

    const { data: agentRow, error: agentErr } = await supabase
      .from("agents")
      .select("id, created_at, trust_score, owner_id, owners(email_verified_at, phone_verified_at)")
      .eq("id", sellerAgent.id)
      .maybeSingle();
    if (agentErr) throw agentErr;
    expect(agentRow?.id).toBe(sellerAgent.id);

    const daysSinceCreated = 10;
    const ownerRel = Array.isArray(agentRow?.owners) ? agentRow.owners[0] || null : agentRow?.owners || null;
    const emailVerified = Boolean(ownerRel?.email_verified_at);
    const phoneVerified = Boolean(ownerRel?.phone_verified_at);
    const baseScore = computeTrustScore({ daysSinceCreated, emailVerified, phoneVerified, useFull: false });

    const expectedRatingCount = 1 + 0.5;
    const expectedAvg = 5;
    const ratingPoints = computeRatingPoints({ avgRating: expectedAvg, ratingCount: expectedRatingCount });
    const expectedScore = Math.min(100, baseScore + ratingPoints);

    expect(agentRow?.trust_score).toBe(expectedScore);
  });
});
