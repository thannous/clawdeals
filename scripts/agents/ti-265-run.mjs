import {
  uuid,
  redactSecret,
  normalizeApiBase,
  resolveTimeoutMs,
  registerAgent,
  resetSandbox,
  upsertPolicy,
  createWatchlist,
  openSse,
  waitForSseEvent,
  createDeal,
  voteDeal,
  listTrendingDeals,
  createListing,
  createOffer,
  counterOffer,
  acceptOffer
} from "./ti-265-utils.mjs";

function getRunId(env) {
  const raw = env.TI265_RUN_ID;
  if (raw && typeof raw === "string" && raw.trim()) return raw.trim();
  return uuid().split("-")[0];
}

function failWithFix(message, fix) {
  const error = new Error(message);
  error.fix = fix;
  throw error;
}

async function run() {
  const env = process.env;
  const apiBase = normalizeApiBase(env.CLAWDEALS_API_BASE);
  const timeoutMs = resolveTimeoutMs(env);
  const runId = getRunId(env);

  const dealTag = `ti265_${runId}`;
  const listingCategory = `ti265_cat_${runId}`;

  let curatorOwnerId = env.CLAWDEALS_CURATOR_OWNER_ID ? String(env.CLAWDEALS_CURATOR_OWNER_ID) : null;
  let curatorApiKey = env.CLAWDEALS_CURATOR_API_KEY ? String(env.CLAWDEALS_CURATOR_API_KEY) : null;
  let buyerApiKey = env.CLAWDEALS_BUYER_API_KEY ? String(env.CLAWDEALS_BUYER_API_KEY) : null;

  if (!curatorApiKey) {
    if (!curatorOwnerId) curatorOwnerId = uuid();
    const reg = await registerAgent({
      apiBase,
      ownerId: curatorOwnerId,
      name: `TI-265 curator ${runId}`,
      timeoutMs
    });
    curatorApiKey = reg.apiKey;
    console.log(`[run] curator registered agent_id=${reg.agentId} owner_id=${curatorOwnerId}`);
  } else {
    console.log(`[run] curator key=${redactSecret(curatorApiKey)}`);
    if (curatorOwnerId) console.log(`[run] curator owner_id=${curatorOwnerId}`);
  }

  if (!buyerApiKey) {
    const reg = await registerAgent({
      apiBase,
      ownerId: uuid(),
      name: `TI-265 buyer ${runId}`,
      timeoutMs
    });
    buyerApiKey = reg.apiKey;
    console.log(`[run] buyer registered agent_id=${reg.agentId}`);
  } else {
    console.log(`[run] buyer key=${redactSecret(buyerApiKey)}`);
  }

  if (env.CLAWDEALS_ENV === "sandbox") {
    try {
      await resetSandbox({ apiBase, apiKey: curatorApiKey, timeoutMs });
      await resetSandbox({ apiBase, apiKey: buyerApiKey, timeoutMs });
      console.log("[run] sandbox reset ok (curator + buyer)");
    } catch (error) {
      if (error?.status === 404) {
        failWithFix("Sandbox reset returned 404.", "Start the API with CLAWDEALS_ENV=sandbox.");
      }
      throw error;
    }
  }

  if (curatorOwnerId) {
    await upsertPolicy({
      apiBase,
      ownerId: curatorOwnerId,
      timeoutMs,
      policy: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    console.log("[run] curator policy upserted");
  } else {
    console.log("[run] skipping policy upsert (set CLAWDEALS_CURATOR_OWNER_ID to enable)");
  }

  const curatorWatchlist = await createWatchlist({
    apiBase,
    apiKey: curatorApiKey,
    timeoutMs,
    name: `TI-265 deals ${runId}`,
    criteria: { tags: [dealTag] },
    active: true
  });
  console.log(`[run] curator watchlist_id=${curatorWatchlist.watchlist_id} tag=${dealTag}`);

  const buyerWatchlist = await createWatchlist({
    apiBase,
    apiKey: buyerApiKey,
    timeoutMs,
    name: `TI-265 listings ${runId}`,
    criteria: { tags: [listingCategory], price_max: 9999 },
    active: true
  });
  console.log(`[run] buyer watchlist_id=${buyerWatchlist.watchlist_id} tag=${listingCategory}`);

  const curatorSse = await openSse({
    apiBase,
    apiKey: curatorApiKey,
    types: ["watchlist.match"],
    heartbeatSeconds: 1
  });
  if (curatorSse.res.status !== 200) {
    const text = await curatorSse.res.text().catch(() => "");
    throw new Error(`Curator SSE connect failed: ${curatorSse.res.status} ${text}`);
  }

  const buyerSse = await openSse({
    apiBase,
    apiKey: buyerApiKey,
    types: ["watchlist.match"],
    heartbeatSeconds: 1
  });
  if (buyerSse.res.status !== 200) {
    const text = await buyerSse.res.text().catch(() => "");
    throw new Error(`Buyer SSE connect failed: ${buyerSse.res.status} ${text}`);
  }

  try {
    await waitForSseEvent(curatorSse.res, {
      timeoutMs,
      predicate: (frame) => frame.type === "comment" && frame.comment === "ping"
    });
    await waitForSseEvent(buyerSse.res, {
      timeoutMs,
      predicate: (frame) => frame.type === "comment" && frame.comment === "ping"
    });
    console.log("[run] SSE ping ok (curator + buyer)");

    const dealExpiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const dealRes = await createDeal({
      apiBase,
      apiKey: curatorApiKey,
      timeoutMs,
      deal: {
        title: `TI-265 deal ${runId}`,
        url: `https://example.com/ti-265/${uuid()}?utm_source=ti265`,
        price: 99.99,
        currency: "EUR",
        expires_at: dealExpiresAt,
        tags: [dealTag]
      }
    });
    const dealId = dealRes?.deal?.deal_id;
    if (!dealId) throw new Error("Failed to parse deal_id from deal create response");
    console.log(`[run] deal created deal_id=${dealId}`);

    await waitForSseEvent(curatorSse.res, {
      timeoutMs: Math.max(timeoutMs, 15000),
      predicate: (frame) => {
        if (frame.type !== "event" || frame.event !== "watchlist.match") return false;
        try {
          const evt = JSON.parse(frame.data || "{}");
          return evt?.payload?.deal_id === dealId;
        } catch {
          return false;
        }
      }
    });
    console.log("[run] watchlist.match received for deal");

    await voteDeal({
      apiBase,
      apiKey: curatorApiKey,
      timeoutMs,
      dealId,
      direction: "up",
      reason: "TI-265 sample: good price"
    });
    console.log("[run] deal voted");

    const trending = await listTrendingDeals({ apiBase, apiKey: curatorApiKey, timeoutMs, limit: 5 });
    console.log(`[run] trending fetched items=${Array.isArray(trending?.items) ? trending.items.length : 0}`);

    const listingRes = await createListing({
      apiBase,
      apiKey: curatorApiKey,
      timeoutMs,
      listing: {
        title: `TI-265 listing ${runId}`,
        description: "",
        category: listingCategory,
        condition: "GOOD",
        price: { amount: 0, currency: "EUR" },
        publish: true
      }
    });

    const listingId = listingRes?.listing_id;
    const listingStatus = listingRes?.status;
    if (!listingId || typeof listingId !== "string") {
      throw new Error("Failed to parse listing_id from listing create response");
    }

    if (listingStatus !== "LIVE") {
      const reason =
        listingStatus === "PENDING_APPROVAL"
          ? "Listing was created in PENDING_APPROVAL (likely quarantine/policy)."
          : `Listing was created with status=${String(listingStatus || "unknown")}.`;
      failWithFix(reason, "Run with CLAWDEALS_ENV=sandbox or provide an aged curator key/owner with policy allowing listing.create.");
    }

    console.log(`[run] listing created listing_id=${listingId} status=${listingStatus}`);

    await waitForSseEvent(buyerSse.res, {
      timeoutMs: Math.max(timeoutMs, 30000),
      predicate: (frame) => {
        if (frame.type !== "event" || frame.event !== "watchlist.match") return false;
        try {
          const evt = JSON.parse(frame.data || "{}");
          if (evt?.payload?.listing_id !== listingId) return false;
          const watchlistIds = evt?.payload?.watchlist_ids || [];
          return Array.isArray(watchlistIds) ? watchlistIds.includes(buyerWatchlist.watchlist_id) : true;
        } catch {
          return false;
        }
      }
    });

    console.log("[run] watchlist.match received for listing");

    const offerExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    let offerRes;
    try {
      offerRes = await createOffer({
        apiBase,
        apiKey: buyerApiKey,
        timeoutMs,
        listingId,
        offer: { amount: 350, currency: "EUR", expires_at: offerExpiresAt }
      });
    } catch (error) {
      if (error?.code === "APPROVAL_REQUIRED") {
        failWithFix(
          "Offer creation requires approval (likely quarantined buyer agent).",
          "Run with CLAWDEALS_ENV=sandbox or provide an aged buyer key."
        );
      }
      throw error;
    }

    const offerId = offerRes?.offer_id;
    if (!offerId) throw new Error("Failed to parse offer_id");
    console.log(`[run] offer created offer_id=${offerId}`);

    const sellerCounter = await counterOffer({
      apiBase,
      apiKey: curatorApiKey,
      timeoutMs,
      offerId,
      counter: { amount: 360, currency: "EUR", expires_at: offerExpiresAt }
    });
    const sellerCounterId = sellerCounter?.offer_id;
    if (!sellerCounterId) throw new Error("Failed to parse seller counter offer_id");
    console.log(`[run] seller countered new_offer_id=${sellerCounterId}`);

    const buyerCounter = await counterOffer({
      apiBase,
      apiKey: buyerApiKey,
      timeoutMs,
      offerId: sellerCounterId,
      counter: { amount: 370, currency: "EUR", expires_at: offerExpiresAt }
    });
    const buyerCounterId = buyerCounter?.offer_id;
    if (!buyerCounterId) throw new Error("Failed to parse buyer counter offer_id");
    console.log(`[run] buyer countered new_offer_id=${buyerCounterId}`);

    const accepted = await acceptOffer({
      apiBase,
      apiKey: curatorApiKey,
      timeoutMs,
      offerId: buyerCounterId
    });
    const txId = accepted?.transaction?.tx_id;
    const finalListingStatus = accepted?.listing_status;
    if (!txId) throw new Error("Failed to parse tx_id from accept response");
    console.log(`[run] accepted offer tx_id=${txId} listing_status=${String(finalListingStatus || "n/a")}`);
  } finally {
    curatorSse.controller.abort();
    buyerSse.controller.abort();
  }

  console.log("[run] done");
}

run().catch((error) => {
  const payload = {
    message: error?.message || String(error),
    code: error?.code || null,
    status: error?.status || null,
    fix: error?.fix || null
  };
  console.error("[run] failed", payload);
  process.exit(1);
});

