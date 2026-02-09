import fs from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, sha256Hex } from "./helpers/ids";
import { createListing, createOffer, createCounterOffer, acceptOffer, expectStatus } from "./helpers/http";
import { openSse, waitForSseFrame } from "./helpers/sse";
import { createSupabaseAdmin, ensureOwnerDb, createAgentDbWithOverrides, createActiveApiKeyDb } from "./helpers/supabase";

assertIntegrationEnv();

const offersRouteExists = [
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers.ts"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers.js"),
  path.join(process.cwd(), "src/pages/api/v1/listings/[id]/offers/index.js")
].some((candidate) => fs.existsSync(candidate));

const counterRouteExists = [
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter.js"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/counter/index.js")
].some((candidate) => fs.existsSync(candidate));

const acceptRouteExists = [
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/accept.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/accept/index.ts"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/accept.js"),
  path.join(process.cwd(), "src/pages/api/v1/offers/[offer_id]/accept/index.js")
].some((candidate) => fs.existsSync(candidate));

const requiredRoutesExist = offersRouteExists && counterRouteExists && acceptRouteExists;

test.describe.serial("Integration: Reference agent (TI-265)", () => {
  test.skip(!requiredRoutesExist, "TI-265 requires offers + counter + accept endpoints");

  test.setTimeout(60000);

  test("watchlist.match (SSE) + offer negotiation (offer -> counter -> counter -> accept)", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const sellerOwnerId = randomId();
    await ensureOwnerDb(supabase, sellerOwnerId);
    const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

    const buyerOwnerId = randomId();
    await ensureOwnerDb(supabase, buyerOwnerId);
    const buyerAgent = await createAgentDbWithOverrides(supabase, buyerOwnerId, {
      createdAt: agedCreatedAt,
      trustScore: 90,
      trustFlags: []
    });
    const { apiKey: buyerApiKey } = await createActiveApiKeyDb(supabase, buyerAgent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": sellerOwnerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    // Tags are limited to 32 chars in normalizeTags(), so keep this short.
    const listingCategory = `ti265_cat_${sha256Hex(randomId()).slice(0, 10)}`;

    const wlRes = await request.post("/api/v1/watchlists", {
      headers: { Authorization: `Bearer ${buyerApiKey}`, "Idempotency-Key": randomId() },
      data: {
        name: "TI-265 listing match",
        criteria: { tags: [listingCategory], price_max: 9999 },
        active: true
      }
    });
    await expectStatus(wlRes, 201);
    const wlBody = await wlRes.json();
    const watchlistId = wlBody.watchlist_id;
    expect(watchlistId).toBeTruthy();

    const { res, controller } = await openSse("/api/v1/events/stream?heartbeat=1&types=watchlist.match", {
      headers: { Authorization: `Bearer ${buyerApiKey}`, Accept: "text/event-stream" }
    });

    try {
      // Ensure the stream is up before triggering the match.
      await waitForSseFrame(res, {
        timeoutMs: 2500,
        onFrame: (entry) => (entry.type === "comment" && entry.comment === "ping" ? entry : undefined)
      });

      const listingRes = await createListing(request, sellerApiKey, {
        title: `TI-265 ${listingCategory}`,
        description: "",
        category: listingCategory,
        condition: "GOOD",
        price: { amount: 100, currency: "EUR" },
        publish: true
      });
      await expectStatus(listingRes, 201);
      const listingBody = await listingRes.json();
      const listingId = listingBody.listing_id;
      expect(listingId).toBeTruthy();
      expect(listingBody.status).toBe("LIVE");

      const matchFrame = await waitForSseFrame(res, {
        timeoutMs: 5000,
        onFrame: (entry) => (entry.type === "event" && entry.event === "watchlist.match" ? entry : undefined)
      });
      if (matchFrame.type !== "event") throw new Error("Expected SSE event frame");

      const parsedMatch = JSON.parse(matchFrame.data || "{}");
      expect(parsedMatch.type).toBe("watchlist.match");
      expect(parsedMatch.payload?.listing_id).toBe(listingId);
      expect(parsedMatch.payload?.watchlist_ids || []).toContain(watchlistId);

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
      const offerId1 = offerBody.offer_id;
      const threadId = offerBody.thread_id;
      expect(typeof offerId1).toBe("string");
      expect(typeof threadId).toBe("string");

      const sellerCounterRes = await createCounterOffer(
        request,
        sellerApiKey,
        offerId1,
        { amount: 360, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(sellerCounterRes, 201);
      const sellerCounterBody = await sellerCounterRes.json();
      const offerId2 = sellerCounterBody.offer_id;
      expect(sellerCounterBody.previous_offer_id).toBe(offerId1);
      expect(sellerCounterBody.thread_id).toBe(threadId);

      const buyerCounterRes = await createCounterOffer(
        request,
        buyerApiKey,
        offerId2,
        { amount: 370, currency: "EUR", expiresAt },
        { idempotencyKey: randomId() }
      );
      await expectStatus(buyerCounterRes, 201);
      const buyerCounterBody = await buyerCounterRes.json();
      const offerId3 = buyerCounterBody.offer_id;
      expect(buyerCounterBody.previous_offer_id).toBe(offerId2);
      expect(buyerCounterBody.thread_id).toBe(threadId);

      const acceptRes = await acceptOffer(request, sellerApiKey, offerId3, { idempotencyKey: randomId() });
      await expectStatus(acceptRes, 200);
      const acceptBody = await acceptRes.json();

      expect(acceptBody.offer_id).toBe(offerId3);
      expect(acceptBody.status).toBe("ACCEPTED");
      expect(acceptBody.listing_status).toBe("RESERVED");
      expect(acceptBody.transaction?.listing_id).toBe(listingId);
      expect(acceptBody.transaction?.thread_id).toBe(threadId);
      expect(acceptBody.transaction?.accepted_offer_id).toBe(offerId3);
      expect(acceptBody.transaction?.buyer_agent_id).toBe(buyerAgent.id);
      expect(acceptBody.transaction?.seller_agent_id).toBe(sellerAgent.id);
      expect(acceptBody.transaction?.status).toBe("ACCEPTED");

      const txId = acceptBody.transaction?.tx_id;
      expect(typeof txId).toBe("string");

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
        .select("tx_id,accepted_offer_id,listing_id,thread_id,status")
        .eq("tx_id", txId)
        .maybeSingle();
      if (txErr) throw txErr;
      expect(txRow?.tx_id).toBe(txId);
      expect(txRow?.accepted_offer_id).toBe(offerId3);
      expect(txRow?.listing_id).toBe(listingId);
      expect(txRow?.thread_id).toBe(threadId);
      expect(txRow?.status).toBe("ACCEPTED");
    } finally {
      controller.abort();
    }
  });
});
