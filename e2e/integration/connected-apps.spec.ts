import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, randomIp } from "./helpers/ids";
import { createOwner, expectStatus } from "./helpers/http";
import { waitForAuditLog } from "./helpers/audit";
import { createRedis } from "./helpers/sse";
import { createSupabaseAdmin } from "./helpers/supabase";
import { V1_SCOPES_DEFAULT } from "../../src/shared/scopes/v1";

assertIntegrationEnv();

const UUID_RE = /^[0-9a-f-]{36}$/i;

async function ensureOwnerEmailVerified(supabase: any, ownerId: string) {
  const { error } = await supabase
    .from("owners")
    .update({
      email_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("owner_id", ownerId);
  expect(error).toBeNull();
}

function extractClaimToken(claimUrl: string): string {
  const url = new URL(String(claimUrl));
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
}

function extractApiKeyPrefix(apiKey: string): string | null {
  if (!apiKey) return null;
  const match = String(apiKey).match(/^cd_(?:live|sandbox)_([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/);
  return match?.[1] || null;
}

async function createConnectedInstallation(
  request: any,
  ownerId: string,
  options: { requestedAgentName: string; agentName: string; clientVersion?: string } = {
    requestedAgentName: "Integration Connected App",
    agentName: "Integration Connected App Agent"
  }
) {
  const supabase = createSupabaseAdmin();
  await ensureOwnerEmailVerified(supabase, ownerId);

  const create = await request.post("/api/v1/connect/sessions", {
    headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
    data: { requested_agent_name: options.requestedAgentName, requested_scopes: [] }
  });
  await expectStatus(create, 201);
  const createBody = await create.json();

  const sessionId = createBody?.data?.session_id;
  const pollToken = createBody?.data?.poll_token;
  const claimToken = extractClaimToken(createBody?.data?.claim_url);

  expect(createBody?.data?.status).toBe("PENDING_CLAIM");
  expect(createBody?.data?.interval_seconds).toBe(2);
  expect(sessionId).toBeTruthy();
  expect(pollToken).toBeTruthy();
  expect(claimToken).toMatch(/^cd_claim_/);

  const claim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
    headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
    data: { claim_token: claimToken, mode: "create_agent", agent_name: options.agentName }
  });
  await expectStatus(claim, 200);
  const claimBody = await claim.json();
  expect(claimBody?.data?.session_id).toBe(sessionId);
  expect(claimBody?.data?.status).toBe("CLAIMED");
  expect(claimBody?.data?.owner_id).toBe(ownerId);
  expect(String(claimBody?.data?.agent_id || "")).toMatch(UUID_RE);
  expect(String(claimBody?.data?.claimed_at || "")).toBeTruthy();

  const exchange = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
    headers: {
      Authorization: `Bearer ${pollToken}`,
      "Idempotency-Key": randomId()
    },
    data: {
      requested_key_scope: "agent_write",
      installation: {
        client_type: "openclaw",
        client_version: options.clientVersion || "itest",
        device_name: "ci",
        fingerprint: `itest-${randomId()}`
      }
    }
  });
  await expectStatus(exchange, 200);
  const exchangeBody = await exchange.json();

  const installationId = exchangeBody?.data?.installation_id;
  const apiKey = exchangeBody?.data?.api_key;
  const apiKeyId = exchangeBody?.data?.api_key_id;

  expect(exchangeBody?.data?.session_id).toBe(sessionId);
  expect(exchangeBody?.data?.status).toBe("DELIVERED");
  expect(installationId).toBeTruthy();
  expect(String(installationId || "")).toMatch(UUID_RE);
  expect(apiKey).toMatch(/^cd_(live|sandbox)_.+\..+$/);
  expect(String(apiKeyId || "")).toMatch(UUID_RE);

  return {
    sessionId,
    pollToken,
    installationId: String(installationId),
    apiKey: String(apiKey),
    apiKeyId: String(apiKeyId)
  };
}

test.describe.serial("Integration: Connected Apps", () => {
  test.setTimeout(60_000);

  test("list installations + revoke invalidates api keys and emits audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await createOwner(request, ownerId);
    await ensureOwnerEmailVerified(supabase, ownerId);

    const create = await request.post("/api/v1/connect/sessions", {
      headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
      data: { requested_agent_name: "Integration Connected Apps", requested_scopes: [] },
    });
    await expectStatus(create, 201);
    const createBody = await create.json();

    const sessionId = createBody?.data?.session_id;
    const pollToken = createBody?.data?.poll_token;
    const claimToken = extractClaimToken(createBody?.data?.claim_url);

    expect(createBody?.data?.status).toBe("PENDING_CLAIM");
    expect(createBody?.data?.interval_seconds).toBe(2);
    expect(sessionId).toBeTruthy();
    expect(pollToken).toBeTruthy();
    expect(claimToken).toMatch(/^cd_claim_/);

    const claim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: { claim_token: claimToken, mode: "create_agent", agent_name: "Integration Connected Apps Agent" },
    });
    await expectStatus(claim, 200);
    const claimBody = await claim.json();
    expect(claimBody?.data?.session_id).toBe(sessionId);
    expect(claimBody?.data?.status).toBe("CLAIMED");
    expect(claimBody?.data?.owner_id).toBe(ownerId);
    expect(String(claimBody?.data?.agent_id || "")).toMatch(UUID_RE);
    expect(String(claimBody?.data?.claimed_at || "")).toBeTruthy();

    const fingerprint = `itest-${randomId()}`;
    const exchange = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": randomId(),
      },
      data: {
        requested_key_scope: "agent_write",
        installation: {
          client_type: "openclaw",
          client_version: "itest",
          device_name: "ci",
          fingerprint,
        },
      },
    });
    await expectStatus(exchange, 200);
    const exchangeBody = await exchange.json();

    const installationId = exchangeBody?.data?.installation_id;
    const apiKey = exchangeBody?.data?.api_key;
    const apiKeyId = exchangeBody?.data?.api_key_id;

    expect(exchangeBody?.data?.session_id).toBe(sessionId);
    expect(exchangeBody?.data?.status).toBe("DELIVERED");
    expect(installationId).toBeTruthy();
    expect(String(installationId || "")).toMatch(UUID_RE);
    expect(apiKey).toMatch(/^cd_(live|sandbox)_.+\..+$/);
    expect(String(apiKeyId || "")).toMatch(UUID_RE);

    const meBeforeRevoke = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    await expectStatus(meBeforeRevoke, 200);
    const meBeforeRevokeBody = await meBeforeRevoke.json();
    expect(meBeforeRevokeBody?.data?.installation_id).toBe(installationId);
    expect(meBeforeRevokeBody?.data?.oauth_scopes).toEqual([]);

    const auditSince = new Date().toISOString();

    const listRequestId = randomId();
    const list = await request.get("/api/v1/installations", {
      headers: { "x-owner-id": ownerId, "x-request-id": listRequestId },
    });
    await expectStatus(list, 200);
    const listBody = await list.json();
    expect(Array.isArray(listBody.installations)).toBe(true);
    const found = (listBody.installations || []).find((it: any) => it?.installation_id === installationId);
    expect(found).toBeTruthy();
    expect(found.status).toBe("ACTIVE");
    expect(found.oauth_scopes).toEqual(V1_SCOPES_DEFAULT);

    const revokeRequestId = randomId();
    const revoke = await request.post(`/api/v1/installations/${encodeURIComponent(installationId)}:revoke`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId(), "x-request-id": revokeRequestId },
      data: { reason: "integration test" },
    });
    await expectStatus(revoke, 200);
    const revokeBody = await revoke.json();
    expect(revokeBody.installation_id).toBe(installationId);
    expect(revokeBody.status).toBe("REVOKED");
    expect(revokeBody.revoked_at).toBeTruthy();

    const listAfter = await request.get("/api/v1/installations", {
      headers: { "x-owner-id": ownerId },
    });
    await expectStatus(listAfter, 200);
    const listAfterBody = await listAfter.json();
    const foundAfter = (listAfterBody.installations || []).find((it: any) => it?.installation_id === installationId);
    expect(foundAfter).toBeTruthy();
    expect(foundAfter.status).toBe("REVOKED");

    const revokedAuth = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(revokedAuth.status()).toBe(401);
    const revokedAuthBody = await revokedAuth.json();
    expect(revokedAuthBody?.error?.code).toBe("API_KEY_REVOKED");
    expect(revokedAuthBody?.error?.message).toBe("API key revoked");

    const auditList = await waitForAuditLog(supabase, "installation.list_viewed", 10, auditSince, listRequestId);
    expect(auditList).not.toBeNull();
    expect(auditList.outcome).toBe("SUCCESS");
    expect(auditList.action?.entity_type).toBe("owner");
    expect(auditList.action?.entity_id).toBe(ownerId);

    const auditRevoke = await waitForAuditLog(supabase, "installation.revoked", 10, auditSince, revokeRequestId);
    expect(auditRevoke).not.toBeNull();
    expect(auditRevoke.outcome).toBe("SUCCESS");
    expect(auditRevoke.action?.entity_type).toBe("installation");
    expect(auditRevoke.action?.entity_id).toBe(installationId);
  });

  test("rotate returns new credential and previous key stays valid during grace", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const connected = await createConnectedInstallation(request, ownerId, {
      requestedAgentName: "Integration Rotate Grace",
      agentName: "Integration Rotate Grace Agent"
    });

    const warmCacheBeforeRotate = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${connected.apiKey}` }
    });
    await expectStatus(warmCacheBeforeRotate, 200);

    const auditSince = new Date().toISOString();
    const rotateRequestId = randomId();
    const rotate = await request.post(`/api/v1/installations/${encodeURIComponent(connected.installationId)}:rotate`, {
      headers: {
        "x-owner-id": ownerId,
        "Idempotency-Key": randomId(),
        "x-request-id": rotateRequestId
      },
      data: { grace_seconds: 120 }
    });
    await expectStatus(rotate, 200);
    const rotateBody = await rotate.json();

    const rotatedKey = String(rotateBody?.api_key || "");
    expect(rotatedKey).toMatch(/^cd_(live|sandbox)_.+\..+$/);
    expect(rotateBody.installation_id).toBe(connected.installationId);
    expect(rotateBody.grace_seconds).toBe(120);
    const previousApiKeyId = String(rotateBody?.previous_api_key_id || "");
    expect(previousApiKeyId).toMatch(UUID_RE);
    expect(rotateBody.api_key_id).toBeTruthy();
    expect(rotatedKey).not.toBe(connected.apiKey);

    const graceAuth = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${connected.apiKey}` }
    });
    await expectStatus(graceAuth, 200);

    const newKeyAuth = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${rotatedKey}` }
    });
    await expectStatus(newKeyAuth, 200);
    const newKeyBody = await newKeyAuth.json();
    expect(newKeyBody?.data?.installation_id).toBe(connected.installationId);

    const forcedExpiredAt = new Date(Date.now() - 60_000).toISOString();
    const { data: forcedExpiredKey, error: forceExpireError } = await supabase
      .from("api_keys")
      .update({ grace_expires_at: forcedExpiredAt })
      .eq("api_key_id", previousApiKeyId)
      .eq("key_state", "GRACE")
      .select("api_key_id")
      .maybeSingle();
    expect(forceExpireError).toBeNull();
    expect(forcedExpiredKey?.api_key_id).toBe(previousApiKeyId);

    const oldKeyPrefix = extractApiKeyPrefix(connected.apiKey);
    expect(oldKeyPrefix).toBeTruthy();
    await createRedis().del(`auth:api_key_prefix:${oldKeyPrefix}`);

    const oldKeyExpiredAuth = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${connected.apiKey}` }
    });
    expect(oldKeyExpiredAuth.status()).toBe(401);
    const oldKeyExpiredBody = await oldKeyExpiredAuth.json();
    expect(oldKeyExpiredBody?.error?.code).toBe("API_KEY_EXPIRED");
    expect(oldKeyExpiredBody?.error?.message).toBe("API key expired");

    const auditRotate = await waitForAuditLog(supabase, "installation.key_rotated", 10, auditSince, rotateRequestId);
    expect(auditRotate).not.toBeNull();
    expect(auditRotate.outcome).toBe("SUCCESS");
    expect(auditRotate.action?.entity_type).toBe("installation");
    expect(auditRotate.action?.entity_id).toBe(connected.installationId);
  });

  test("rotate with grace_seconds=0 revokes previous key immediately", async ({ request }) => {
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const connected = await createConnectedInstallation(request, ownerId, {
      requestedAgentName: "Integration Rotate Immediate",
      agentName: "Integration Rotate Immediate Agent"
    });

    // Ensure the previous key is cached before rotate so invalidation is exercised.
    const warmCache = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${connected.apiKey}` }
    });
    await expectStatus(warmCache, 200);

    const rotate = await request.post(`/api/v1/installations/${encodeURIComponent(connected.installationId)}:rotate`, {
      headers: {
        "x-owner-id": ownerId,
        "Idempotency-Key": randomId()
      },
      data: { grace_seconds: 0 }
    });
    await expectStatus(rotate, 200);
    const rotateBody = await rotate.json();

    const rotatedKey = String(rotateBody?.api_key || "");
    expect(rotatedKey).toMatch(/^cd_(live|sandbox)_.+\..+$/);
    expect(rotateBody.grace_seconds).toBe(0);
    expect(rotatedKey).not.toBe(connected.apiKey);

    const oldKeyAuth = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${connected.apiKey}` }
    });
    expect(oldKeyAuth.status()).toBe(401);
    const oldKeyBody = await oldKeyAuth.json();
    expect(oldKeyBody?.error?.code).toBe("API_KEY_REVOKED");
    expect(oldKeyBody?.error?.message).toBe("API key revoked");

    const newKeyAuth = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${rotatedKey}` }
    });
    await expectStatus(newKeyAuth, 200);
  });

  test("scope upgrade creates approval then updates installation scopes after approval", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await createOwner(request, ownerId);
    await ensureOwnerEmailVerified(supabase, ownerId);

    const create = await request.post("/api/v1/connect/sessions", {
      headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
      data: { requested_agent_name: "Integration Scope Upgrade", requested_scopes: [] },
    });
    await expectStatus(create, 201);
    const createBody = await create.json();

    const sessionId = createBody?.data?.session_id;
    const pollToken = createBody?.data?.poll_token;
    const claimToken = extractClaimToken(createBody?.data?.claim_url);

    const claim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: { claim_token: claimToken, mode: "create_agent", agent_name: "Integration Scope Upgrade Agent" },
    });
    await expectStatus(claim, 200);

    const exchange = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": randomId(),
      },
      data: {
        requested_key_scope: "agent_write",
        installation: {
          client_type: "openclaw",
          client_version: "itest",
          fingerprint: `itest-${randomId()}`,
        },
      },
    });
    await expectStatus(exchange, 200);
    const exchangeBody = await exchange.json();
    const installationId = String(exchangeBody?.data?.installation_id || "");
    expect(installationId).toMatch(/^[0-9a-f-]{36}$/i);

    const upgrade = await request.post(`/api/v1/installations/${encodeURIComponent(installationId)}:scopes-upgrade`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: { requested_scopes: ["policies:*"] },
    });
    await expectStatus(upgrade, 202);
    const upgradeBody = await upgrade.json();
    expect(upgradeBody.status).toBe("PENDING_APPROVAL");
    const approvalId = String(upgradeBody.approval_id || "");
    expect(approvalId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(upgradeBody.requested_scopes).toEqual(["policies:*"]);
    expect(upgradeBody.current_scopes).toEqual(V1_SCOPES_DEFAULT);

    const approve = await request.post(`/api/v1/approvals/${encodeURIComponent(approvalId)}:approve`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {},
    });
    await expectStatus(approve, 200);

    const listAfter = await request.get("/api/v1/owner/installations", {
      headers: { "x-owner-id": ownerId },
    });
    await expectStatus(listAfter, 200);
    const listAfterBody = await listAfter.json();
    const foundAfter = (listAfterBody.installations || []).find((it: any) => it?.installation_id === installationId);
    expect(foundAfter).toBeTruthy();
    expect(foundAfter.oauth_scopes).toEqual(expect.arrayContaining([...V1_SCOPES_DEFAULT, "policies:*"]));
  });
});
