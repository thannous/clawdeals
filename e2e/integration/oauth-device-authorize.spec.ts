import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, randomIp } from "./helpers/ids";
import { createOwner, expectStatus } from "./helpers/http";
import {
  createSupabaseAdmin,
  ensureOpsConsoleAgent,
  OPS_CONSOLE_AGENT_ID,
  OPS_CONSOLE_OWNER_ID
} from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: OAuth Device Authorize", () => {
  test.setTimeout(60_000);

  test("POST /api/oauth/device/authorize returns RFC payload and /requests returns view", async ({ request }) => {
    const ip = randomIp();
    const idem = randomId();

    const form = new URLSearchParams({
      client_id: "openclaw",
      scope: "agent:read agent:write",
      requested_agent_name: "Integration OpenClaw"
    }).toString();

    const authorize = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idem,
        "x-forwarded-for": ip
      },
      data: form
    });
    await expectStatus(authorize, 200);
    const body = await authorize.json();

    const deviceCode = String(body?.device_code || "");
    const userCode = String(body?.user_code || "");
    expect(deviceCode).toMatch(/^cd_dev_/);
    expect(userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(body?.verification_uri).toMatch(/^https?:\/\//);
    expect(String(body?.verification_uri)).toMatch(/\/device$/);
    expect(String(body?.verification_uri_complete)).toContain(`user_code=${encodeURIComponent(userCode)}`);
    expect(body?.expires_in).toBe(600);
    expect(body?.interval).toBe(2);

    const view = await request.get(`/api/oauth/device/requests?user_code=${encodeURIComponent(userCode)}`, {
      headers: { "x-forwarded-for": ip }
    });
    await expectStatus(view, 200);
    const viewBody = await view.json();

    expect(viewBody?.data?.authorization_id).toBeTruthy();
    expect(viewBody?.data?.status).toBe("PENDING");
    expect(viewBody?.data?.client_id).toBe("openclaw");
    expect(viewBody?.data?.requested_scopes).toEqual(["agent:read", "agent:write"]);
    expect(viewBody?.data?.requested_agent_name).toBe("Integration OpenClaw");
  });

  test("idempotency: authorize replays same codes and rejects key reuse", async ({ request }) => {
    const ip = randomIp();
    const idem = randomId();

    const form = new URLSearchParams({
      client_id: "openclaw",
      scope: "agent:read",
      requested_agent_name: "Integration Idempotency"
    }).toString();

    const first = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idem,
        "x-forwarded-for": ip
      },
      data: form
    });
    await expectStatus(first, 200);
    const firstBody = await first.json();

    const replay = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idem,
        "x-forwarded-for": ip
      },
      data: form
    });
    await expectStatus(replay, 200);
    expect(replay.headers()["idempotency-replayed"]).toBe("true");
    const replayBody = await replay.json();
    expect(replayBody?.device_code).toBe(firstBody?.device_code);
    expect(replayBody?.user_code).toBe(firstBody?.user_code);

    const misuse = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idem,
        "x-forwarded-for": ip
      },
      data: new URLSearchParams({
        client_id: "openclaw",
        scope: "agent:write",
        requested_agent_name: "Integration Idempotency"
      }).toString()
    });
    expect(misuse.status()).toBe(409);
    const misuseBody = await misuse.json();
    expect(misuseBody?.error?.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  test("approve (create_agent) updates request status to AUTHORIZED", async ({ request }) => {
    const ip = randomIp();
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const authorize = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: {
        client_id: "openclaw",
        scope: "agent:read",
        requested_agent_name: "Integration Approve"
      }
    });
    await expectStatus(authorize, 200);
    const authorizeBody = await authorize.json();
    const userCode = String(authorizeBody?.user_code || "");
    expect(userCode).toBeTruthy();

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
        agent_name: `Integration Approved ${randomId()}`
      }
    });
    await expectStatus(approve, 200);
    const approveBody = await approve.json();

    expect(approveBody?.data?.authorization_id).toBeTruthy();
    expect(approveBody?.data?.status).toBe("AUTHORIZED");
    expect(approveBody?.data?.owner_id).toBe(ownerId);
    expect(String(approveBody?.data?.agent_id || "")).toMatch(/^[0-9a-f-]{36}$/i);
    expect(approveBody?.data?.authorized_at).toBeTruthy();

    const view = await request.get(`/api/oauth/device/requests?user_code=${encodeURIComponent(userCode)}`, {
      headers: { "x-forwarded-for": ip }
    });
    await expectStatus(view, 200);
    const viewBody = await view.json();
    expect(viewBody?.data?.status).toBe("AUTHORIZED");
    expect(viewBody?.data?.owner_id).toBe(ownerId);
    expect(viewBody?.data?.agent_id).toBe(approveBody?.data?.agent_id);
  });

  test("deny updates request status to DENIED", async ({ request }) => {
    const ip = randomIp();
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const authorize = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: {
        client_id: "openclaw",
        scope: "agent:read",
        requested_agent_name: "Integration Deny"
      }
    });
    await expectStatus(authorize, 200);
    const authorizeBody = await authorize.json();
    const userCode = String(authorizeBody?.user_code || "");
    expect(userCode).toBeTruthy();

    const deny = await request.post("/api/oauth/device/deny", {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip,
        "x-owner-id": ownerId
      },
      data: { user_code: userCode }
    });
    await expectStatus(deny, 200);
    const denyBody = await deny.json();
    expect(denyBody?.data?.status).toBe("DENIED");
    expect(denyBody?.data?.denied_at).toBeTruthy();

    const view = await request.get(`/api/oauth/device/requests?user_code=${encodeURIComponent(userCode)}`, {
      headers: { "x-forwarded-for": ip }
    });
    await expectStatus(view, 200);
    const viewBody = await view.json();
    expect(viewBody?.data?.status).toBe("DENIED");
    expect(viewBody?.data?.denied_at).toBeTruthy();
  });

  test("requests marks pending request EXPIRED when expires_at is in the past", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ip = randomIp();
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const authorize = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: {
        client_id: "openclaw",
        scope: "agent:read",
        requested_agent_name: "Integration Expire"
      }
    });
    await expectStatus(authorize, 200);
    const authorizeBody = await authorize.json();
    const userCode = String(authorizeBody?.user_code || "");
    expect(userCode).toBeTruthy();

    const initial = await request.get(`/api/oauth/device/requests?user_code=${encodeURIComponent(userCode)}`, {
      headers: { "x-forwarded-for": ip }
    });
    await expectStatus(initial, 200);
    const initialBody = await initial.json();
    const authorizationId = String(initialBody?.data?.authorization_id || "");
    expect(authorizationId).toBeTruthy();

    const createdAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("oauth_device_authorizations")
      .update({
        status: "PENDING",
        created_at: createdAt,
        updated_at: createdAt,
        expires_at: expiresAt,
        authorized_at: null,
        denied_at: null,
        expired_at: null
      })
      .eq("authorization_id", authorizationId);
    expect(updateError).toBeNull();

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
        agent_name: `Integration Expired ${randomId()}`
      }
    });
    expect(approve.status()).toBe(409);
    const approveBody = await approve.json();
    expect(approveBody?.error?.code).toBe("DEVICE_AUTHORIZATION_EXPIRED");

    const expired = await request.get(`/api/oauth/device/requests?user_code=${encodeURIComponent(userCode)}`, {
      headers: { "x-forwarded-for": ip }
    });
    await expectStatus(expired, 200);
    const expiredBody = await expired.json();
    expect(expiredBody?.data?.status).toBe("EXPIRED");
    expect(expiredBody?.data?.expires_at).toBeTruthy();
  });

  test("console wrapper approve works (ops owner injected) and sets owner to OPS_CONSOLE_OWNER_ID", async ({
    request
  }) => {
    const supabase = createSupabaseAdmin();
    await ensureOpsConsoleAgent(supabase);

    const ip = randomIp();
    const baseUrl =
      process.env.API_BASE_URL ||
      process.env.E2E_BASE_URL ||
      `http://localhost:${process.env.E2E_DEV_PORT || 3000}`;

    const authorize = await request.post("/api/oauth/device/authorize", {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        "x-forwarded-for": ip
      },
      data: {
        client_id: "openclaw",
        scope: "agent:read",
        requested_agent_name: "Integration Console Approve"
      }
    });
    await expectStatus(authorize, 200);
    const authorizeBody = await authorize.json();
    const userCode = String(authorizeBody?.user_code || "");
    expect(userCode).toBeTruthy();

    const approve = await request.post("/api/console/oauth/device/approve", {
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": randomId(),
        origin: baseUrl,
        referer: `${baseUrl}/console`
      },
      data: {
        user_code: userCode,
        mode: "attach_agent",
        attach_agent_id: OPS_CONSOLE_AGENT_ID
      }
    });
    await expectStatus(approve, 200);
    const approveBody = await approve.json();
    expect(approveBody?.data?.status).toBe("AUTHORIZED");
    expect(approveBody?.data?.owner_id).toBe(OPS_CONSOLE_OWNER_ID);
    expect(approveBody?.data?.agent_id).toBe(OPS_CONSOLE_AGENT_ID);
  });
});
