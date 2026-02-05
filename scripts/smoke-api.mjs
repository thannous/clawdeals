import crypto from "node:crypto";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ownerId = process.env.SMOKE_OWNER_ID || crypto.randomUUID();
const shouldCreateOwner = !process.env.SMOKE_OWNER_ID;
const agentId = process.env.SMOKE_AGENT_ID || "";
let agentApiKey = process.env.SMOKE_AGENT_API_KEY || "";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "IDEMPOTENCY_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars for smoke test: ${missing.join(", ")}`);
  process.exit(1);
}

function buildHeaders(extra = {}, options = {}) {
  const useOwner = options.useOwner ?? true;
  const useAgent = options.useAgent ?? true;
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

async function run() {
  console.log(`Smoke test base: ${baseUrl}`);

  const idempotencyKey = crypto.randomUUID();

  if (shouldCreateOwner) {
    const email = `smoke+${ownerId}@example.com`;
    const ownerRes = await patchJson("/api/v1/owner", { email }, {}, { useAgent: false });
    await expectStatus(ownerRes, [200]);
    const owner = await ownerRes.json();
    console.log("Owner upserted", owner.data?.owner_id);
  }

  const agentRes = await postJson("/api/v1/agents", { name: "Smoke Agent" }, {
    "Idempotency-Key": idempotencyKey
  }, { useAgent: false });
  if (agentRes.status === 429) {
    console.log("Agent create rate limited (expected in repeated runs)");
  } else {
    await expectStatus(agentRes, [201]);
    const agent = await agentRes.json();
    agentApiKey = agent.data?.api_key || agentApiKey;
    console.log("Agent created", agent.data?.agent_id);
  }

  const policyRes = await putJson("/api/v1/policies", {
    budgets: { max_offer: 400, currency: "EUR" },
    approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
    auto_approve: { message_types: ["answer"], actions: ["thread.create"] },
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
    { useOwner: false, useAgent: true }
  );
  await expectStatus(dealRes, [201]);
  const deal = await dealRes.json();
  console.log("Deal created", deal.data?.id || deal.deal?.deal_id);

  const listingRes = await postJson(
    "/api/v1/listings",
    { title: "Smoke listing", deal_id: deal.data?.id || deal.deal?.deal_id },
    {},
    { useOwner: false, useAgent: true }
  );
  await expectStatus(listingRes, [201]);
  const listing = await listingRes.json();
  console.log("Listing created", listing.data?.id);

  const threadRes = await postJson(
    `/api/v1/listings/${listing.data?.id}/threads`,
    {},
    {},
    { useOwner: false, useAgent: true }
  );
  await expectStatus(threadRes, [201]);
  const thread = await threadRes.json();
  console.log("Thread created", thread.data?.id);

  const msgRes = await postJson(
    `/api/v1/threads/${thread.data?.id}/messages`,
    { body: "hello", message_type: "answer" },
    {},
    { useOwner: false, useAgent: true }
  );
  await expectStatus(msgRes, [201]);
  const msg = await msgRes.json();
  console.log("Message sent", msg.data?.id);

  const reportRes = await postJson(
    "/api/v1/reports",
    { subject: "Smoke report" },
    {},
    { useOwner: false, useAgent: true }
  );
  await expectStatus(reportRes, [201]);
  const report = await reportRes.json();
  console.log("Report created", report.data?.id);

  const sseRes = await getJson("/api/v1/events/stream");
  await expectStatus(sseRes, [200]);
  console.log("SSE endpoint ok");

  console.log("Smoke test passed.");
}

run().catch((error) => {
  console.error("Smoke test failed", error);
  process.exit(1);
});
