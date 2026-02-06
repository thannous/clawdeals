import { test, expect } from "@playwright/test";

import { assertIntegrationEnv, skipRateLimitTests } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { waitForAuditLog } from "./helpers/audit";
import { createOwner, registerAgent, expectStatus } from "./helpers/http";
import { createSupabaseAdmin } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Agents", () => {
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
});

