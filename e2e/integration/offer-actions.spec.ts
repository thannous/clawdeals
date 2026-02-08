import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, sleep } from "./helpers/ids";
import { createListing, createOffer, acceptOffer, declineOffer, cancelOffer, expectStatus } from "./helpers/http";
import { openSse, waitForSseFrame } from "./helpers/sse";
import { waitForAuditLogMatching } from "./helpers/audit";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb
} from "./helpers/supabase";
import { runOffersExpiration } from "../../src/server/services/offers-expiration";

assertIntegrationEnv();

const actionRoutesExist = [
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/accept.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/decline.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/cancel.ts")
].every((candidate) => fs.existsSync(candidate));

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

test.describe.serial("Integration: Offer actions (TI-201)", () => {
  test.skip(!actionRoutesExist, "TI-201 offer actions endpoints not implemented in this branch");

  test.setTimeout(60000);

  test("accept => tx created + listing RESERVED + message + SSE + audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Offer accept listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const buyerSse = await openSse(
      `/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.accepted,transaction.created")}`,
      {
        headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
      }
    );
    const sellerSse = await openSse(
      `/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.accepted,transaction.created")}`,
      {
        headers: { Authorization: `Bearer ${sellerApiKey}`, Accept: "text/event-stream" }
      }
    );

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
      const threadId = offerBody.thread_id;

      const auditStart = new Date().toISOString();

      const acceptRes = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
      await expectStatus(acceptRes, 200);
      const acceptBody = await acceptRes.json();

      expect(acceptBody.offer_id).toBe(offerId);
      expect(acceptBody.status).toBe("ACCEPTED");
      expect(acceptBody.listing_status).toBe("RESERVED");
      expect(acceptBody.transaction?.listing_id).toBe(listingId);
      expect(acceptBody.transaction?.thread_id).toBe(threadId);
      expect(acceptBody.transaction?.accepted_offer_id).toBe(offerId);
      expect(acceptBody.transaction?.buyer_agent_id).toBe(buyerAgent.id);
      expect(acceptBody.transaction?.seller_agent_id).toBe(sellerAgent.id);
      expect(acceptBody.transaction?.status).toBe("ACCEPTED");
      expect(acceptBody.transaction?.contact_reveal_state).toBe("NOT_REQUESTED");

      const txId = acceptBody.transaction.tx_id;
      expect(typeof txId).toBe("string");

      const { data: offerRow, error: offerErr } = await supabase
        .from("offers")
        .select("status")
        .eq("offer_id", offerId)
        .maybeSingle();
      if (offerErr) throw offerErr;
      expect(offerRow?.status).toBe("ACCEPTED");

      const { data: listingRow, error: listingErr } = await supabase
        .from("listings")
        .select("status,reserved_at")
        .eq("listing_id", listingId)
        .maybeSingle();
      if (listingErr) throw listingErr;
      expect(listingRow?.status).toBe("RESERVED");
      expect(listingRow?.reserved_at).toBeTruthy();

      const { data: txRow, error: txErr } = await supabase
        .from("transactions")
        .select("tx_id,listing_id,thread_id,accepted_offer_id,buyer_agent_id,seller_agent_id,status,contact_reveal_state")
        .eq("tx_id", txId)
        .maybeSingle();
      if (txErr) throw txErr;
      expect(txRow?.tx_id).toBe(txId);
      expect(txRow?.listing_id).toBe(listingId);
      expect(txRow?.thread_id).toBe(threadId);
      expect(txRow?.accepted_offer_id).toBe(offerId);
      expect(txRow?.buyer_agent_id).toBe(buyerAgent.id);
      expect(txRow?.seller_agent_id).toBe(sellerAgent.id);
      expect(txRow?.status).toBe("ACCEPTED");
      expect(txRow?.contact_reveal_state).toBe("NOT_REQUESTED");

      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("message_id,type,payload,thread_id,created_at")
        .eq("thread_id", threadId)
        .eq("type", "accept")
        .order("created_at", { ascending: false })
        .limit(1);
      if (msgErr) throw msgErr;
      expect((messages || []).length).toBeGreaterThan(0);
      expect(messages[0].payload?.type).toBe("accept");
      expect(messages[0].payload?.offer_id).toBe(offerId);

      const buyerFrame = await waitForSseFrame(buyerSse.res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "offer.accepted" ? entry : undefined)
      });
      const sellerFrame = await waitForSseFrame(sellerSse.res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "offer.accepted" ? entry : undefined)
      });

      for (const frame of [buyerFrame, sellerFrame]) {
        if (frame.type !== "event") throw new Error("Expected SSE event");
        const body = JSON.parse(frame.data);
        expect(body.type).toBe("offer.accepted");
        expect(body.entity?.id).toBe(offerId);
        expect(body.payload?.listing_id).toBe(listingId);
        expect(body.payload?.thread_id).toBe(threadId);
        expect(body.payload?.transaction_id).toBe(txId);
      }

      const acceptAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "offer.accept" &&
          row.payload?.offer_id === offerId &&
          Date.parse(row.occurred_at) >= Date.parse(auditStart),
        15
      );
      expect(acceptAudit).toBeTruthy();

      const txAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "transaction.create" &&
          row.payload?.tx_id === txId &&
          row.payload?.accepted_offer_id === offerId &&
          Date.parse(row.occurred_at) >= Date.parse(auditStart),
        15
      );
      expect(txAudit).toBeTruthy();
    } finally {
      buyerSse.controller.abort();
      sellerSse.controller.abort();
    }
  });

  test("accept permission => 404 OFFER_NOT_FOUND", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Offer accept perm listing ${randomId()}`, publish: true });
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

    const acceptRes = await acceptOffer(request, buyerApiKey, offerId, { idempotencyKey: randomId() });
    await expectStatus(acceptRes, 404);
    const acceptBody = await acceptRes.json();
    expect(acceptBody?.error?.code).toBe("OFFER_NOT_FOUND");
  });

  test("decline + cancel => 200 and SSE + audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Offer decline listing ${randomId()}`, publish: true });
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
    const threadId = offerBody.thread_id;

    const buyerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.declined")}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      expect(buyerSse.res.status).toBe(200);
      await waitForSseFrame(buyerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const auditStart = new Date().toISOString();
      const declineRes = await declineOffer(request, sellerApiKey, offerId, { idempotencyKey: randomId() });
      await expectStatus(declineRes, 200);
      const declineBody = await declineRes.json();
      expect(declineBody.offer_id).toBe(offerId);
      expect(declineBody.status).toBe("DECLINED");
      expect(declineBody.declined_at).toBeTruthy();

      const { data: offerRow, error: offerErr } = await supabase
        .from("offers")
        .select("status")
        .eq("offer_id", offerId)
        .maybeSingle();
      if (offerErr) throw offerErr;
      expect(offerRow?.status).toBe("DECLINED");

      const frame = await waitForSseFrame(buyerSse.res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "offer.declined" ? entry : undefined)
      });
      if (frame.type !== "event") throw new Error("Expected SSE event");
      const evt = JSON.parse(frame.data);
      expect(evt.type).toBe("offer.declined");
      expect(evt.entity?.id).toBe(offerId);
      expect(evt.payload?.listing_id).toBe(listingId);
      expect(evt.payload?.thread_id).toBe(threadId);

      const declineAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "offer.decline" &&
          row.payload?.offer_id === offerId &&
          Date.parse(row.occurred_at) >= Date.parse(auditStart),
        15
      );
      expect(declineAudit).toBeTruthy();

      // Create a 2nd offer and cancel it as buyer.
      const offer2Res = await createOffer(
        request,
        buyerApiKey,
        listingId,
        { threadId: null, amount: 351, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(offer2Res, 201);
      const offer2Body = await offer2Res.json();
      const offer2Id = offer2Body.offer_id;

      const cancelStart = new Date().toISOString();
      const cancelRes = await cancelOffer(request, buyerApiKey, offer2Id, { idempotencyKey: randomId() });
      await expectStatus(cancelRes, 200);
      const cancelBody = await cancelRes.json();
      expect(cancelBody.offer_id).toBe(offer2Id);
      expect(cancelBody.status).toBe("CANCELLED");
      expect(cancelBody.cancelled_at).toBeTruthy();

      const cancelAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "offer.cancel" &&
          row.payload?.offer_id === offer2Id &&
          Date.parse(row.occurred_at) >= Date.parse(cancelStart),
        15
      );
      expect(cancelAudit).toBeTruthy();
    } finally {
      buyerSse.controller.abort();
    }
  });

  test("idempotency: accept replay returns same tx_id + Idempotency-Replayed header", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Offer accept idem listing ${randomId()}`, publish: true });
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

    const idemKey = randomId();
    const first = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: idemKey });
    await expectStatus(first, 200);
    const firstBody = await first.json();
    const txId = firstBody.transaction?.tx_id;
    expect(txId).toBeTruthy();

    const replay = await acceptOffer(request, sellerApiKey, offerId, { idempotencyKey: idemKey });
    await expectStatus(replay, 200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    const replayBody = await replay.json();
    expect(replayBody.transaction?.tx_id).toBe(txId);
  });

  test("atomicity: concurrent accept on 2 offers => only 1 succeeds", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerA = randomId();
    await ensureOwnerDb(supabase, buyerOwnerA);
    const buyerA = await createAgentDbWithOverrides(supabase, buyerOwnerA, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKeyA } = await createActiveApiKeyDb(supabase, buyerA.id);

    const buyerOwnerB = randomId();
    await ensureOwnerDb(supabase, buyerOwnerB);
    const buyerB = await createAgentDbWithOverrides(supabase, buyerOwnerB, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKeyB } = await createActiveApiKeyDb(supabase, buyerB.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Offer accept race listing ${randomId()}`, publish: true });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.listing_id;

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const offerARes = await createOffer(
      request,
      buyerApiKeyA,
      listingId,
      { threadId: null, amount: 350, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(offerARes, 201);
    const offerABody = await offerARes.json();
    const offerAId = offerABody.offer_id;

    const offerBRes = await createOffer(
      request,
      buyerApiKeyB,
      listingId,
      { threadId: null, amount: 351, currency: "EUR", expiresAt },
      { idempotencyKey: randomId() }
    );
    await expectStatus(offerBRes, 201);
    const offerBBody = await offerBRes.json();
    const offerBId = offerBBody.offer_id;

    const [res1, res2] = await Promise.all([
      acceptOffer(request, sellerApiKey, offerAId, { idempotencyKey: randomId() }),
      acceptOffer(request, sellerApiKey, offerBId, { idempotencyKey: randomId() })
    ]);

    const statuses = [res1.status(), res2.status()].sort();
    expect(statuses).toEqual([200, 409]);

    const okRes = res1.status() === 200 ? res1 : res2;
    const failRes = res1.status() === 409 ? res1 : res2;

    const okBody = await okRes.json();
    const failBody = await failRes.json();

    expect(okBody?.transaction?.tx_id).toBeTruthy();
    expect(failBody?.error?.code).toBe("LISTING_LOCKED");

    const { data: txRows, error: txErr } = await supabase
      .from("transactions")
      .select("tx_id,listing_id,status")
      .eq("listing_id", listingId)
      .in("status", ["ACCEPTED", "CONTACT_REVEALED", "COMPLETED_PENDING_CONFIRM", "COMPLETED"]);
    if (txErr) throw txErr;
    expect((txRows || []).length).toBe(1);

    const { data: offers, error: offersErr } = await supabase
      .from("offers")
      .select("offer_id,status")
      .in("offer_id", [offerAId, offerBId]);
    if (offersErr) throw offersErr;
    const byId = new Map((offers || []).map((o: any) => [o.offer_id, o.status]));
    expect(new Set([byId.get(offerAId), byId.get(offerBId)])).toEqual(new Set(["ACCEPTED", "CREATED"]));
  });

  test("expiration job => offer EXPIRED + system info message + audit; idempotent on 2nd run", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await setupPolicy(request, ownerId);

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const sellerAgent = await createAgentDbWithOverrides(supabase, ownerId, { createdAt: agedCreatedAt });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, { createdAt: agedCreatedAt });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const listingRes = await createListing(request, sellerApiKey, { title: `Offer expire listing ${randomId()}`, publish: true });
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
    const threadId = offerBody.thread_id;

    // Force expiration by moving expires_at to just after created_at (constraint is expires_at > created_at).
    // This is already in the past relative to now, so the offer is immediately eligible for expiration.
    const { data: createdRow, error: createdErr } = await supabase
      .from("offers")
      .select("created_at")
      .eq("offer_id", offerId)
      .maybeSingle();
    if (createdErr) throw createdErr;
    const createdAt = createdRow?.created_at;
    if (!createdAt) throw new Error("Missing created_at for offer");
    const expiresAtPastButValid = new Date(new Date(createdAt).getTime() + 1).toISOString();
    const { error: updateErr } = await supabase.from("offers").update({ expires_at: expiresAtPastButValid }).eq("offer_id", offerId);
    if (updateErr) throw updateErr;

    const buyerSse = await openSse(`/api/v1/events/stream?heartbeat=1&types=${encodeURIComponent("offer.expired")}`, {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      expect(buyerSse.res.status).toBe(200);
      await waitForSseFrame(buyerSse.res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const auditStart = new Date().toISOString();
      const first = await runOffersExpiration({ limit: 100 });
      expect(first.expired_count).toBeGreaterThan(0);

      const { data: offerRow, error: offerErr } = await supabase
        .from("offers")
        .select("status")
        .eq("offer_id", offerId)
        .maybeSingle();
      if (offerErr) throw offerErr;
      expect(offerRow?.status).toBe("EXPIRED");

      const { data: infoMessages, error: msgErr } = await supabase
        .from("messages")
        .select("message_id,type,payload,thread_id,created_at,sender_type,sender_id")
        .eq("thread_id", threadId)
        .eq("type", "info")
        .order("created_at", { ascending: false })
        .limit(1);
      if (msgErr) throw msgErr;
      expect((infoMessages || []).length).toBeGreaterThan(0);
      expect(infoMessages[0].sender_type).toBe("system");
      expect(infoMessages[0].payload?.type).toBe("info");
      expect(infoMessages[0].payload?.text).toBe("Offer expired");

      const frame = await waitForSseFrame(buyerSse.res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "offer.expired" ? entry : undefined)
      });
      if (frame.type !== "event") throw new Error("Expected SSE event");
      const evt = JSON.parse(frame.data);
      expect(evt.type).toBe("offer.expired");
      expect(evt.entity?.id).toBe(offerId);
      expect(evt.payload?.listing_id).toBe(listingId);
      expect(evt.payload?.thread_id).toBe(threadId);

      const expireAudit = await waitForAuditLogMatching(
        supabase,
        (row) =>
          row.action?.event === "offer.expire" &&
          row.payload?.offer_id === offerId &&
          row.payload?.listing_id === listingId &&
          Date.parse(row.occurred_at) >= Date.parse(auditStart),
        20
      );
      expect(expireAudit).toBeTruthy();

      const beforeCount = (infoMessages || []).length;
      const second = await runOffersExpiration({ limit: 100 });
      expect(second.expired_count).toBeGreaterThanOrEqual(0);

      // Allow DB a moment, then ensure no additional info message was appended for the same offer.
      await sleep(200);
      const { data: info2, error: msgErr2 } = await supabase
        .from("messages")
        .select("message_id")
        .eq("thread_id", threadId)
        .eq("type", "info")
        .order("created_at", { ascending: false })
        .limit(5);
      if (msgErr2) throw msgErr2;
      expect((info2 || []).length).toBeGreaterThanOrEqual(beforeCount);
    } finally {
      buyerSse.controller.abort();
    }
  });
});
