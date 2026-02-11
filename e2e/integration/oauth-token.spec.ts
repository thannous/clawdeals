import { test, expect } from "@playwright/test";
import crypto from "node:crypto";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, randomIp } from "./helpers/ids";
import { createOwner, expectStatus } from "./helpers/http";
import { createRedis } from "./helpers/sse";
import { createSupabaseAdmin } from "./helpers/supabase";
import { V1_SCOPES_DEFAULT } from "../../src/shared/scopes/v1";

assertIntegrationEnv();

const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
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

function requireOauthTokenSecretForTests() {
  const secret =
    process.env.OAUTH_TOKEN_SECRET ||
    process.env.OAUTH_DEVICE_SECRET ||
    process.env.CONNECT_SESSION_SECRET ||
    process.env.CONNECT_SESSIONS_SECRET ||
    process.env.PAIR_TOKEN_SECRET ||
    process.env.PAIRING_CODE_SECRET;

  if (!secret) {
    throw new Error("Missing OAuth token secret for integration tests");
  }

  return secret;
}

async function authorizeAndApproveDeviceFlow({
  request,
  ip
}: {
  request: any;
  ip: string;
}): Promise<{ deviceCode: string; userCode: string; ownerId: string; agentId: string }> {
  const ownerId = randomId();
  await createOwner(request, ownerId);
  await ensureOwnerEmailVerified(createSupabaseAdmin(), ownerId);

  const authorize = await request.post("/api/oauth/device/authorize", {
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomId(),
      "x-forwarded-for": ip
    },
    data: {
      client_id: "openclaw",
      scope: "agent:read agent:write",
      requested_agent_name: "Integration OAuth"
    }
  });
  await expectStatus(authorize, 200);
  expect(authorize.headers()["cache-control"]).toBe("no-store");
  const authorizeBody = await authorize.json();

  const deviceCode = String(authorizeBody?.device_code || "");
  const userCode = String(authorizeBody?.user_code || "");
  expect(deviceCode).toMatch(/^cd_dev_/);
  expect(userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  expect(String(authorizeBody?.verification_uri || "")).toContain("/device");
  expect(String(authorizeBody?.verification_uri_complete || "")).toContain("user_code=");
  expect(String(authorizeBody?.verification_uri_complete || "")).toContain(encodeURIComponent(userCode));
  expect(authorizeBody?.expires_in).toBe(600);
  expect(authorizeBody?.interval).toBe(2);

  const approve = await request.post("/api/oauth/device/approve", {
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": randomId(),
      "x-forwarded-for": ip,
      "x-owner-id": ownerId
    },
    data: {
      user_code: userCode,
      mode: "create_agent",
      agent_name: `Integration OAuth ${randomId()}`
    }
  });
  await expectStatus(approve, 200);
  expect(approve.headers()["cache-control"]).toBe("no-store");
  const approveBody = await approve.json();
  expect(String(approveBody?.data?.authorization_id || "")).toMatch(UUID_RE);
  expect(approveBody?.data?.status).toBe("AUTHORIZED");
  expect(approveBody?.data?.owner_id).toBe(ownerId);
  const agentId = String(approveBody?.data?.agent_id || "");
  expect(agentId).toMatch(UUID_RE);
  expect(String(approveBody?.data?.authorized_at || "")).toBeTruthy();

  return { deviceCode, userCode, ownerId, agentId };
}

test.describe.serial("Integration: OAuth Token", () => {
  test.setTimeout(60_000);

  test("device flow -> token -> API call -> revoke -> refresh fails", async ({ request }) => {
    const ip = randomIp();
    const { deviceCode, agentId } = await authorizeAndApproveDeviceFlow({ request, ip });

    // Warm-up compilation for a protected API route so token TTL tests aren't affected by first-hit latency.
    await request.get("/api/v1/watchlists", { headers: { "x-forwarded-for": ip } });

    const tokenForm = new URLSearchParams({
      grant_type: DEVICE_CODE_GRANT_TYPE,
      device_code: deviceCode,
      client_id: "openclaw"
    }).toString();

    const token = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: tokenForm
    });
    await expectStatus(token, 200);
    expect(token.headers()["cache-control"]).toBe("no-store");
    const tokenBody = await token.json();

    const accessToken = String(tokenBody?.access_token || "");
    const refreshToken = String(tokenBody?.refresh_token || "");
    expect(accessToken).toMatch(/^cd_at_/);
    expect(refreshToken).toMatch(/^cd_rt_/);
    expect(tokenBody?.token_type).toBe("Bearer");
    expect(Number(tokenBody?.expires_in || 0)).toBeGreaterThan(0);

    const me = await request.get("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-forwarded-for": ip
      }
    });
    await expectStatus(me, 200);
    const meBody = await me.json();
    expect(meBody?.data?.agent_id).toBe(agentId);
    expect(String(meBody?.data?.installation_id || "")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(meBody?.data?.oauth_scopes).toEqual(V1_SCOPES_DEFAULT);

    const apiCall = await request.get("/api/v1/watchlists", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-forwarded-for": ip
      }
    });
    await expectStatus(apiCall, 200);

    const revokeForm = new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: "openclaw"
    }).toString();

    const revoke = await request.post("/api/oauth/revoke", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: revokeForm
    });
    await expectStatus(revoke, 200);

    const refreshFailForm = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: "openclaw"
    }).toString();

    const refreshFail = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: refreshFailForm
    });
    expect(refreshFail.status()).toBe(400);
    const refreshFailBody = await refreshFail.json();
    expect(refreshFailBody?.error?.code).toBe("invalid_grant");
  });

  test("revoking an access token invalidates it immediately", async ({ request }) => {
    const ip = randomIp();
    const { deviceCode, agentId } = await authorizeAndApproveDeviceFlow({ request, ip });

    await request.get("/api/v1/watchlists", { headers: { "x-forwarded-for": ip } });

    const token = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: deviceCode,
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(token, 200);
    const tokenBody = await token.json();

    const accessToken = String(tokenBody?.access_token || "");
    const refreshToken = String(tokenBody?.refresh_token || "");
    expect(accessToken).toMatch(/^cd_at_/);
    expect(refreshToken).toMatch(/^cd_rt_/);

    const meBefore = await request.get("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-forwarded-for": ip
      }
    });
    await expectStatus(meBefore, 200);
    const meBeforeBody = await meBefore.json();
    expect(meBeforeBody?.data?.agent_id).toBe(agentId);

    const revoke = await request.post("/api/oauth/revoke", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        token: accessToken,
        token_type_hint: "access_token",
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(revoke, 200);

    const meAfter = await request.get("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-forwarded-for": ip
      }
    });
    expect(meAfter.status()).toBe(401);
    const meAfterBody = await meAfter.json();
    expect(meAfterBody?.error?.code).toBe("UNAUTHORIZED");
    expect(meAfterBody?.error?.message).toBe("Invalid access token");

    const refreshed = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(refreshed, 200);
  });

  test("device flow polling too quickly returns slow_down", async ({ request }) => {
    const ip = randomIp();

    const authorize = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: {
        client_id: "openclaw",
        scope: "agent:read",
        requested_agent_name: "Integration OAuth Polling"
      }
    });
    await expectStatus(authorize, 200);
    const authorizeBody = await authorize.json();
    const deviceCode = String(authorizeBody?.device_code || "");
    expect(deviceCode).toMatch(/^cd_dev_/);

    const tokenForm = new URLSearchParams({
      grant_type: DEVICE_CODE_GRANT_TYPE,
      device_code: deviceCode,
      client_id: "openclaw"
    }).toString();

    const firstPoll = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: tokenForm
    });
    expect(firstPoll.status()).toBe(400);
    const firstBody = await firstPoll.json();
    expect(firstBody?.error?.code).toBe("authorization_pending");

    const secondPoll = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: tokenForm
    });
    expect(secondPoll.status()).toBe(400);
    expect(secondPoll.headers()["cache-control"]).toBe("no-store");
    expect(secondPoll.headers()["retry-after"]).toBeTruthy();
    const secondBody = await secondPoll.json();
    expect(secondBody?.error?.code).toBe("slow_down");
  });

  test("installation revoke invalidates OAuth refresh and access tokens", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ip = randomIp();
    const { deviceCode, ownerId, agentId } = await authorizeAndApproveDeviceFlow({ request, ip });

    // Warm-up compilation for a protected API route.
    await request.get("/api/v1/watchlists", { headers: { "x-forwarded-for": ip } });

    const token = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: deviceCode,
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(token, 200);
    expect(token.headers()["cache-control"]).toBe("no-store");
    const tokenBody = await token.json();

    const accessToken = String(tokenBody?.access_token || "");
    const refreshToken = String(tokenBody?.refresh_token || "");
    expect(accessToken).toMatch(/^cd_at_/);
    expect(refreshToken).toMatch(/^cd_rt_/);

    const meBefore = await request.get("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-forwarded-for": ip
      }
    });
    await expectStatus(meBefore, 200);
    const meBeforeBody = await meBefore.json();
    expect(meBeforeBody?.data?.agent_id).toBe(agentId);
    const installationFromToken = String(meBeforeBody?.data?.installation_id || "");
    expect(installationFromToken).toMatch(/^[0-9a-f-]{36}$/i);

    const secret = requireOauthTokenSecretForTests();
    const refreshTokenHash = crypto.createHmac("sha256", secret).update(refreshToken).digest("hex");

    const { data: refreshRow, error: refreshError } = await supabase
      .from("oauth_refresh_tokens")
      .select("installation_id")
      .eq("token_hash", refreshTokenHash)
      .maybeSingle();
    expect(refreshError).toBeNull();
    const installationId = String(refreshRow?.installation_id || "");
    expect(installationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(installationId).toBe(installationFromToken);

    const revoke = await request.post(`/api/v1/installations/${encodeURIComponent(installationId)}:revoke`, {
      headers: {
        "x-owner-id": ownerId,
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: { reason: "integration test (oauth revoke)" }
    });
    await expectStatus(revoke, 200);

    const refreshFail = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: "openclaw"
      }).toString()
    });
    expect(refreshFail.status()).toBe(400);
    const refreshFailBody = await refreshFail.json();
    expect(refreshFailBody?.error?.code).toBe("invalid_grant");

    const meAfter = await request.get("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-forwarded-for": ip
      }
    });
    expect(meAfter.status()).toBe(401);
    const meAfterBody = await meAfter.json();
    expect(meAfterBody?.error?.code).toBe("UNAUTHORIZED");
    expect(meAfterBody?.error?.message).toBe("Invalid access token");
  });

  test("rotation: old refresh token rejected", async ({ request }) => {
    const ip = randomIp();
    const { deviceCode } = await authorizeAndApproveDeviceFlow({ request, ip });

    const token = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: deviceCode,
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(token, 200);
    const tokenBody = await token.json();
    const refresh1 = String(tokenBody?.refresh_token || "");
    expect(refresh1).toMatch(/^cd_rt_/);

    const refreshResp = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh1,
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(refreshResp, 200);
    expect(refreshResp.headers()["cache-control"]).toBe("no-store");
    const refreshBody = await refreshResp.json();
    const refresh2 = String(refreshBody?.refresh_token || "");
    expect(refresh2).toMatch(/^cd_rt_/);
    expect(refresh2).not.toBe(refresh1);

    const oldRejected = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh1,
        client_id: "openclaw"
      }).toString()
    });
    expect(oldRejected.status()).toBe(400);
    const oldRejectedBody = await oldRejected.json();
    expect(oldRejectedBody?.error?.code).toBe("invalid_grant");

    const refreshedAgain = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refresh2,
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(refreshedAgain, 200);
    expect(refreshedAgain.headers()["cache-control"]).toBe("no-store");
  });

  test("device_code is single-use and cannot be exchanged twice", async ({ request }) => {
    const ip = randomIp();
    const { deviceCode } = await authorizeAndApproveDeviceFlow({ request, ip });

    const firstExchange = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: deviceCode,
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(firstExchange, 200);

    const secondExchange = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: deviceCode,
        client_id: "openclaw"
      }).toString()
    });
    expect(secondExchange.status()).toBe(400);
    const secondBody = await secondExchange.json();
    expect(secondBody?.error?.code).toBe("invalid_grant");
  });

  test("access token TTL: expired access token surfaces TOKEN_EXPIRED", async ({ request }) => {
    const ip = randomIp();
    const { deviceCode } = await authorizeAndApproveDeviceFlow({ request, ip });

    // Warm-up compilation for a protected API route.
    await request.get("/api/v1/watchlists", { headers: { "x-forwarded-for": ip } });

    const token = await request.post("/api/oauth/token", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: deviceCode,
        client_id: "openclaw"
      }).toString()
    });
    await expectStatus(token, 200);
    expect(token.headers()["cache-control"]).toBe("no-store");
    const tokenBody = await token.json();
    const accessToken = String(tokenBody?.access_token || "");
    expect(accessToken).toMatch(/^cd_at_/);

    // Force a past expires_at while keeping the token record present, so auth reports TOKEN_EXPIRED.
    const secret = requireOauthTokenSecretForTests();
    const accessTokenHash = crypto.createHmac("sha256", secret).update(accessToken).digest("hex");
    const redisKey = `auth:oauth:access:v1:${accessTokenHash}`;
    const redis = createRedis();
    const tokenRecordRaw = await redis.get(redisKey);
    expect(tokenRecordRaw).toBeTruthy();
    const tokenRecord = typeof tokenRecordRaw === "string" ? JSON.parse(tokenRecordRaw) : tokenRecordRaw;
    expect(tokenRecord?.v).toBe(1);
    await redis.set(
      redisKey,
      JSON.stringify({
        ...tokenRecord,
        expires_at: new Date(Date.now() - 60_000).toISOString()
      }),
      { ex: 60 }
    );

    const expired = await request.get("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-forwarded-for": ip
      }
    });
    expect(expired.status()).toBe(401);
    const expiredBody = await expired.json();
    expect(expiredBody?.error?.code).toBe("TOKEN_EXPIRED");
    expect(expiredBody?.error?.message).toBe("Access token expired");
  });
});
