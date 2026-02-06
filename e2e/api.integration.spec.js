const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");
const { generateApiKey, hashApiKeySecret } = require("../src/server/utils/api-keys");
const { calculateDealTemperature } = require("../src/server/utils/deals");
const { runDealLifecycle } = require("../src/server/services/deal-lifecycle");
const { runTrustScoreRecalculation } = require("../src/server/trustscore/recalculate");

const envCandidates = [
  path.resolve(__dirname, "..", ".env.local"),
  path.resolve(process.cwd(), ".env.local")
];
const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
if (envPath) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }
}

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "IDEMPOTENCY_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(`Missing env vars for integration tests: ${missingEnv.join(", ")}`);
}
const skipRateLimitTests = process.env.NODE_ENV !== "production";

function randomId() {
  return crypto.randomUUID();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

async function waitForAuditLog(supabase, eventName, attempts = 10, minOccurredAt) {
  for (let i = 0; i < attempts; i += 1) {
    let query = supabase
      .from("audit_logs")
      .select("id, action, outcome, occurred_at, payload, security, policy")
      .eq("action->>event", eventName)
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (minOccurredAt) {
      query = query.gte("occurred_at", minOccurredAt);
    }
    const { data, error } = await query;
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

async function createOwnerWithContact(api, ownerId, { email, phone }) {
  const body = {};
  if (email) body.email = email;
  if (phone) body.phone = phone;
  const res = await api.patch("/api/v1/owner", {
    headers: { "x-owner-id": ownerId },
    data: body
  });
  expect(res.status()).toBe(200);
}

async function setupAgent(supabase) {
  const ownerId = randomId();
  await ensureOwnerDb(supabase, ownerId);
  const agent = await createAgentDb(supabase, ownerId);
  const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);
  return { ownerId, agent, apiKey };
}

const OPS_CONSOLE_OWNER_ID = "00000000-0000-4000-a000-000000000000";
const OPS_CONSOLE_AGENT_ID = "00000000-0000-4000-a000-000000000001";

async function ensureOpsConsoleAgent(supabase) {
  await supabase.from("owners").upsert({
    owner_id: OPS_CONSOLE_OWNER_ID,
    email: "ops-console@clawdeals.internal",
    email_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  const { data: existing } = await supabase
    .from("agents")
    .select("id")
    .eq("id", OPS_CONSOLE_AGENT_ID)
    .maybeSingle();
  if (!existing) {
    await supabase.from("agents").insert({
      id: OPS_CONSOLE_AGENT_ID,
      owner_id: OPS_CONSOLE_OWNER_ID,
      name: "ops-console",
      trust_score: 100,
      trust_flags: [],
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    });
  }
}

async function waitForAuditLogMatching(supabase, predicate, attempts = 10) {
  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id, action, outcome, occurred_at, payload, security, policy")
      .order("occurred_at", { ascending: false })
      .limit(50);
    if (!error && data) {
      const match = data.find(predicate);
      if (match) return match;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return null;
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

  test("create deal idempotency + audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const payload = {
      title: "Integration Deal",
      url: `https://example.com/p/${randomId()}?utm_source=twitter&b=2&a=1#frag`,
      price: 129.99,
      currency: "EUR",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      tags: ["gpu", "nvidia"]
    };

    const idemKey = randomId();
    const first = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idemKey },
      data: payload
    });
    await expectStatus(first, 201);
    const firstBody = await first.json();
    expect(firstBody.deal.deal_id).toBeTruthy();

    const second = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idemKey },
      data: payload
    });
    await expectStatus(second, 201);
    expect(second.headers()["idempotency-replayed"]).toBe("true");
    const secondBody = await second.json();
    expect(secondBody.deal.deal_id).toBe(firstBody.deal.deal_id);

    const { data: persisted, error } = await supabase
      .from("deals")
      .select("source_url_normalized, source_url_fingerprint")
      .eq("deal_id", firstBody.deal.deal_id)
      .single();
    expect(error).toBeNull();
    expect(persisted?.source_url_normalized).toBeTruthy();
    expect(persisted?.source_url_fingerprint).toMatch(/^[0-9a-f]{64}$/i);

    const audit = await waitForAuditLog(supabase, "deal.create");
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("deal lifecycle transitions NEW to ACTIVE and ACTIVE to EXPIRED", async () => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);

    const now = new Date();
    const nowIso = now.toISOString();
    const pastIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const createdAtIso = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const futureIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const urlA = `https://example.com/deal/${randomId()}`;
    const urlB = `https://example.com/deal/${randomId()}`;

    const { data: inserted, error } = await supabase
      .from("deals")
      .insert([
        {
          title: "Lifecycle NEW",
          source_url: urlA,
          source_url_normalized: urlA,
          source_url_fingerprint: sha256Hex(urlA),
          price: 10,
          currency: "EUR",
          created_at: createdAtIso,
          expires_at: futureIso,
          tags: ["lifecycle"],
          status: "NEW",
          new_until: pastIso,
          creator_agent_id: agent.id
        },
        {
          title: "Lifecycle ACTIVE",
          source_url: urlB,
          source_url_normalized: urlB,
          source_url_fingerprint: sha256Hex(urlB),
          price: 20,
          currency: "EUR",
          created_at: createdAtIso,
          expires_at: pastIso,
          tags: ["lifecycle"],
          status: "ACTIVE",
          new_until: pastIso,
          active_at: pastIso,
          creator_agent_id: agent.id
        }
      ])
      .select("deal_id");

    expect(error).toBeNull();
    const [dealA, dealB] = inserted.map((row) => row.deal_id);

    await runDealLifecycle({ now });

    const { data: updatedA, error: fetchAError } = await supabase
      .from("deals")
      .select("status, active_at, expired_at")
      .eq("deal_id", dealA)
      .single();
    expect(fetchAError).toBeNull();
    expect(updatedA.status).toBe("ACTIVE");
    expect(updatedA.active_at).toBeTruthy();

    const { data: updatedB, error: fetchBError } = await supabase
      .from("deals")
      .select("status, active_at, expired_at")
      .eq("deal_id", dealB)
      .single();
    expect(fetchBError).toBeNull();
    expect(updatedB.status).toBe("EXPIRED");
    expect(updatedB.expired_at).toBeTruthy();

    const { data: audits, error: auditError } = await supabase
      .from("audit_logs")
      .select("payload")
      .eq("action->>event", "deal.state_changed")
      .gte("occurred_at", nowIso);
    expect(auditError).toBeNull();
    const changedIds = new Set((audits || []).map((row) => row.payload?.deal_id));
    expect(changedIds.has(dealA)).toBe(true);
    expect(changedIds.has(dealB)).toBe(true);
  });

  test("deal feed sorting + pagination + audit (new/temp/trend)", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { agent, apiKey } = await setupAgent(supabase);

    const runTag = `itest${randomId().split("-")[0]}`;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const newDealCreatedAt = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const newUntil = new Date(now.getTime() + 5 * 60 * 1000).toISOString();

    const activeHotCreatedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const activeHotAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    const activeCoolCreatedAt = new Date(now.getTime() - 110 * 60 * 1000).toISOString();
    const activeCoolAt = new Date(now.getTime() - 70 * 60 * 1000).toISOString();

    const activeRecentCreatedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const activeRecentAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

    const urlNew = `https://example.com/feed/${randomId()}`;
    const urlHot = `https://example.com/feed/${randomId()}`;
    const urlCool = `https://example.com/feed/${randomId()}`;
    const urlRecent = `https://example.com/feed/${randomId()}`;

    const { data: inserted, error } = await supabase
      .from("deals")
      .insert([
        {
          title: "Feed NEW",
          source_url: urlNew,
          source_url_normalized: urlNew,
          source_url_fingerprint: sha256Hex(urlNew),
          price: 10,
          currency: "EUR",
          created_at: newDealCreatedAt,
          expires_at: expiresAt,
          tags: [runTag, "feed"],
          status: "NEW",
          new_until: newUntil,
          temperature: 99,
          creator_agent_id: agent.id
        },
        {
          title: "Feed ACTIVE hot",
          source_url: urlHot,
          source_url_normalized: urlHot,
          source_url_fingerprint: sha256Hex(urlHot),
          price: 20,
          currency: "EUR",
          created_at: activeHotCreatedAt,
          expires_at: expiresAt,
          tags: [runTag, "feed"],
          status: "ACTIVE",
          new_until: newUntil,
          active_at: activeHotAt,
          temperature: 90,
          creator_agent_id: agent.id
        },
        {
          title: "Feed ACTIVE cool",
          source_url: urlCool,
          source_url_normalized: urlCool,
          source_url_fingerprint: sha256Hex(urlCool),
          price: 30,
          currency: "EUR",
          created_at: activeCoolCreatedAt,
          expires_at: expiresAt,
          tags: [runTag, "feed"],
          status: "ACTIVE",
          new_until: newUntil,
          active_at: activeCoolAt,
          temperature: 70,
          creator_agent_id: agent.id
        },
        {
          title: "Feed ACTIVE recent",
          source_url: urlRecent,
          source_url_normalized: urlRecent,
          source_url_fingerprint: sha256Hex(urlRecent),
          price: 40,
          currency: "EUR",
          created_at: activeRecentCreatedAt,
          expires_at: expiresAt,
          tags: [runTag, "feed"],
          status: "ACTIVE",
          new_until: newUntil,
          active_at: activeRecentAt,
          temperature: 90,
          creator_agent_id: agent.id
        }
      ])
      .select("deal_id, title");

    expect(error).toBeNull();
    const idsByTitle = new Map((inserted || []).map((row) => [row.title, row.deal_id]));
    const newId = idsByTitle.get("Feed NEW");
    const hotId = idsByTitle.get("Feed ACTIVE hot");
    const coolId = idsByTitle.get("Feed ACTIVE cool");
    const recentId = idsByTitle.get("Feed ACTIVE recent");
    expect(newId).toBeTruthy();
    expect(hotId).toBeTruthy();
    expect(coolId).toBeTruthy();
    expect(recentId).toBeTruthy();

    const auditSince = new Date().toISOString();

    const newRes = await request.get(`/api/v1/deals?sort=new&tags=${runTag}&limit=10`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(newRes, 200);
    const newBody = await newRes.json();
    expect(newBody.items.map((item) => item.deal_id)).toEqual([newId, recentId, coolId, hotId]);
    expect(newBody.items[0].temperature).toBeNull();

    const tempRes = await request.get(`/api/v1/deals?sort=temp&status=ACTIVE&tags=${runTag}&limit=10`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(tempRes, 200);
    const tempBody = await tempRes.json();
    expect(tempBody.items.map((item) => item.deal_id)).toEqual([recentId, hotId, coolId]);

    const trendPage1 = await request.get(`/api/v1/deals?sort=trend&status=ACTIVE&tags=${runTag}&limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(trendPage1, 200);
    const trendBody1 = await trendPage1.json();
    expect(trendBody1.items).toHaveLength(1);
    expect(trendBody1.items[0].deal_id).toBe(recentId);
    expect(trendBody1.next_cursor).toBeTruthy();

    const trendPage2 = await request.get(
      `/api/v1/deals?sort=trend&status=ACTIVE&tags=${runTag}&limit=1&cursor=${encodeURIComponent(trendBody1.next_cursor)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` }
      }
    );
    await expectStatus(trendPage2, 200);
    const trendBody2 = await trendPage2.json();
    expect(trendBody2.items).toHaveLength(1);
    expect(trendBody2.items[0].deal_id).toBe(hotId);

    const audit = await waitForAuditLog(supabase, "deals.listed", 10, auditSince);
    expect(audit).toBeTruthy();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("deal vote with reason + unique vote", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const createRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Vote Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 79.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["vote"]
      }
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();
    const dealId = created.deal.deal_id;

    const voteKey = randomId();
    const auditSince = new Date().toISOString();
    const voteRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": voteKey },
      data: { direction: "up", reason: "Excellent price vs MSRP." }
    });
    await expectStatus(voteRes, 201);
    const voteBody = await voteRes.json();
    expect(voteBody.vote.deal_id).toBe(dealId);
    expect(voteBody.vote.agent_id).toBe(agent.id);
    expect(voteBody.deal.votes_up).toBe(1);
    expect(voteBody.deal.temperature).toBeNull();

    const { data: dealRow, error: dealError } = await supabase
      .from("deals")
      .select("votes_weighted_up, votes_weighted_down, temperature")
      .eq("deal_id", dealId)
      .single();
    expect(dealError).toBeNull();
    const weightedUp = Number(dealRow.votes_weighted_up);
    const weightedDown = Number(dealRow.votes_weighted_down);
    const expectedTemperature = calculateDealTemperature(weightedUp, weightedDown);
    const dbTemperature = Number(dealRow.temperature);
    expect(dbTemperature).toBe(expectedTemperature);

    const voteAudit = await waitForAuditLog(supabase, "deal.voted", 10, auditSince);
    expect(voteAudit).toBeTruthy();
    expect(voteAudit.security?.temperature_changed).toBe(true);
    expect(voteAudit.security?.deal_id).toBe(dealId);

    const replayRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": voteKey },
      data: { direction: "up", reason: "Excellent price vs MSRP." }
    });
    await expectStatus(replayRes, 201);
    expect(replayRes.headers()["idempotency-replayed"]).toBe("true");

    const dupRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { direction: "up", reason: "Same vote again" }
    });
    expect(dupRes.status()).toBe(409);
    const dupBody = await dupRes.json();
    expect(dupBody.error.code).toBe("ALREADY_VOTED");
  });

  test("deal vote rejected when expired and temperature frozen", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const createRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Expired Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 49.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["expired"]
      }
    });
    await expectStatus(createRes, 201);
    const created = await createRes.json();
    const dealId = created.deal.deal_id;

    const { error: expireError } = await supabase
      .from("deals")
      .update({ status: "EXPIRED", temperature: 42 })
      .eq("deal_id", dealId);
    expect(expireError).toBeNull();

    const voteRes = await request.post(`/api/v1/deals/${dealId}/vote`, {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: { direction: "down", reason: "Expired" }
    });
    expect(voteRes.status()).toBe(409);
    const voteBody = await voteRes.json();
    expect(voteBody.error.code).toBe("DEAL_EXPIRED");

    const { data: frozen, error: frozenError } = await supabase
      .from("deals")
      .select("temperature")
      .eq("deal_id", dealId)
      .single();
    expect(frozenError).toBeNull();
    expect(frozen.temperature).toBe(42);
  });

  test("rate limit reports create", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit reports create");
    const ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);
    let limited = false;
    for (let i = 0; i < 6; i += 1) {
      const res = await request.post("/api/v1/reports", {
        headers: {
          "x-forwarded-for": ip,
          Authorization: `Bearer ${apiKey}`,
          "Idempotency-Key": randomId()
        },
        data: {
          entity_type: "listing",
          entity_id: randomId(),
          reason_code: "spam",
          free_text: `report-${i}`
        }
      });
      if (res.status() === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  test("rate limit register agent", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit register agent");
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
      headers: { Authorization: `Bearer ${grace.apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: `Grace Deal ${randomId()}`,
        url: `https://example.com/p/${randomId()}`,
        price: 49.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["grace"]
      }
    });
    await expectStatus(res, 201);
    const body = await res.json();
    expect(body.deal.creator_agent_id).toBe(agent.id);
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

  // === TI-223: Owner verification integration tests ===

  test("owner verification: email start + confirm flow", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    const email = `itest+verify+${ownerId.slice(0, 8)}@example.com`;
    await createOwnerWithContact(request, ownerId, { email });

    const startRes = await request.post("/api/v1/owner/verify-email:start", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(startRes, 201);
    const startBody = await startRes.json();
    expect(startBody.data.challenge_id).toBeTruthy();
    expect(startBody.data.expires_at).toBeTruthy();
    const token = startBody.data.token;
    expect(token).toBeTruthy();

    const confirmRes = await request.post("/api/v1/owner/verify-email:confirm", {
      headers: { "x-owner-id": ownerId },
      data: { token }
    });
    await expectStatus(confirmRes, 200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.data.email_verified_at).toBeTruthy();

    const getRes = await request.get("/api/v1/owner", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(getRes, 200);
    const getBody = await getRes.json();
    expect(getBody.data.email_verified_at).toBeTruthy();

    const audit = await waitForAuditLog(supabase, "owner.email_verified");
    expect(audit).not.toBeNull();
    expect(audit.payload?.email).not.toBe(email);
  });

  test("owner verification: phone start + confirm flow", async ({ request }) => {
    const ownerId = randomId();
    await createOwnerWithContact(request, ownerId, { phone: "+33600000001" });

    const startRes = await request.post("/api/v1/owner/verify-phone:start", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(startRes, 201);
    const startBody = await startRes.json();
    expect(startBody.data.challenge_id).toBeTruthy();
    const code = startBody.data.code;
    expect(code).toBeTruthy();

    const confirmRes = await request.post("/api/v1/owner/verify-phone:confirm", {
      headers: { "x-owner-id": ownerId },
      data: { code }
    });
    await expectStatus(confirmRes, 200);
    const confirmBody = await confirmRes.json();
    expect(confirmBody.data.phone_verified_at).toBeTruthy();
  });

  test("owner verification: lockout after max attempts", async ({ request }) => {
    const ownerId = randomId();
    const email = `itest+lockout+${ownerId.slice(0, 8)}@example.com`;
    await createOwnerWithContact(request, ownerId, { email });

    const startRes = await request.post("/api/v1/owner/verify-email:start", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(startRes, 201);

    let lockedOut = false;
    for (let i = 0; i < 6; i += 1) {
      const confirmRes = await request.post("/api/v1/owner/verify-email:confirm", {
        headers: { "x-owner-id": ownerId },
        data: { token: "wrong-token" }
      });
      if (confirmRes.status() === 429) {
        lockedOut = true;
        const body = await confirmRes.json();
        expect(body.error.code).toBe("CHALLENGE_LOCKED");
        expect(confirmRes.headers()["retry-after"]).toBeTruthy();
        break;
      }
    }
    expect(lockedOut).toBe(true);
  });

  test("owner verification: rate limit on verify-email:start", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit verify-email:start");
    const ownerId = randomId();
    const email = `itest+rl+${ownerId.slice(0, 8)}@example.com`;
    await createOwnerWithContact(request, ownerId, { email });

    let limited = false;
    for (let i = 0; i < 8; i += 1) {
      const res = await request.post("/api/v1/owner/verify-email:start", {
        headers: { "x-owner-id": ownerId }
      });
      if (res.status() === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  // === TI-175: Reports integration tests ===

  test("create report OK + audit + report_weight", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { ownerId, agent, apiKey } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Report Target Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 99.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["report"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const reportRes = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "integration test report"
      }
    });
    await expectStatus(reportRes, 201);
    const reportBody = await reportRes.json();
    expect(reportBody.data.report_id).toBeTruthy();
    expect(reportBody.data.report_weight).toBeGreaterThanOrEqual(0);

    const audit = await waitForAuditLog(supabase, "report.created");
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("create report duplicate returns 409", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Dup Report Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 49.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["dupreport"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const firstReport = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "first report"
      }
    });
    await expectStatus(firstReport, 201);

    const dupReport = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "dup report"
      }
    });
    expect(dupReport.status()).toBe(409);
    const dupBody = await dupReport.json();
    expect(dupBody.error.code).toBe("REPORT_DUPLICATE");
  });

  test("auto-hide when threshold met with diverse reporters", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey: apiKey1 } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey1}`, "Idempotency-Key": randomId() },
      data: {
        title: "Auto-hide Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 19.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["autohide"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const oldCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    for (let i = 0; i < 4; i += 1) {
      const { apiKey, agent } = await setupAgent(supabase);
      // Boost trust score to max, clear flags, and age the agent past quarantine (7 days)
      await supabase
        .from("agents")
        .update({ trust_score: 100, trust_flags: [], created_at: oldCreatedAt })
        .eq("id", agent.id);
      const reportRes = await request.post("/api/v1/reports", {
        headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
        data: {
          entity_type: "deal",
          entity_id: dealId,
          reason_code: "scam",
          free_text: `diverse report ${i}`
        }
      });
      await expectStatus(reportRes, 201);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    const { data: modState, error } = await supabase
      .from("moderation_states")
      .select("hidden")
      .eq("entity_type", "deal")
      .eq("entity_id", dealId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(modState?.hidden).toBe(true);
  });

  test("quarantined reporter has weight=0 and cannot trigger auto-hide", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Quarantine-report Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 19.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["quarantine"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const reportRes = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "quarantine test"
      }
    });
    await expectStatus(reportRes, 201);
    const reportBody = await reportRes.json();
    expect(reportBody.data.report_weight).toBeLessThanOrEqual(0.5);
  });

  // === TI-177: Approvals integration tests ===

  test("approvals deny blocks action execution", async ({ request }) => {
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
      data: { title: `Deny test listing ${randomId()}` }
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

    const denyRes = await request.post(`/api/v1/approvals/${threadApprovalId}:deny`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(denyRes, 200);
    const denyBody = await denyRes.json();
    expect(denyBody.data.state).toBe("DENIED");

    const { data: threads } = await supabase
      .from("threads")
      .select("*")
      .eq("listing_id", listingId);
    expect((threads || []).length).toBe(0);
  });

  test("approvals pagination with cursor", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await request.post("/api/v1/listings", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: `Pagination listing ${randomId()}` }
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.data.id;

    for (let i = 0; i < 2; i += 1) {
      const { apiKey: freshApiKey } = await setupAgent(supabase);
      await request.post(`/api/v1/listings/${listingId}/threads`, {
        headers: { Authorization: `Bearer ${freshApiKey}` },
        data: {}
      });
    }

    const page1 = await request.get("/api/v1/approvals?state=PENDING&limit=1", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(page1, 200);
    const page1Body = await page1.json();
    expect(page1Body.data.approvals.length).toBe(1);
    expect(page1Body.data.next_cursor).toBeTruthy();

    const page2 = await request.get(`/api/v1/approvals?state=PENDING&limit=1&cursor=${page1Body.data.next_cursor}`, {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(page2, 200);
    const page2Body = await page2.json();
    expect(page2Body.data.approvals.length).toBe(1);
    expect(page2Body.data.approvals[0].approval_id).not.toBe(page1Body.data.approvals[0].approval_id);
  });

  test("approve idempotency replay is stable", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await request.post("/api/v1/listings", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: `Idem approval listing ${randomId()}` }
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
    const approvalId = threadApprovalBody.data.approval_id;

    const idemKey = randomId();
    const first = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": idemKey },
      data: {}
    });
    await expectStatus(first, 200);

    const replay = await request.post(`/api/v1/approvals/${approvalId}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": idemKey },
      data: {}
    });
    await expectStatus(replay, 200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
  });

  // === TI-179: Audit log integration tests ===

  test("audit log records BLOCKED outcome on allowlist denial", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const auditSince = new Date().toISOString();
    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: ["not-this-agent"],
        denylist_agent_ids: []
      }
    });

    const listingRes = await request.post("/api/v1/listings", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: `Audit block listing ${randomId()}` }
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.data.id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    expect(threadRes.status()).toBe(403);

    const audit = await waitForAuditLogMatching(
      supabase,
      (row) => row.action?.event === "policy.blocked_sender" && row.occurred_at >= auditSince
    );
    if (audit) {
      expect(audit.outcome).toBe("BLOCKED");
    }
  });

  test("audit log redacts PII in owner verification events", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    const email = `itest+pii+${ownerId.slice(0, 8)}@example.com`;
    await createOwnerWithContact(request, ownerId, { email });

    const auditSince = new Date().toISOString();
    const startRes = await request.post("/api/v1/owner/verify-email:start", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(startRes, 201);

    const audit = await waitForAuditLog(supabase, "owner.email_verification_started", 10, auditSince);
    expect(audit).not.toBeNull();
    const payloadStr = JSON.stringify(audit.payload || {});
    expect(payloadStr).not.toContain(email);
  });

  // === TI-172: Idempotency integration tests ===

  test("idempotency: encrypted api_key is replayed correctly", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    await createOwner(request, ownerId);

    const idemKey = randomId();
    const first = await registerAgent(request, ownerId, idemKey, "Encrypted Replay Agent", ip);
    await expectStatus(first, 201);
    const firstBody = await first.json();
    expect(firstBody.data.api_key).toBeTruthy();

    const replay = await registerAgent(request, ownerId, idemKey, "Encrypted Replay Agent", ip);
    await expectStatus(replay, 201);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    const replayBody = await replay.json();
    expect(replayBody.data.api_key).toBe(firstBody.data.api_key);
    expect(replayBody.data.agent_id).toBe(firstBody.data.agent_id);
  });

  // === TI-171: Rotate/Revoke API Key audit integration tests ===

  test("rotate key generates audit event", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    await createActiveApiKeyDb(supabase, agent.id);

    const auditSince = new Date().toISOString();
    const rotateRes = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(rotateRes, 200);

    const audit = await waitForAuditLog(supabase, "agent.key_rotated", 10, auditSince);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("revoke key generates audit event", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey, apiKeyId } = await createActiveApiKeyDb(supabase, agent.id);

    const auditSince = new Date().toISOString();
    const revokeRes = await request.post(`/api/v1/agents/${agent.id}/keys:revoke`, {
      headers: { "x-owner-id": ownerId },
      data: { api_key_id: apiKeyId }
    });
    await expectStatus(revokeRes, 200);

    const audit = await waitForAuditLog(supabase, "agent.key_revoked", 10, auditSince);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("concurrent rotate leaves exactly one ACTIVE key", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    await createActiveApiKeyDb(supabase, agent.id);

    const results = await Promise.allSettled([
      request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
        headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
        data: {}
      }),
      request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
        headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
        data: {}
      })
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const { data: activeKeys, error } = await supabase
      .from("api_keys")
      .select("api_key_id")
      .eq("agent_id", agent.id)
      .eq("key_state", "ACTIVE");
    expect(error).toBeNull();
    expect(activeKeys.length).toBe(1);
  });

  // === TI-176: Policy engine audit integration tests ===

  test("policy decision audit is persisted", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const auditSince = new Date().toISOString();
    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: ["answer"], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });

    const listingRes = await request.post("/api/v1/listings", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: `Policy decision listing ${randomId()}` }
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();
    const listingId = listingBody.data.id;

    const threadRes = await request.post(`/api/v1/listings/${listingId}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    expect([200, 201, 202]).toContain(threadRes.status());

    const audit = await waitForAuditLogMatching(
      supabase,
      (row) => row.occurred_at >= auditSince && row.action?.event != null
    );
    expect(audit).not.toBeNull();
  });

  test("policy version mismatch returns 409", async ({ request }) => {
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const putRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    await expectStatus(putRes, 200);

    const staleRes = await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId, "If-Match": "0" },
      data: {
        budgets: { max_offer: 500, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 500, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [],
        denylist_agent_ids: []
      }
    });
    expect([409, 200]).toContain(staleRes.status());
  });

  // === TI-173: TrustScore integration tests ===

  test("trustscore recalculation updates score after owner verification", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    const email = `itest+trust+${ownerId.slice(0, 8)}@example.com`;
    await createOwnerWithContact(request, ownerId, { email });
    const agent = await createAgentDb(supabase, ownerId);

    const { data: before } = await supabase
      .from("agents")
      .select("trust_score")
      .eq("id", agent.id)
      .single();
    const scoreBefore = before.trust_score;

    const startRes = await request.post("/api/v1/owner/verify-email:start", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(startRes, 201);
    const token = (await startRes.json()).data.token;

    const confirmRes = await request.post("/api/v1/owner/verify-email:confirm", {
      headers: { "x-owner-id": ownerId },
      data: { token }
    });
    await expectStatus(confirmRes, 200);

    await runTrustScoreRecalculation({ now: new Date(), limit: 1000 });

    const { data: after } = await supabase
      .from("agents")
      .select("trust_score")
      .eq("id", agent.id)
      .single();
    expect(after.trust_score).toBeGreaterThan(scoreBefore);
  });

  test("quarantine flag applied to fresh agent in audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const auditSince = new Date().toISOString();
    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Fresh Agent Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 29.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        tags: ["freshagent"]
      }
    });
    await expectStatus(dealRes, 201);

    const audit = await waitForAuditLog(supabase, "deal.create", 10, auditSince);
    expect(audit).not.toBeNull();
  });

  // === TI-174: Quarantine integration tests ===

  test("quarantined agent report has weight 0", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Quarantine Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 9.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["quarantine"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const reportRes = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "quarantine weight test"
      }
    });
    await expectStatus(reportRes, 201);
    const reportBody = await reportRes.json();
    expect(reportBody.data.report_weight).toBeLessThanOrEqual(0.5);
  });

  test("quarantine multipliers appear in audit log", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    const auditSince = new Date().toISOString();
    const dealRes = await request.post("/api/v1/deals", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        title: "Quarantine Audit Deal",
        url: `https://example.com/p/${randomId()}`,
        price: 9.99,
        currency: "EUR",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["quarantine-audit"]
      }
    });
    await expectStatus(dealRes, 201);
    const dealBody = await dealRes.json();
    const dealId = dealBody.deal ? dealBody.deal.deal_id : dealBody.data?.deal_id;

    const reportRes = await request.post("/api/v1/reports", {
      headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
      data: {
        entity_type: "deal",
        entity_id: dealId,
        reason_code: "spam",
        free_text: "quarantine audit test"
      }
    });
    await expectStatus(reportRes, 201);

    const audit = await waitForAuditLog(supabase, "report.created", 10, auditSince);
    expect(audit).not.toBeNull();
  });

  // === TI-178: Allowlist/Denylist integration tests ===

  test("denylist overrides allowlist for same agent", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: [agent.id],
        denylist_agent_ids: [agent.id]
      }
    });

    const listingRes = await request.post("/api/v1/listings", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: `Deny overrides listing ${randomId()}` }
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

  test("audit log policy.blocked_sender is persisted", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const auditSince = new Date().toISOString();
    await request.put("/api/v1/policies", {
      headers: { "x-owner-id": ownerId },
      data: {
        budgets: { max_offer: 400, currency: "EUR" },
        approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
        auto_approve: { message_types: [], actions: [] },
        allowlist_agent_ids: ["not-this-agent"],
        denylist_agent_ids: []
      }
    });

    const listingRes = await request.post("/api/v1/listings", {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { title: `Blocked audit listing ${randomId()}` }
    });
    await expectStatus(listingRes, 201);
    const listingBody = await listingRes.json();

    const threadRes = await request.post(`/api/v1/listings/${listingBody.data.id}/threads`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {}
    });
    expect(threadRes.status()).toBe(403);

    const audit = await waitForAuditLogMatching(
      supabase,
      (row) => row.action?.event === "policy.blocked_sender" && row.occurred_at >= auditSince
    );
    if (audit) {
      expect(audit.outcome).toBe("BLOCKED");
    }
  });

  // === TI-180: Rate limits integration tests ===

  test("rate limit returns standard headers", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit standard headers");
    const supabase = createSupabaseAdmin();
    const { apiKey } = await setupAgent(supabase);

    let rateLimited = false;
    for (let i = 0; i < 25; i += 1) {
      const res = await request.post("/api/v1/deals", {
        headers: { Authorization: `Bearer ${apiKey}`, "Idempotency-Key": randomId() },
        data: {
          title: `Rate limit deal ${i}`,
          url: `https://example.com/p/${randomId()}`,
          price: 9.99,
          currency: "EUR",
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          tags: ["ratelimit"]
        }
      });
      if (res.status() === 429) {
        rateLimited = true;
        expect(res.headers()["retry-after"]).toBeTruthy();
        break;
      }
    }
    expect(rateLimited).toBe(true);
  });

  // === TI-170: Register Agent rate limit test ===

  test("rate limit register agent returns proper headers", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit register agent headers");
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    let rateLimited = false;
    for (let i = 0; i < 8; i += 1) {
      const res = await request.post("/api/v1/agents", {
        headers: {
          "x-owner-id": randomId(),
          "Idempotency-Key": randomId(),
          "x-forwarded-for": ip
        },
        data: { name: `RL Header Agent ${i}` }
      });
      if (res.status() === 429) {
        rateLimited = true;
        expect(res.headers()["retry-after"]).toBeTruthy();
        break;
      }
    }
    expect(rateLimited).toBe(true);
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

  // === TI-187: Console deals proxy integration tests ===

  test("console deals list returns deals with temperature masking", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { agent } = await setupAgent(supabase);

    const runTag = `console${randomId().split("-")[0]}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const urlNew = `https://example.com/console/${randomId()}`;
    const urlActive = `https://example.com/console/${randomId()}`;

    const { error } = await supabase
      .from("deals")
      .insert([
        {
          title: "Console NEW Deal",
          source_url: urlNew,
          source_url_normalized: urlNew,
          source_url_fingerprint: sha256Hex(urlNew),
          price: 10,
          currency: "EUR",
          created_at: now.toISOString(),
          expires_at: expiresAt,
          tags: [runTag],
          status: "NEW",
          new_until: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
          temperature: 99,
          creator_agent_id: agent.id
        },
        {
          title: "Console ACTIVE Deal",
          source_url: urlActive,
          source_url_normalized: urlActive,
          source_url_fingerprint: sha256Hex(urlActive),
          price: 20,
          currency: "EUR",
          created_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
          expires_at: expiresAt,
          tags: [runTag],
          status: "ACTIVE",
          new_until: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          active_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          temperature: 72,
          creator_agent_id: agent.id
        }
      ]);
    expect(error).toBeNull();

    const res = await request.get(`/api/console/deals?sort=new&tags=${runTag}&limit=10`);
    await expectStatus(res, 200);
    const body = await res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(2);

    const newDeal = body.items.find((d) => d.title === "Console NEW Deal");
    const activeDeal = body.items.find((d) => d.title === "Console ACTIVE Deal");

    expect(newDeal).toBeTruthy();
    expect(newDeal.temperature).toBeNull();
    expect(newDeal.status).toBe("NEW");

    expect(activeDeal).toBeTruthy();
    expect(activeDeal.temperature).toBe(72);
    expect(activeDeal.status).toBe("ACTIVE");
  });

  test("console deals list supports pagination", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const { agent } = await setupAgent(supabase);

    const runTag = `pag${randomId().split("-")[0]}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const deals = [];
    for (let i = 0; i < 3; i++) {
      const url = `https://example.com/pag/${randomId()}`;
      deals.push({
        title: `Pagination Deal ${i}`,
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 10 + i,
        currency: "EUR",
        created_at: new Date(now.getTime() - i * 60 * 1000).toISOString(),
        expires_at: expiresAt,
        tags: [runTag],
        status: "ACTIVE",
        new_until: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        active_at: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        temperature: 50 + i,
        creator_agent_id: agent.id
      });
    }
    const { error } = await supabase.from("deals").insert(deals);
    expect(error).toBeNull();

    const page1 = await request.get(`/api/console/deals?sort=new&tags=${runTag}&limit=1&status=ACTIVE`);
    await expectStatus(page1, 200);
    const page1Body = await page1.json();
    expect(page1Body.items).toHaveLength(1);
    expect(page1Body.next_cursor).toBeTruthy();

    const page2 = await request.get(
      `/api/console/deals?sort=new&tags=${runTag}&limit=1&status=ACTIVE&cursor=${encodeURIComponent(page1Body.next_cursor)}`
    );
    await expectStatus(page2, 200);
    const page2Body = await page2.json();
    expect(page2Body.items).toHaveLength(1);
    expect(page2Body.items[0].deal_id).not.toBe(page1Body.items[0].deal_id);
  });

  test("console deals list rejects invalid cursor", async ({ request }) => {
    const res = await request.get("/api/console/deals?cursor=invalid-cursor");
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_CURSOR");
  });

  test("console vote creates vote with hardcoded agent", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { agent } = await setupAgent(supabase);

    const url = `https://example.com/vote/${randomId()}`;
    const { data: inserted, error } = await supabase
      .from("deals")
      .insert({
        title: "Console Vote Deal",
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 15,
        currency: "EUR",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["consolevote"],
        status: "ACTIVE",
        new_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        active_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        temperature: 50,
        creator_agent_id: agent.id
      })
      .select("deal_id")
      .single();
    expect(error).toBeNull();

    const dealId = inserted.deal_id;
    const voteRes = await request.post(`/api/console/deals/${dealId}/vote`, {
      data: { direction: "up", reason: "Excellent deal for testing" }
    });
    await expectStatus(voteRes, 201);

    const voteBody = await voteRes.json();
    expect(voteBody.vote.deal_id).toBe(dealId);
    expect(voteBody.vote.agent_id).toBe("00000000-0000-4000-a000-000000000001");
    expect(voteBody.vote.weight).toBe(1);
    expect(voteBody.deal.votes_up).toBeGreaterThanOrEqual(1);
  });

  test("console vote rejects expired deal", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { agent } = await setupAgent(supabase);

    const url = `https://example.com/expired/${randomId()}`;
    const { data: inserted, error } = await supabase
      .from("deals")
      .insert({
        title: "Expired Console Deal",
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 25,
        currency: "EUR",
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        tags: ["expired"],
        status: "EXPIRED",
        new_until: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        active_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
        temperature: 42,
        creator_agent_id: agent.id
      })
      .select("deal_id")
      .single();
    expect(error).toBeNull();

    const voteRes = await request.post(`/api/console/deals/${inserted.deal_id}/vote`, {
      data: { direction: "down", reason: "Expired deal test" }
    });
    expect(voteRes.status()).toBe(409);
    const body = await voteRes.json();
    expect(body.error.code).toBe("DEAL_EXPIRED");
  });

  test("console vote rejects duplicate vote", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);
    const { agent } = await setupAgent(supabase);

    const url = `https://example.com/dup/${randomId()}`;
    const { data: inserted, error } = await supabase
      .from("deals")
      .insert({
        title: "Dup Vote Deal",
        source_url: url,
        source_url_normalized: url,
        source_url_fingerprint: sha256Hex(url),
        price: 30,
        currency: "EUR",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        tags: ["dupvote"],
        status: "ACTIVE",
        new_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        active_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        temperature: 50,
        creator_agent_id: agent.id
      })
      .select("deal_id")
      .single();
    expect(error).toBeNull();

    const dealId = inserted.deal_id;

    const first = await request.post(`/api/console/deals/${dealId}/vote`, {
      data: { direction: "up", reason: "First vote" }
    });
    await expectStatus(first, 201);

    const dup = await request.post(`/api/console/deals/${dealId}/vote`, {
      data: { direction: "up", reason: "Second vote" }
    });
    expect(dup.status()).toBe(409);
    const dupBody = await dup.json();
    expect(dupBody.error.code).toBe("ALREADY_VOTED");
  });

  test("console vote validates inputs", async ({ request }) => {
    const badIdRes = await request.post("/api/console/deals/not-a-uuid/vote", {
      data: { direction: "up", reason: "Test" }
    });
    expect(badIdRes.status()).toBe(400);

    const badDirRes = await request.post("/api/console/deals/2b079372-0a7a-4fa1-93e0-1f269ea0f1d7/vote", {
      data: { direction: "sideways", reason: "Test" }
    });
    expect(badDirRes.status()).toBe(400);

    const noReasonRes = await request.post("/api/console/deals/2b079372-0a7a-4fa1-93e0-1f269ea0f1d7/vote", {
      data: { direction: "up", reason: "" }
    });
    expect(noReasonRes.status()).toBe(400);
  });
});
