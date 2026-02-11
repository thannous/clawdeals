import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/agent-installations", () => ({
  revokeInstallationForOwner: vi.fn(),
  getInstallationById: vi.fn()
}));

vi.mock("../../../../server/services/api-keys", () => ({
  rotateInstallationApiKeyForOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/installations/[id_action]";
import { revokeInstallationForOwner } from "../../../../server/services/agent-installations";

const revokeInstallationForOwnerMock = vi.mocked(revokeInstallationForOwner);

const validOwnerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const validInstallationId = "11111111-1111-4111-8111-111111111111";

function makeOwnerCtx(): any {
  return {
    ownerId: validOwnerId,
    actor: { type: "owner", id: validOwnerId },
  };
}

describe("POST /v1/installations/:installation_id:revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 for unsupported methods", async () => {
    const req = { method: "GET", query: {}, headers: {} };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(405);
  });

  it("returns 401 when not owner-authenticated", async () => {
    const req = { method: "POST", query: { id_action: `${validInstallationId}:revoke` }, headers: { "idempotency-key": "idem" } };
    const result: any = await handler(req, null, {});
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when owner_id is not a UUID", async () => {
    const req = { method: "POST", query: { id_action: `${validInstallationId}:revoke` }, headers: { "idempotency-key": "idem" } };
    const ctx = { ownerId: "not-a-uuid", actor: { type: "owner", id: "not-a-uuid" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when id_action is missing or malformed", async () => {
    const req = { method: "POST", query: { id_action: "bad" }, headers: { "idempotency-key": "idem" } };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 when installation_id is not a UUID", async () => {
    const req = { method: "POST", query: { id_action: "not-a-uuid:revoke" }, headers: { "idempotency-key": "idem" } };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when action is unknown", async () => {
    const req = { method: "POST", query: { id_action: `${validInstallationId}:unknown` }, headers: { "idempotency-key": "idem" } };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("requires Idempotency-Key", async () => {
    const req = { method: "POST", query: { id_action: `${validInstallationId}:revoke` }, headers: {}, body: {} };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-string reason", async () => {
    const req = {
      method: "POST",
      query: { id_action: `${validInstallationId}:revoke` },
      headers: { "idempotency-key": "idem" },
      body: { reason: 123 },
    };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects too-long reason", async () => {
    const req = {
      method: "POST",
      query: { id_action: `${validInstallationId}:revoke` },
      headers: { "idempotency-key": "idem" },
      body: { reason: "x".repeat(201) },
    };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 on success and sets audit fields", async () => {
    revokeInstallationForOwnerMock.mockResolvedValue({
      installation_id: validInstallationId,
      status: "REVOKED",
      revoked_at: "2026-02-10T12:00:00Z",
      revoked_keys_count: 1,
    } as any);

    const ctx: any = makeOwnerCtx();
    const req = {
      method: "POST",
      query: { id_action: `${validInstallationId}:revoke` },
      headers: { "idempotency-key": "idem" },
      body: { reason: "compromised" },
    };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.installation_id).toBe(validInstallationId);
    expect(result.body.status).toBe("REVOKED");
    expect(result.body.revoked_at).toBeTruthy();

    expect(ctx.auditEvent).toBe("installation.revoked");
    expect(ctx.auditEntityType).toBe("installation");
    expect(ctx.auditEntityId).toBe(validInstallationId);
    expect(ctx.security).toEqual({ installation_id: validInstallationId, reason: "compromised" });

    expect(revokeInstallationForOwnerMock).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: validOwnerId, installationId: validInstallationId, reason: "compromised" })
    );
  });

  it("surfaces NOT_FOUND from the service as 404", async () => {
    const err: any = new Error("Installation not found");
    err.status = 404;
    err.code = "NOT_FOUND";
    revokeInstallationForOwnerMock.mockRejectedValue(err);

    const req = {
      method: "POST",
      query: { id_action: `${validInstallationId}:revoke` },
      headers: { "idempotency-key": "idem" },
      body: {},
    };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });
});
