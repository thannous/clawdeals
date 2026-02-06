import { test, expect } from "@playwright/test";

import { assertIntegrationEnv, skipRateLimitTests } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { expectStatus, createOwnerWithContact } from "./helpers/http";
import { waitForAuditLog } from "./helpers/audit";
import { createSupabaseAdmin } from "./helpers/supabase";

assertIntegrationEnv();

test.describe.serial("Integration: Owner Verification", () => {
  test.setTimeout(60000);

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
});

