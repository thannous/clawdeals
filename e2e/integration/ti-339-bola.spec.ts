import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, randomIp } from "./helpers/ids";
import { createListing, createOwner, expectStatus } from "./helpers/http";
import {
  createSupabaseAdmin,
  ensureOwnerDb,
  createAgentDb,
  createAgentDbWithOverrides,
  createActiveApiKeyDb,
  setupAgent
} from "./helpers/supabase";

assertIntegrationEnv();

const UUID_RE = /^[0-9a-f-]{36}$/i;
const MISSING_UUID = "00000000-0000-4000-a000-000000000099";

function extractClaimToken(claimUrl: string): string {
  const url = new URL(String(claimUrl));
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
}

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

async function createConnectedInstallation(request: any, ownerId: string) {
  const createRes = await request.post("/api/v1/connect/sessions", {
    headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
    data: { requested_agent_name: `BOLA install ${randomId()}`, requested_scopes: [] }
  });
  await expectStatus(createRes, 201);
  const createBody = await createRes.json();

  const sessionId = String(createBody?.data?.session_id || "");
  const pollToken = String(createBody?.data?.poll_token || "");
  const claimToken = extractClaimToken(createBody?.data?.claim_url);

  expect(sessionId).toMatch(UUID_RE);
  expect(pollToken).toBeTruthy();
  expect(claimToken).toMatch(/^cd_claim_/);

  const claimRes = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
    headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
    data: {
      claim_token: claimToken,
      mode: "create_agent",
      agent_name: `BOLA install agent ${randomId()}`
    }
  });
  await expectStatus(claimRes, 200);

  const exchangeRes = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
    headers: { Authorization: `Bearer ${pollToken}`, "Idempotency-Key": randomId() },
    data: {
      requested_key_scope: "agent_write",
      installation: {
        client_type: "openclaw",
        client_version: "itest-ti-339",
        fingerprint: `ti-339-${randomId()}`
      }
    }
  });
  await expectStatus(exchangeRes, 200);
  const exchangeBody = await exchangeRes.json();

  const installationId = String(exchangeBody?.data?.installation_id || "");
  const apiKey = String(exchangeBody?.data?.api_key || "");

  expect(installationId).toMatch(UUID_RE);
  expect(apiKey).toMatch(/^cd_(live|sandbox)_.+\..+$/);

  return { installationId, apiKey };
}

async function createMarketplaceThreadFixture(request: any) {
  const supabase = createSupabaseAdmin();

  const sellerOwnerId = randomId();
  await ensureOwnerDb(supabase, sellerOwnerId);

  const agedCreatedAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const sellerAgent = await createAgentDbWithOverrides(supabase, sellerOwnerId, { createdAt: agedCreatedAt });
  const { apiKey: sellerApiKey } = await createActiveApiKeyDb(supabase, sellerAgent.id);

  const buyer = await setupAgent(supabase);
  const outsider = await setupAgent(supabase);

  const policyRes = await request.put("/api/v1/policies", {
    headers: { "x-owner-id": sellerOwnerId },
    data: {
      budgets: { max_offer: 400, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 400, contact_reveal: "always" },
      auto_approve: { message_types: ["question"], actions: ["listing.create", "thread.create"] },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    }
  });
  await expectStatus(policyRes, 200);

  const listingRes = await createListing(request, sellerApiKey, {
    title: `BOLA thread listing ${randomId()}`,
    publish: true
  });
  await expectStatus(listingRes, 201);
  const listingId = String((await listingRes.json())?.listing_id || "");
  expect(listingId).toMatch(UUID_RE);

  const threadRes = await request.post(`/api/v1/listings/${encodeURIComponent(listingId)}/threads`, {
    headers: { Authorization: `Bearer ${buyer.apiKey}`, "Idempotency-Key": randomId() },
    data: { intent: "BUY", message: { type: "question", text: `Thread hello ${randomId()}` } }
  });
  await expectStatus(threadRes, 201);
  const threadId = String((await threadRes.json())?.thread_id || "");
  expect(threadId).toMatch(UUID_RE);

  return {
    threadId,
    buyerApiKey: buyer.apiKey,
    outsiderApiKey: outsider.apiKey
  };
}

test.describe.serial("Integration: BOLA object-level authorization (TI-339)", () => {
  test.setTimeout(90000);

  test("threads anti-enumeration returns same 404 for unauthorized and missing thread", async ({ request }) => {
    const fixture = await createMarketplaceThreadFixture(request);

    const memberSend = await request.post(`/api/v1/threads/${fixture.threadId}/messages`, {
      headers: { Authorization: `Bearer ${fixture.buyerApiKey}`, "Idempotency-Key": randomId() },
      data: { type: "question", text: `Member message ${randomId()}` }
    });
    await expectStatus(memberSend, 201);

    const unauthorizedMessage = await request.post(`/api/v1/threads/${fixture.threadId}/messages`, {
      headers: { Authorization: `Bearer ${fixture.outsiderApiKey}`, "Idempotency-Key": randomId() },
      data: { type: "question", text: "Should be hidden" }
    });
    await expectStatus(unauthorizedMessage, 404);
    const unauthorizedMessageBody = await unauthorizedMessage.json();

    const missingMessage = await request.post(`/api/v1/threads/${MISSING_UUID}/messages`, {
      headers: { Authorization: `Bearer ${fixture.outsiderApiKey}`, "Idempotency-Key": randomId() },
      data: { type: "question", text: "Missing thread" }
    });
    await expectStatus(missingMessage, 404);
    const missingMessageBody = await missingMessage.json();

    expect(unauthorizedMessageBody?.error?.code).toBe("NOT_FOUND");
    expect(unauthorizedMessageBody?.error?.message).toBe("Thread not found");
    expect(missingMessageBody?.error?.code).toBe(unauthorizedMessageBody?.error?.code);
    expect(missingMessageBody?.error?.message).toBe(unauthorizedMessageBody?.error?.message);

    const unauthorizedWatch = await request.post(`/api/v1/threads/${fixture.threadId}:watch`, {
      headers: { Authorization: `Bearer ${fixture.outsiderApiKey}` },
      data: { cursor: "0-0", timeout_ms: 10, limit: 1 }
    });
    await expectStatus(unauthorizedWatch, 404);
    const unauthorizedWatchBody = await unauthorizedWatch.json();

    const missingWatch = await request.post(`/api/v1/threads/${MISSING_UUID}:watch`, {
      headers: { Authorization: `Bearer ${fixture.outsiderApiKey}` },
      data: { cursor: "0-0", timeout_ms: 10, limit: 1 }
    });
    await expectStatus(missingWatch, 404);
    const missingWatchBody = await missingWatch.json();

    expect(unauthorizedWatchBody?.error?.code).toBe("NOT_FOUND");
    expect(unauthorizedWatchBody?.error?.message).toBe("Thread not found");
    expect(missingWatchBody?.error?.code).toBe(unauthorizedWatchBody?.error?.code);
    expect(missingWatchBody?.error?.message).toBe(unauthorizedWatchBody?.error?.message);
  });

  test("installations anti-enumeration hides foreign owner resources and actions", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    const otherOwnerId = randomId();

    await createOwner(request, ownerId);
    await createOwner(request, otherOwnerId);
    await ensureOwnerEmailVerified(supabase, ownerId);

    const connected = await createConnectedInstallation(request, ownerId);

    const ownerList = await request.get("/api/v1/installations", {
      headers: { "x-owner-id": ownerId }
    });
    await expectStatus(ownerList, 200);
    const ownerListBody = await ownerList.json();
    expect((ownerListBody?.installations || []).some((row: any) => row?.installation_id === connected.installationId)).toBe(
      true
    );

    const otherOwnerList = await request.get("/api/v1/installations", {
      headers: { "x-owner-id": otherOwnerId }
    });
    await expectStatus(otherOwnerList, 200);
    const otherOwnerListBody = await otherOwnerList.json();
    expect(
      (otherOwnerListBody?.installations || []).some((row: any) => row?.installation_id === connected.installationId)
    ).toBe(false);

    const foreignRevoke = await request.post(`/api/v1/installations/${encodeURIComponent(connected.installationId)}:revoke`, {
      headers: { "x-owner-id": otherOwnerId, "Idempotency-Key": randomId() },
      data: { reason: "not your installation" }
    });
    await expectStatus(foreignRevoke, 404);
    const foreignRevokeBody = await foreignRevoke.json();

    const missingRevoke = await request.post(`/api/v1/installations/${MISSING_UUID}:revoke`, {
      headers: { "x-owner-id": otherOwnerId, "Idempotency-Key": randomId() },
      data: { reason: "missing installation" }
    });
    await expectStatus(missingRevoke, 404);
    const missingRevokeBody = await missingRevoke.json();

    expect(foreignRevokeBody?.error?.code).toBe("NOT_FOUND");
    expect(foreignRevokeBody?.error?.message).toBe("Installation not found");
    expect(missingRevokeBody?.error?.code).toBe(foreignRevokeBody?.error?.code);
    expect(missingRevokeBody?.error?.message).toBe(foreignRevokeBody?.error?.message);

    const foreignRotate = await request.post(`/api/v1/installations/${encodeURIComponent(connected.installationId)}:rotate`, {
      headers: { "x-owner-id": otherOwnerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(foreignRotate, 404);
    const foreignRotateBody = await foreignRotate.json();

    const missingRotate = await request.post(`/api/v1/installations/${MISSING_UUID}:rotate`, {
      headers: { "x-owner-id": otherOwnerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(missingRotate, 404);
    const missingRotateBody = await missingRotate.json();

    expect(foreignRotateBody?.error?.code).toBe("NOT_FOUND");
    expect(foreignRotateBody?.error?.message).toBe("Installation not found");
    expect(missingRotateBody?.error?.code).toBe(foreignRotateBody?.error?.code);
    expect(missingRotateBody?.error?.message).toBe(foreignRotateBody?.error?.message);

    const meRes = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${connected.apiKey}` }
    });
    await expectStatus(meRes, 200);
    const meBody = await meRes.json();
    expect(meBody?.data?.installation_id).toBe(connected.installationId);
  });

  test("agent key actions enforce owner boundaries and reject agent-auth actor", async ({ request }) => {
    const supabase = createSupabaseAdmin();

    const ownerId = randomId();
    const otherOwnerId = randomId();
    await ensureOwnerDb(supabase, ownerId);
    await ensureOwnerDb(supabase, otherOwnerId);

    const agent = await createAgentDb(supabase, ownerId);
    const { apiKey: agentApiKey } = await createActiveApiKeyDb(supabase, agent.id);

    const forbiddenRotate = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { "x-owner-id": otherOwnerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(forbiddenRotate, 403);
    const forbiddenRotateBody = await forbiddenRotate.json();
    expect(forbiddenRotateBody?.error?.code).toBe("FORBIDDEN");

    const agentRotate = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { Authorization: `Bearer ${agentApiKey}`, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(agentRotate, 401);
    const agentRotateBody = await agentRotate.json();
    expect(agentRotateBody?.error?.code).toBe("UNAUTHORIZED");

    const ownerRotate = await request.post(`/api/v1/agents/${agent.id}/keys:rotate`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: {}
    });
    await expectStatus(ownerRotate, 200);
    const ownerRotateBody = await ownerRotate.json();

    const rotatedApiKeyId = String(ownerRotateBody?.data?.api_key_id || "");
    const rotatedApiKey = String(ownerRotateBody?.data?.api_key || "");

    expect(rotatedApiKeyId).toMatch(UUID_RE);
    expect(rotatedApiKey).toMatch(/^cd_(live|sandbox)_.+\..+$/);

    const forbiddenRevoke = await request.post(`/api/v1/agents/${agent.id}/keys:revoke`, {
      headers: { "x-owner-id": otherOwnerId, "Idempotency-Key": randomId() },
      data: { api_key_id: rotatedApiKeyId }
    });
    await expectStatus(forbiddenRevoke, 403);
    const forbiddenRevokeBody = await forbiddenRevoke.json();
    expect(forbiddenRevokeBody?.error?.code).toBe("FORBIDDEN");

    const agentRevoke = await request.post(`/api/v1/agents/${agent.id}/keys:revoke`, {
      headers: { Authorization: `Bearer ${rotatedApiKey}`, "Idempotency-Key": randomId() },
      data: { api_key_id: rotatedApiKeyId }
    });
    await expectStatus(agentRevoke, 401);
    const agentRevokeBody = await agentRevoke.json();
    expect(agentRevokeBody?.error?.code).toBe("UNAUTHORIZED");

    const ownerRevoke = await request.post(`/api/v1/agents/${agent.id}/keys:revoke`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: { api_key_id: rotatedApiKeyId }
    });
    await expectStatus(ownerRevoke, 200);
    const ownerRevokeBody = await ownerRevoke.json();
    expect(ownerRevokeBody?.data?.api_key_id).toBe(rotatedApiKeyId);

    const revokedAuth = await request.get("/api/v1/policies", {
      headers: { Authorization: `Bearer ${rotatedApiKey}` }
    });
    expect(revokedAuth.status()).toBe(401);
  });
});
