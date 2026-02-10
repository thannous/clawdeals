import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId, randomIp } from "./helpers/ids";
import { createOwner, expectStatus } from "./helpers/http";
import { waitForAuditLog } from "./helpers/audit";
import { createSupabaseAdmin } from "./helpers/supabase";

assertIntegrationEnv();

function extractClaimToken(claimUrl: string): string {
  const url = new URL(String(claimUrl));
  const parts = url.pathname.split("/").filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] || "");
}

test.describe.serial("Integration: Connected Apps", () => {
  test.setTimeout(60_000);

  test("list installations + revoke invalidates api keys and emits audit", async ({ request }) => {
    const supabase = createSupabaseAdmin();
    const ownerId = randomId();
    await createOwner(request, ownerId);

    const create = await request.post("/api/v1/connect/sessions", {
      headers: { "Idempotency-Key": randomId(), "x-forwarded-for": randomIp() },
      data: { requested_agent_name: "Integration Connected Apps", requested_scopes: [] },
    });
    await expectStatus(create, 201);
    const createBody = await create.json();

    const sessionId = createBody?.data?.session_id;
    const pollToken = createBody?.data?.poll_token;
    const claimToken = extractClaimToken(createBody?.data?.claim_url);

    expect(sessionId).toBeTruthy();
    expect(pollToken).toBeTruthy();
    expect(claimToken).toMatch(/^cd_claim_/);

    const claim = await request.post(`/api/v1/connect/sessions/${encodeURIComponent(sessionId)}/claim`, {
      headers: { "x-owner-id": ownerId, "Idempotency-Key": randomId() },
      data: { claim_token: claimToken, mode: "create_agent", agent_name: "Integration Connected Apps Agent" },
    });
    await expectStatus(claim, 200);

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

    expect(installationId).toBeTruthy();
    expect(apiKey).toMatch(/^cd_(live|sandbox)_.+\..+$/);

    const auditSince = new Date().toISOString();

    const listRequestId = randomId();
    const list = await request.get("/api/v1/owner/installations", {
      headers: { "x-owner-id": ownerId, "x-request-id": listRequestId },
    });
    await expectStatus(list, 200);
    const listBody = await list.json();
    expect(Array.isArray(listBody.installations)).toBe(true);
    const found = (listBody.installations || []).find((it: any) => it?.installation_id === installationId);
    expect(found).toBeTruthy();
    expect(found.status).toBe("ACTIVE");

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

    const listAfter = await request.get("/api/v1/owner/installations", {
      headers: { "x-owner-id": ownerId },
    });
    await expectStatus(listAfter, 200);
    const listAfterBody = await listAfter.json();
    const foundAfter = (listAfterBody.installations || []).find((it: any) => it?.installation_id === installationId);
    expect(foundAfter).toBeTruthy();
    expect(foundAfter.status).toBe("REVOKED");

    const revokedAuth = await request.get("/api/v1/policies", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(revokedAuth.status()).toBe(401);

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
});

