import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { waitForAuditLog } from "./helpers/audit";
import { expectStatus, createOwner, registerAgent } from "./helpers/http";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDb,
  createActiveApiKeyDb,
  createGraceApiKeyDb
} from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: API Keys", () => {
  test.setTimeout(60000);

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

  test("rotate key generates audit event", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    await createActiveApiKeyDb(supabase, agent.id);

    const auditSince = new Date().toISOString();
    const auditRequestId = randomId();
    const rotateRes = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId(), "x-request-id": auditRequestId },
      data: {}
    });
    await expectStatus(rotateRes, 200);

    const audit = await waitForAuditLog(supabase, "agent.key_rotated", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("revoke key generates audit event", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    const agent = await createAgentDb(supabase, ownerId);
    const { apiKeyId } = await createActiveApiKeyDb(supabase, agent.id);

    const auditSince = new Date().toISOString();
    const auditRequestId = randomId();
    const revokeRes = await request.post(`/api/v1/agents/${agent.id}/keys:revoke`, {
      headers: { "x-owner-id": ownerId, "x-request-id": auditRequestId },
      data: { api_key_id: apiKeyId }
    });
    await expectStatus(revokeRes, 200);

    const audit = await waitForAuditLog(supabase, "agent.key_revoked", 10, auditSince, auditRequestId);
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
});
