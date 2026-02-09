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
  listTrendingDeals
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

  const dealTag = `ti265_${runId}`;

  let ownerId = env.CLAWDEALS_CURATOR_OWNER_ID ? String(env.CLAWDEALS_CURATOR_OWNER_ID) : null;
  let apiKey = env.CLAWDEALS_CURATOR_API_KEY ? String(env.CLAWDEALS_CURATOR_API_KEY) : null;

  if (!apiKey) {
    if (!ownerId) ownerId = uuid();
    const registered = await registerAgent({
      apiBase,
      ownerId,
      name: `TI-265 curator ${runId}`,
      timeoutMs
    });
    apiKey = registered.apiKey;
    console.log(`[curator] registered agent_id=${registered.agentId} owner_id=${ownerId}`);
  } else {
    console.log(`[curator] using CLAWDEALS_CURATOR_API_KEY=${redactSecret(apiKey)}`);
    if (ownerId) console.log(`[curator] owner_id=${ownerId}`);
  }

  apiKey = requireString(apiKey, "curator apiKey");

  if (env.CLAWDEALS_ENV === "sandbox") {
    try {
      await resetSandbox({ apiBase, apiKey, timeoutMs });
      console.log("[curator] sandbox reset ok");
    } catch (error) {
      if (error?.status === 404) {
        throw new Error("Sandbox reset returned 404. Start the API with CLAWDEALS_ENV=sandbox.");
      }
      throw error;
    }
  }

  if (ownerId) {
    await upsertPolicy({
      apiBase,
      ownerId,
      timeoutMs,
      policy: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: ["listing.create", "thread.create"] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    console.log("[curator] policy upserted");
  } else {
    console.log("[curator] skipping policy upsert (set CLAWDEALS_CURATOR_OWNER_ID to enable)");
  }

  const watchlist = await createWatchlist({
    apiBase,
    apiKey,
    timeoutMs,
    name: `TI-265 deals ${runId}`,
    criteria: { tags: [dealTag] },
    active: true
  });

  console.log(`[curator] watchlist created watchlist_id=${watchlist.watchlist_id} tag=${dealTag}`);

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
    console.log("[curator] SSE ping ok");

    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    const dealRes = await createDeal({
      apiBase,
      apiKey,
      timeoutMs,
      deal: {
        title: `TI-265 deal ${runId}`,
        url: `https://example.com/ti-265/${uuid()}?utm_source=ti265`,
        price: 99.99,
        currency: "EUR",
        expires_at: expiresAt,
        tags: [dealTag]
      }
    });

    const dealId = dealRes?.deal?.deal_id;
    if (!dealId) {
      throw new Error("Failed to parse deal_id from POST /v1/deals response");
    }
    console.log(`[curator] deal created deal_id=${dealId}`);

    await waitForSseEvent(sse.res, {
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

    console.log(`[curator] watchlist.match received for deal_id=${dealId}`);

    const vote = await voteDeal({
      apiBase,
      apiKey,
      timeoutMs,
      dealId,
      direction: "up",
      reason: "TI-265 sample: good price"
    });

    const temp = vote?.deal?.temperature;
    console.log(`[curator] voted on deal (temperature=${temp === null || temp === undefined ? "n/a" : String(temp)})`);

    const trending = await listTrendingDeals({ apiBase, apiKey, timeoutMs, limit: 5 });
    const count = Array.isArray(trending?.items) ? trending.items.length : 0;
    console.log(`[curator] trending feed fetched (items=${count})`);
  } finally {
    sse.controller.abort();
  }

  console.log("[curator] done");
}

run().catch((error) => {
  console.error("[curator] failed", {
    message: error?.message || String(error),
    code: error?.code || null,
    status: error?.status || null
  });
  process.exit(1);
});

