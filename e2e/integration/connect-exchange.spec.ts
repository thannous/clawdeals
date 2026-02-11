import { test, expect, type APIRequestContext } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, randomIp } from "./helpers/ids";
import { createListing, createOwner, expectStatus } from "./helpers/http";
import { createSupabaseAdmin } from "./helpers/supabase";

assertIntegrationEnv();

function extractClaimToken(claimUrl: string): string {
  const url = new URL(String(claimUrl));
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
}

async function createConnectSession(request: APIRequestContext, requestedAgentName: string) {
  const create = await request.post("/api/v1/connect/sessions", {
    headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
    data: { requested_agent_name: requestedAgentName, requested_scopes: [] }
  });
  await expectStatus(create, 201);
  const createBody = await create.json();

  const sessionId = createBody?.data?.session_id;
  const pollToken = createBody?.data?.poll_token;
  const claimToken = extractClaimToken(createBody?.data?.claim_url);

  expect(sessionId).toBeTruthy();
  expect(pollToken).toBeTruthy();
  expect(claimToken).toMatch(/^cd_claim_/);

  return { sessionId, pollToken, claimToken };
}

async function claimConnectSession(request: APIRequestContext, sessionId: string, ownerId: string, claimToken: string, agentName: string) {
  const claim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
    headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
    data: { claim_token: claimToken, mode: "create_agent", agent_name: agentName }
  });
  await expectStatus(claim, 200);
}

test.describe.serial("Integration: Connect Exchange", () => {
  test.setTimeout(60_000);

  test("claim -> exchange -> api_key works + replay is stable", async ({ request }) => {
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const create = await request.post("/api/v1/connect/sessions", {
      headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
      data: { requested_agent_name: "Integration Exchange", requested_scopes: [] }
    });
    await expectStatus(create, 201);
    expect(create.headers()["cache-control"]).toBe("no-store");
    const createBody = await create.json();

    const sessionId = createBody?.data?.session_id;
    const pollToken = createBody?.data?.poll_token;
    const claimToken = extractClaimToken(createBody?.data?.claim_url);

    expect(sessionId).toBeTruthy();
    expect(pollToken).toBeTruthy();
    expect(claimToken).toMatch(/^cd_claim_/);

    const claim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: { claim_token: claimToken, mode: "create_agent", agent_name: "Integration Exchange Agent" }
    });
    await expectStatus(claim, 200);

    const exchangeIdem = randomId();
    const fingerprint = `itest-${randomId()}`;
    const exchange = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": exchangeIdem
      },
      data: {
        requested_key_scope: "agent_write",
        installation: {
          client_type: "openclaw",
          client_version: "itest",
          device_name: "ci",
          fingerprint
        }
      }
    });
    await expectStatus(exchange, 200);
    expect(exchange.headers()["cache-control"]).toBe("no-store");
    const exchangeBody = await exchange.json();

    expect(exchangeBody?.data?.status).toBe("DELIVERED");
    expect(exchangeBody?.data?.agent_id).toBeTruthy();
    expect(exchangeBody?.data?.installation_id).toBeTruthy();
    expect(exchangeBody?.data?.api_key_id).toBeTruthy();
    expect(exchangeBody?.data?.api_key).toMatch(/^cd_(live|sandbox)_.+\..+$/);

    const apiKey = exchangeBody?.data?.api_key;
    const agentId = exchangeBody?.data?.agent_id;
    const installationId = exchangeBody?.data?.installation_id;

    const replay = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": exchangeIdem
      },
      data: {
        requested_key_scope: "agent_write",
        installation: {
          client_type: "openclaw",
          client_version: "itest",
          device_name: "ci",
          fingerprint
        }
      }
    });
    await expectStatus(replay, 200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    const replayBody = await replay.json();
    expect(replayBody?.data?.api_key).toBe(apiKey);

    const me = await request.get("/api/v1/agents/me", {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    await expectStatus(me, 200);
    const meBody = await me.json();
    expect(meBody?.data?.agent_id).toBe(agentId);
    expect(meBody?.data?.installation_id).toBe(installationId);
    expect(meBody?.data?.oauth_scopes).toEqual([]);

    const delivered = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": randomId()
      },
      data: {
        requested_key_scope: "agent_write",
        installation: { client_type: "openclaw", fingerprint: `other-${randomId()}` }
      }
    });
    expect(delivered.status()).toBe(409);
    const deliveredBody = await delivered.json();
    expect(deliveredBody?.error?.code).toBe("SESSION_ALREADY_DELIVERED");

    const listing = await createListing(request, apiKey, { title: `Exchange listing ${randomId()}` });
    await expectStatus(listing, 201);
  });

  test("exchange before claim returns SESSION_NOT_CLAIMED", async ({ request }) => {
    const { sessionId, pollToken } = await createConnectSession(request, "Integration Exchange Before Claim");

    const beforeClaim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": randomId()
      },
      data: {
        requested_key_scope: "agent_write",
        installation: { client_type: "openclaw", fingerprint: `before-claim-${randomId()}` }
      }
    });
    expect(beforeClaim.status()).toBe(409);
    const beforeClaimBody = await beforeClaim.json();
    expect(beforeClaimBody?.error?.code).toBe("SESSION_NOT_CLAIMED");
  });

  test("exchange after forced expiry returns SESSION_EXPIRED", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const { sessionId, pollToken, claimToken } = await createConnectSession(request, "Integration Exchange Expired");
    await claimConnectSession(request, sessionId, ownerId, claimToken, "Integration Exchange Expired Agent");

    const createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { error: expireError } = await supabase
      .from("connect_sessions")
      .update({
        status: "CLAIMED",
        created_at: createdAt,
        updated_at: createdAt,
        expires_at: expiresAt,
        expired_at: null
      })
      .eq("session_id", sessionId);
    expect(expireError).toBeNull();

    const expired = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": randomId()
      },
      data: {
        requested_key_scope: "agent_write",
        installation: { client_type: "openclaw", fingerprint: `expired-${randomId()}` }
      }
    });
    expect(expired.status()).toBe(410);
    const expiredBody = await expired.json();
    expect(expiredBody?.error?.code).toBe("SESSION_EXPIRED");
  });

  test("same idempotency key with different body returns IDEMPOTENCY_KEY_REUSE", async ({ request }) => {
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const { sessionId, pollToken, claimToken } = await createConnectSession(request, "Integration Exchange Idempotency Mismatch");
    await claimConnectSession(request, sessionId, ownerId, claimToken, "Integration Exchange Idempotency Agent");

    const idempotencyKey = randomId();
    const firstExchange = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": idempotencyKey
      },
      data: {
        requested_key_scope: "agent_write",
        installation: {
          client_type: "openclaw",
          client_version: "itest-a",
          device_name: "ci-a",
          fingerprint: `idem-a-${randomId()}`
        }
      }
    });
    await expectStatus(firstExchange, 200);

    const mismatch = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/exchange`, {
      headers: {
        Authorization: `Bearer ${pollToken}`,
        "Idempotency-Key": idempotencyKey
      },
      data: {
        requested_key_scope: "agent_write",
        installation: {
          client_type: "openclaw",
          client_version: "itest-b",
          device_name: "ci-b",
          fingerprint: `idem-b-${randomId()}`
        }
      }
    });
    expect(mismatch.status()).toBe(409);
    const mismatchBody = await mismatch.json();
    expect(mismatchBody?.error?.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });
});
