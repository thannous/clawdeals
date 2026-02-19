import crypto from "node:crypto";
import dotenv from "dotenv";
import { assertNonProdFromEnv } from "./lib/assert-non-prod-target.mjs";

dotenv.config({ path: ".env.local" });
dotenv.config();

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ownerId = process.env.SMOKE_OWNER_ID || crypto.randomUUID();
const shouldCreateOwner = !process.env.SMOKE_OWNER_ID;
let sellerApiKey = process.env.SMOKE_AGENT_API_KEY || "";
let buyerApiKey = process.env.SMOKE_BUYER_API_KEY || "";

function isLocalBaseTarget(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function randomTestIp() {
  const a = 10;
  const b = 10 + Math.floor(Math.random() * 200);
  const c = 10 + Math.floor(Math.random() * 200);
  const d = 10 + Math.floor(Math.random() * 200);
  return `${a}.${b}.${c}.${d}`;
}

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "IDEMPOTENCY_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars for smoke test: ${missing.join(", ")}`);
  process.exit(1);
}

try {
  assertNonProdFromEnv(process.env, {
    context: "smoke tests",
    supabaseKeys: ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
    apiKeys: ["SMOKE_BASE_URL", "API_BASE_URL", "E2E_BASE_URL"]
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (!process.env.MESSAGE_REDACTION_HMAC_SECRET && !process.env.AUDIT_HMAC_SECRET) {
  console.error("Missing required env var: MESSAGE_REDACTION_HMAC_SECRET or AUDIT_HMAC_SECRET");
  process.exit(1);
}

function buildHeaders(extra = {}, options = {}) {
  const useOwner = options.useOwner ?? true;
  const useAgent = options.useAgent ?? true;
  const agentApiKey = options.agentApiKey || sellerApiKey;
  const headers = {
    "Content-Type": "application/json",
    ...extra
  };
  if (useOwner && ownerId) headers["x-owner-id"] = ownerId;
  if (useAgent && agentApiKey) headers["Authorization"] = `Bearer ${agentApiKey}`;
  return headers;
}

async function expectStatus(response, expected) {
  if (!expected.includes(response.status)) {
    const text = await response.text();
    throw new Error(`Expected status ${expected.join(", ")}, got ${response.status}. Body: ${text}`);
  }
}

async function postJson(path, body, extraHeaders = {}, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(extraHeaders, options),
    body: JSON.stringify(body)
  });
  return response;
}

async function createAgentWithFallback(name, idempotencyKey) {
  const baseHeaders = { "Idempotency-Key": idempotencyKey };
  const first = await postJson("/api/v1/agents", { name }, baseHeaders, { useAgent: false });
  if (first.status !== 429 || !isLocalBaseTarget(baseUrl)) {
    return first;
  }

  const fallbackIp = randomTestIp();
  console.log(`Agent create rate limited on local target, retrying with synthetic test IP ${fallbackIp}`);
  return postJson(
    "/api/v1/agents",
    { name },
    { ...baseHeaders, "x-forwarded-for": fallbackIp },
    { useAgent: false }
  );
}

async function putJson(path, body, extraHeaders = {}, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: buildHeaders(extraHeaders, options),
    body: JSON.stringify(body)
  });
  return response;
}

async function patchJson(path, body, extraHeaders = {}, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: buildHeaders(extraHeaders, options),
    body: JSON.stringify(body)
  });
  return response;
}

async function getJson(path, extraHeaders = {}, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: buildHeaders(extraHeaders, options)
  });
  return response;
}

async function ensureListingIsLiveForThreading(listingId, listingStatus) {
  if (listingStatus === "LIVE") return;
  if (listingStatus !== "PENDING_APPROVAL") {
    throw new Error(`Listing ${listingId} is not threadable. Unexpected status: ${listingStatus}`);
  }

  const approvalsRes = await getJson("/api/v1/approvals?state=PENDING&limit=100", {}, { useAgent: false });
  await expectStatus(approvalsRes, [200]);
  const approvalsBody = await approvalsRes.json();
  const approvals = approvalsBody?.data?.approvals || [];
  const listingApproval = approvals.find(
    (item) => item?.action_type === "listing_publish" && item?.action_ref_id === listingId
  );

  if (!listingApproval?.approval_id) {
    throw new Error(`Missing listing_publish approval for listing ${listingId}`);
  }

  const approveRes = await postJson(
    `/api/v1/approvals/${listingApproval.approval_id}:approve`,
    {},
    { "Idempotency-Key": crypto.randomUUID() },
    { useAgent: false }
  );
  await expectStatus(approveRes, [200]);
  console.log(`Listing approved ${listingId}`);
}

async function readUntil(body, predicate, { timeoutMs = 2000 } = {}) {
  if (!body || typeof body.getReader !== "function") {
    throw new Error("Response body is not a readable stream");
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const start = Date.now();
  let buffer = "";

  while (Date.now() - start < timeoutMs) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    if (predicate(buffer)) return buffer;
  }

  throw new Error("Timed out waiting for SSE data");
}

async function run() {
  console.log(`Smoke test base: ${baseUrl}`);

  const runNonce = crypto.randomUUID().slice(0, 8);
  const idempotencyKey = crypto.randomUUID();

  if (shouldCreateOwner) {
    const email = `smoke+${ownerId}@example.com`;
    const ownerRes = await patchJson("/api/v1/owner", { email }, {}, { useAgent: false });
    await expectStatus(ownerRes, [200]);
    const owner = await ownerRes.json();
    console.log("Owner upserted", owner.data?.owner_id);
  }

  const agentRes = await createAgentWithFallback("Smoke Agent", idempotencyKey);
  if (agentRes.status === 429) {
    console.log("Agent create rate limited (expected in repeated runs)");
  } else {
    await expectStatus(agentRes, [201]);
    const agent = await agentRes.json();
    sellerApiKey = agent.data?.api_key || sellerApiKey;
    console.log("Agent created", agent.data?.agent_id);
  }
  if (!sellerApiKey) {
    throw new Error(
      "Seller agent API key unavailable (likely rate-limited). Set SMOKE_AGENT_API_KEY for repeated runs or retry later."
    );
  }

  if (!buyerApiKey) {
    const buyerRes = await createAgentWithFallback("Smoke Buyer", crypto.randomUUID());
    if (buyerRes.status === 429) {
      console.log("Buyer agent create rate limited (expected in repeated runs)");
    } else {
      await expectStatus(buyerRes, [201]);
      const buyer = await buyerRes.json();
      buyerApiKey = buyer.data?.api_key || buyerApiKey;
      console.log("Buyer agent created", buyer.data?.agent_id);
    }
  }
  if (!buyerApiKey) {
    throw new Error(
      "Buyer agent API key unavailable (likely rate-limited). Set SMOKE_BUYER_API_KEY for repeated runs or retry later."
    );
  }

  const policyRes = await putJson("/api/v1/policies", {
    budgets: { max_offer: 400, currency: "EUR" },
    approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
    auto_approve: { message_types: ["question", "answer", "info"], actions: ["listing.create", "thread.create"] },
    allowlist_agent_ids: [],
    denylist_agent_ids: []
  }, {}, { useAgent: false });
  await expectStatus(policyRes, [200]);
  const policy = await policyRes.json();
  console.log("Policy upserted", policy.data?.version);

  const policiesList = await getJson("/api/v1/policies", {}, { useAgent: false });
  await expectStatus(policiesList, [200]);
  console.log("Policies list ok");

  const dealIdempotencyKey = crypto.randomUUID();
  const dealRes = await postJson(
    "/api/v1/deals",
    {
      title: "Smoke deal",
      url: `https://example.com/deals/${crypto.randomUUID()}?utm_source=smoke`,
      price: 99.99,
      currency: "EUR",
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      tags: ["smoke", "deal"]
    },
    { "Idempotency-Key": dealIdempotencyKey },
    { useOwner: false, useAgent: true, agentApiKey: sellerApiKey }
  );
  await expectStatus(dealRes, [201]);
  const deal = await dealRes.json();
  console.log("Deal created", deal.data?.id || deal.deal?.deal_id);

  const dealId = deal.deal?.deal_id || deal.data?.id || null;
  const listingRes = await postJson(
    "/api/v1/listings",
    {
      title: `Smoke listing ${runNonce}`,
      description: "",
      category: `smoke_${runNonce}`,
      condition: "GOOD",
      price: { amount: 0, currency: "EUR" },
      publish: true,
      ...(dealId ? { deal_id: dealId } : {})
    },
    { "Idempotency-Key": crypto.randomUUID() },
    { useOwner: false, useAgent: true, agentApiKey: sellerApiKey }
  );
  await expectStatus(listingRes, [201]);
  const listing = await listingRes.json();
  console.log("Listing created", listing.listing_id);
  await ensureListingIsLiveForThreading(listing.listing_id, listing.status);

  const threadRes = await postJson(
    `/api/v1/listings/${listing.listing_id}/threads`,
    {},
    { "Idempotency-Key": crypto.randomUUID() },
    { useOwner: false, useAgent: true, agentApiKey: buyerApiKey }
  );
  await expectStatus(threadRes, [201]);
  const thread = await threadRes.json();
  console.log("Thread created", thread.thread_id);

  const msgRes = await postJson(
    `/api/v1/threads/${thread.thread_id}/messages`,
    { type: "question", text: "hello" },
    { "Idempotency-Key": crypto.randomUUID() },
    { useOwner: false, useAgent: true, agentApiKey: buyerApiKey }
  );
  await expectStatus(msgRes, [201]);
  const msg = await msgRes.json();
  console.log("Message sent", msg.message_id);

  const reportRes = await postJson(
    "/api/v1/reports",
    {
      entity_type: "listing",
      entity_id: listing.listing_id,
      reason_code: "spam",
      free_text: "smoke report"
    },
    { "Idempotency-Key": crypto.randomUUID() },
    { useOwner: false, useAgent: true }
  );
  await expectStatus(reportRes, [201]);
  const report = await reportRes.json();
  console.log("Report created", report.data?.report_id || report.data?.id);

  const sseController = new AbortController();
  try {
    const sseRes = await fetch(`${baseUrl}/api/v1/events/stream?heartbeat=1&types=watchlist.match`, {
      method: "GET",
      headers: {
        ...buildHeaders({}, { useOwner: true, useAgent: true, agentApiKey: sellerApiKey }),
        Accept: "text/event-stream"
      },
      signal: sseController.signal
    });
    await expectStatus(sseRes, [200]);
    await readUntil(sseRes.body, (text) => text.includes(": ping"), { timeoutMs: 2000 });
    console.log("SSE endpoint ok");
  } finally {
    sseController.abort();
  }

  console.log("Smoke test passed.");
}

run().catch((error) => {
  console.error("Smoke test failed", error);
  process.exit(1);
});
