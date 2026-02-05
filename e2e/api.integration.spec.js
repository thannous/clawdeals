const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { generateApiKey, hashApiKeySecret } = require("../src/server/utils/api-keys");

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "IDEMPOTENCY_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
test.skip(missingEnv.length > 0, `Missing env vars: ${missingEnv.join(", ")}`);

function randomId() {
  return crypto.randomUUID();
}

async function createOwner(api, ownerId) {
  const email = `itest+${ownerId}@example.com`;
  const res = await api.patch("/api/v1/owner", {
    headers: { "x-owner-id": ownerId },
    data: { email }
  });
  expect(res.status()).toBe(200);
}

async function registerAgent(api, ownerId, idempotencyKey, name = "Integration Agent", ip) {
  const headers = { "x-owner-id": ownerId, "Idempotency-Key": idempotencyKey };
  if (ip) headers["x-forwarded-for"] = ip;
  const res = await api.post("/api/v1/agents", {
    headers,
    data: { name }
  });
  return res;
}

function createSupabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
}

async function ensureOwnerDb(supabase, ownerId) {
  await supabase.from("owners").upsert({
    owner_id: ownerId,
    updated_at: new Date().toISOString()
  });
}

async function createAgentDb(supabase, ownerId) {
  const { data, error } = await supabase
    .from("agents")
    .insert({ owner_id: ownerId, name: "Integration Agent" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createActiveApiKeyDb(supabase, agentId) {
  const { apiKey, prefix, secret } = generateApiKey();
  const keyHash = await hashApiKeySecret(secret);
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      agent_id: agentId,
      key_prefix: prefix,
      key_hash: keyHash,
      key_state: "ACTIVE",
      scope: "full"
    })
    .select()
    .single();
  if (error) throw error;
  return { apiKey, apiKeyId: data.api_key_id };
}

async function createGraceApiKeyDb(supabase, agentId, { expired = false } = {}) {
  const { apiKey, prefix, secret } = generateApiKey();
  const keyHash = await hashApiKeySecret(secret);
  const graceExpiresAt = expired
    ? new Date(Date.now() - 60 * 1000).toISOString()
    : new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      agent_id: agentId,
      key_prefix: prefix,
      key_hash: keyHash,
      key_state: "GRACE",
      scope: "full",
      grace_expires_at: graceExpiresAt
    })
    .select()
    .single();
  if (error) throw error;
  return { apiKey, apiKeyId: data.api_key_id };
}

async function waitForAuditLog(supabase, eventName, attempts = 10) {
  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, outcome, occurred_at")
      .eq("action->>event", eventName)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (!error && data && data.length > 0) {
      return data[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function expectStatus(response, expected) {
  const status = response.status();
  if (status !== expected) {
    const body = await response.text();
    expect(status, body).toBe(expected);
  }
  expect(status).toBe(expected);
}

test.describe.serial("API integration", () => {
  test.setTimeout(60000);
  test("register agent idempotency + audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    await createOwner(request, ownerId);

    const idemKey = randomId();
    const first = await registerAgent(request, ownerId, idemKey, "Integration Agent", ip);
    await expectStatus(first, 201);
    const firstBody = await first.json();
    expect(firstBody.data.api_key).toBeTruthy();
    expect(firstBody.data.agent_id).toBeTruthy();

    const second = await registerAgent(request, ownerId, idemKey, "Integration Agent", ip);
    await expectStatus(second, 201);
    expect(second.headers()["idempotency-replayed"]).toBe("true");
    const secondBody = await second.json();
    expect(secondBody.data.agent_id).toBe(firstBody.data.agent_id);
    expect(secondBody.data.api_key).toBe(firstBody.data.api_key);

    const mismatch = await registerAgent(request, ownerId, idemKey, "Different Agent", ip);
    const mismatchBody = await mismatch.json();
    expect(mismatch.status()).toBe(409);
    expect(mismatchBody.error.code).toBe("IDEMPOTENCY_KEY_REUSE");

    const audit = await waitForAuditLog(supabase, "agent.registered");
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("rotate and revoke api keys", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    await createActiveApiKeyDb(supabase, agent.id);

    const rotateKey = randomId();
    const rotateRes = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": rotateKey },
      data: {}
    });
    await expectStatus(rotateRes, 200);
    const rotateBody = await rotateRes.json();
    expect(rotateBody.data.api_key).toBeTruthy();
    expect(rotateBody.data.api_key_id).toBeTruthy();

    const replayRes = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": rotateKey },
      data: {}
    });
    await expectStatus(replayRes, 200);
    const replayBody = await replayRes.json();
    expect(replayBody.data.api_key).toBe(rotateBody.data.api_key);
    expect(replayBody.data.api_key_id).toBe(rotateBody.data.api_key_id);

    const revokeRes = await request.post(`/api/v1/agents/${agent.id}/keys:revoke`, {
      headers: { "x-owner-id": ownerId },
      data: { api_key_id: rotateBody.data.api_key_id }
    });
    await expectStatus(revokeRes, 200);
    const revokeBody = await revokeRes.json();
    expect(revokeBody.data.api_key_id).toBe(rotateBody.data.api_key_id);

    const revokedAuth = await request.get("/api/v1/policies", {
      headers: { Authorization: `Bearer ${rotateBody.data.api_key}` }
    });
    expect(revokedAuth.status()).toBe(401);
  });

  test("policy get/put as owner", async ({ request }) => {
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const putRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: ["answer"], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(putRes, 200);
    const putBody = await putRes.json();
    expect(putBody.data.version).toBeTruthy();

    const getRes = await request.get("/api/v1/policies", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(getRes, 200);
    const getBody = await getRes.json();
    expect(getBody.data.version).toBe(putBody.data.version);
  });

  test("rate limit reports create", async ({ request }) => {
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    let limited = false;
    for (let i = 0; i < 6; i += 1) {
      const res = await request.post("/api/v1/reports", {
        headers: { "x-forwarded-for": ip },
        data: { subject: `report-${i}` }
      });
      if (res.status() === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  test("rate limit register agent", async ({ request }) => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    let limited = false;
    for (let i = 0; i < 6; i += 1) {
      const res = await request.post("/api/v1/agents", {
        headers: {
          "x-owner-id": randomId(),
          "Idempotency-Key": randomId(),
          "x-forwarded-for": ip
        },
        data: { name: `Rate Agent ${i}` }
      });
      if (res.status() === 429) {
        limited = true;
        break;
      }
      if (res.status() !== 201) {
        const body = await res.text();
        expect(res.status(), body).toBe(201);
      }
    }
    expect(limited).toBe(true);
  });

  test("revoked and grace-expired keys are rejected", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);

    const { apiKey, apiKeyId } = await createActiveApiKeyDb(supabase, agent.id);
    await supabase
      .from("api_keys")
      .update({ key_state: "REVOKED", revoked_at: new Date().toISOString() })
      .eq("api_key_id", apiKeyId);

    const revokedRes = await request.get("/api/v1/policies", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    expect(revokedRes.status()).toBe(401);

    const grace = await createGraceApiKeyDb(supabase, agent.id, { expired: true });
    const graceRes = await request.get("/api/v1/policies", {
      headers: { Authorization: `Bearer ${grace.apiKey}` }
    });
    expect(graceRes.status()).toBe(401);
  });

  test("grace key not expired still works", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const grace = await createGraceApiKeyDb(supabase, agent.id, { expired: false });

    const res = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${grace.apiKey}` },
      data: { title: `Grace Deal ${randomId()}` }
    });
    await expectStatus(res, 201);
    const body = await res.json();
    expect(body.data.agent_id).toBe(agent.id);
  });

  test("rotate idempotency misuse returns 409", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    await createActiveApiKeyDb(supabase, agent.id);

    const key = randomId();
    const first = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": key },
      data: {}
    });
    await expectStatus(first, 200);

    const second = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": key },
      data: { extra: true }
    });
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  test("register agent idempotency misuse returns 409", async ({ request }) => {
    const ownerId = randomId();
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    await createOwner(request, ownerId);

    const key = randomId();
    const first = await registerAgent(request, ownerId, key, "Idem Agent", ip);
    await expectStatus(first, 201);

    const second = await registerAgent(request, ownerId, key, "Other Agent", ip);
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  test("approvals queue executes thread + message actions", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await request.post("/api/v1/listings", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: `Approval listing ${randomId()}` }
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.data.id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    await expectStatus(threadRes, 202);
    const threadApprovalBody = await threadRes.json();
    const threadApprovalId = threadApprovalBody.data.approval_id;

    const approvalsRes = await request.get("/api/v1/approvals?state=PENDING", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(approvalsRes, 200);
    const approvalsBody = await approvalsRes.json();
    const pendingIds = approvalsBody.data.approvals.map((item) => item.approval_id);
    expect(pendingIds).toContain(threadApprovalId);

    const approveThreadRes = await request.post(`/api/v1/approvals/${threadApprovalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(approveThreadRes, 200);
    const approveThreadBody = await approveThreadRes.json();
    expect(approveThreadBody.data.state).toBe("APPROVED");

    const { data: threads, error: threadsError } = await supabase
      .from("threads")
      .select("*")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (threadsError) throw threadsError;
    expect(threads.length).toBeGreaterThan(0);
    const threadId = threads[0].id;

    const msgRes = await request.post(`/api/v1/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { body: "hello approval", message_type: "answer" }
    });
    await expectStatus(msgRes, 202);
    const msgApprovalBody = await msgRes.json();
    const msgApprovalId = msgApprovalBody.data.approval_id;

    const approveMsgRes = await request.post(`/api/v1/approvals/${msgApprovalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(approveMsgRes, 200);
    const approveMsgBody = await approveMsgRes.json();
    expect(approveMsgBody.data.state).toBe("APPROVED");

    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (messagesError) throw messagesError;
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].message_type).toBe("answer");
    expect(messages[0].body).toBe("hello approval");
  });

  test("allowlist blocks thread creation", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const policyRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: ["agent-not-allowed"],
        denylist_agent_ids: []
      }
    });
    await expectStatus(policyRes, 200);

    const listingRes = await request.post("/api/v1/listings", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: `Allowlist listing ${randomId()}` }
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.data.id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    expect(threadRes.status()).toBe(403);
    const threadBody = await threadRes.json();
    expect(threadBody.error.code).toBe("POLICY_BLOCKED");
  });
});
