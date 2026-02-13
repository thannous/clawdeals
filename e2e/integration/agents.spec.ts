import { test, expect } from "@playwright/test";

import { assertIntegrationEnv, skipRateLimitTests } from "./helpers/env";
import { randomId, randomIp } from "./helpers/ids";
import { waitForAuditLog } from "./helpers/audit";
import { createOwner, registerAgent, expectStatus } from "./helpers/http";
import { createSupabaseAdmin } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Agents", () => {
  test.setTimeout(60000);

  test("register agent idempotency + audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const auditSince = new Date().toISOString();
    const ownerId = randomId();
    const ip = randomIp();
    await createOwner(request, ownerId);

    const idemKey = randomId();
    const auditRequestId = randomId();
    const first = await registerAgent(request, ownerId, idemKey, "Integration Agent", ip, { requestId: auditRequestId });
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

    const audit = await waitForAuditLog(supabase, "agent.registered", 10, auditSince, auditRequestId);
    expect(audit).not.toBeNull();
    expect(audit.outcome).toBe("SUCCESS");
  });

  test("register agent idempotency misuse returns 409", async ({ request }) => {
    const ownerId = randomId();
    const ip = randomIp();
    await createOwner(request, ownerId);

    const key = randomId();
    const first = await registerAgent(request, ownerId, key, "Idem Agent", ip);
    await expectStatus(first, 201);

    const second = await registerAgent(request, ownerId, key, "Other Agent", ip);
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe("IDEMPOTENCY_KEY_REUSE");
  });

  test("rate limit register agent", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit register agent");
    const ip = randomIp();
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

  test("rate limit register agent returns proper headers", async ({ request }) => {
    test.skip(skipRateLimitTests, "rate limit register agent headers");
    const ip = randomIp();
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

  test("agents/me supports get + update name with agent key", async ({ request }) => {
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const register = await registerAgent(request, ownerId, randomId(), "Create Name Agent");
    await expectStatus(register, 201);
    const registerBody = await register.json();
    const apiKey = String(registerBody?.data?.api_key || "");
    expect(apiKey).toBeTruthy();

    const meBefore = await request.get("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    await expectStatus(meBefore, 200);
    const meBeforeBody = await meBefore.json();
    expect(meBeforeBody?.data?.name).toBe("Create Name Agent");
    expect(meBeforeBody?.data?.agent_id).toBe(registerBody?.data?.agent_id);

    const renamed = `Updated Agent ${randomId().slice(0, 8)}`;
    const patchRes = await request.patch("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": randomId()
      },
      data: { name: `  ${renamed}  ` }
    });
    await expectStatus(patchRes, 200);
    const patchBody = await patchRes.json();
    expect(patchBody?.data?.name).toBe(renamed);

    const meAfter = await request.get("/api/v1/agents/me", {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    await expectStatus(meAfter, 200);
    const meAfterBody = await meAfter.json();
    expect(meAfterBody?.data?.name).toBe(renamed);
    expect(meAfterBody?.data?.agent_id).toBe(registerBody?.data?.agent_id);
  });
});
