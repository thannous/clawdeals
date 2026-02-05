/* eslint-disable no-console */
import crypto from "node:crypto";

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ownerId = process.env.SMOKE_OWNER_ID || "";
const agentId = process.env.SMOKE_AGENT_ID || "";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "IDEMPOTENCY_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env vars for smoke test: ${missing.join(", ")}`);
  process.exit(1);
}

function buildHeaders(extra = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extra
  };
  if (ownerId) headers["x-owner-id"] = ownerId;
  if (agentId) headers["x-agent-id"] = agentId;
  return headers;
}

async function expectStatus(response, expected) {
  if (!expected.includes(response.status)) {
    const text = await response.text();
    throw new Error(`Expected status ${expected.join(", ")}, got ${response.status}. Body: ${text}`);
  }
}

async function postJson(path, body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(extraHeaders),
    body: JSON.stringify(body)
  });
  return response;
}

async function putJson(path, body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: buildHeaders(extraHeaders),
    body: JSON.stringify(body)
  });
  return response;
}

async function getJson(path, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: buildHeaders(extraHeaders)
  });
  return response;
}

async function run() {
  console.log(`Smoke test base: ${baseUrl}`);

  const idempotencyKey = crypto.randomUUID();

  const agentRes = await postJson("/api/v1/agents", { name: "Smoke Agent" }, {
    "Idempotency-Key": idempotencyKey
  });
  await expectStatus(agentRes, [201]);
  const agent = await agentRes.json();
  console.log("Agent created", agent.data?.id);

  const policyRes = await putJson("/api/v1/policies", { name: "default", body: { allow: true } });
  await expectStatus(policyRes, [200]);
  const policy = await policyRes.json();
  console.log("Policy upserted", policy.data?.id);

  const policiesList = await getJson("/api/v1/policies");
  await expectStatus(policiesList, [200]);
  console.log("Policies list ok");

  const dealRes = await postJson("/api/v1/deals", { title: "Smoke deal" });
  await expectStatus(dealRes, [201]);
  const deal = await dealRes.json();
  console.log("Deal created", deal.data?.id);

  const listingRes = await postJson("/api/v1/listings", { title: "Smoke listing", deal_id: deal.data?.id });
  await expectStatus(listingRes, [201]);
  const listing = await listingRes.json();
  console.log("Listing created", listing.data?.id);

  const threadRes = await postJson(`/api/v1/listings/${listing.data?.id}/threads`, {});
  await expectStatus(threadRes, [201]);
  const thread = await threadRes.json();
  console.log("Thread created", thread.data?.id);

  const msgRes = await postJson(`/api/v1/threads/${thread.data?.id}/messages`, { body: "hello" });
  await expectStatus(msgRes, [201]);
  const msg = await msgRes.json();
  console.log("Message sent", msg.data?.id);

  const reportRes = await postJson("/api/v1/reports", { subject: "Smoke report" });
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
