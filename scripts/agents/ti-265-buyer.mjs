import {
  uuid,
  redactSecret,
  normalizeApiBase,
  resolveTimeoutMs,
  registerAgent,
  resetSandbox,
  createWatchlist,
  openSse,
  waitForSseEvent,
  createOffer
} from "./ti-265-utils.mjs";

function requireString(value, name) {
  if (!value || typeof value !== "string") {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function run() {
  const env = process.env;
  const apiBase = normalizeApiBase(env.CLAWDEALS_API_BASE);
  const timeoutMs = resolveTimeoutMs(env);
  const runId = (env.TI265_RUN_ID && String(env.TI265_RUN_ID).trim()) || uuid().split("-")[0];

  const listingCategory = `ti265_cat_${runId}`;

  let apiKey = env.CLAWDEALS_BUYER_API_KEY ? String(env.CLAWDEALS_BUYER_API_KEY) : null;

  if (!apiKey) {
    const registered = await registerAgent({
      apiBase,
      ownerId: uuid(),
      name: `TI-265 buyer ${runId}`,
      timeoutMs
    });
    apiKey = registered.apiKey;
    console.log(`[buyer] registered agent_id=${registered.agentId}`);
  } else {
    console.log(`[buyer] using CLAWDEALS_BUYER_API_KEY=${redactSecret(apiKey)}`);
  }

  apiKey = requireString(apiKey, "buyer apiKey");

  if (env.CLAWDEALS_ENV === "sandbox") {
    try {
      await resetSandbox({ apiBase, apiKey, timeoutMs });
      console.log("[buyer] sandbox reset ok");
    } catch (error) {
      if (error?.status === 404) {
        throw new Error("Sandbox reset returned 404. Start the API with CLAWDEALS_ENV=sandbox.");
      }
      throw error;
    }
  }

  const watchlist = await createWatchlist({
    apiBase,
    apiKey,
    timeoutMs,
    name: `TI-265 listings ${runId}`,
    criteria: { tags: [listingCategory], price_max: 9999 },
    active: true
  });

  console.log(`[buyer] watchlist created watchlist_id=${watchlist.watchlist_id} tag=${listingCategory}`);

  const sse = await openSse({
    apiBase,
    apiKey,
    types: ["watchlist.match"],
    heartbeatSeconds: 1
  });

  if (sse.res.status !== 200) {
    const text = await sse.res.text().catch(() => "");
    throw new Error(`SSE connect failed: ${sse.res.status} ${text}`);
  }

  try {
    await waitForSseEvent(sse.res, {
      timeoutMs,
      predicate: (frame) => frame.type === "comment" && frame.comment === "ping"
    });
    console.log("[buyer] SSE ping ok");

    const matchFrame = await waitForSseEvent(sse.res, {
      timeoutMs: Math.max(timeoutMs, 30000),
      predicate: (frame) => {
        if (frame.type !== "event" || frame.event !== "watchlist.match") return false;
        try {
          const evt = JSON.parse(frame.data || "{}");
          return Boolean(evt?.payload?.listing_id);
        } catch {
          return false;
        }
      }
    });

    const match = matchFrame.type === "event" ? JSON.parse(matchFrame.data || "{}") : {};
    const listingId = match?.payload?.listing_id;
    if (!listingId || typeof listingId !== "string") {
      throw new Error("Failed to parse listing_id from watchlist.match event");
    }

    console.log(`[buyer] matched listing_id=${listingId}`);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const offerRes = await createOffer({
      apiBase,
      apiKey,
      timeoutMs,
      listingId,
      offer: { amount: 350, currency: "EUR", expires_at: expiresAt }
    });

    const offerId = offerRes?.offer_id;
    if (!offerId) {
      throw new Error("Failed to parse offer_id from POST /v1/listings/{id}/offers response");
    }

    console.log(`[buyer] offer created offer_id=${offerId} thread_id=${offerRes?.thread_id || "n/a"}`);
    console.log("[buyer] next: use the seller to counter/accept, or run scripts/agents/ti-265-run.mjs for full E2E");
  } catch (error) {
    if (error?.code === "APPROVAL_REQUIRED") {
      console.error("[buyer] offer requires approval (likely quarantined buyer agent). Provide an aged buyer key or run in sandbox.");
    }
    throw error;
  } finally {
    sse.controller.abort();
  }

  console.log("[buyer] done");
}

run().catch((error) => {
  console.error("[buyer] failed", {
    message: error?.message || String(error),
    code: error?.code || null,
    status: error?.status || null
  });
  process.exit(1);
});

