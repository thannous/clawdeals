import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/agent-installations", () => ({
  revokeInstallationForOwner: vi.fn(),
  getInstallationById: vi.fn()
}));

vi.mock("../../../../server/services/api-keys", () => ({
  rotateInstallationApiKeyForOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/installations/[id_action]";
import { rotateInstallationApiKeyForOwner } from "../../../../server/services/api-keys";

const rotateInstallationApiKeyForOwnerMock = vi.mocked(rotateInstallationApiKeyForOwner);

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const installationId = "11111111-1111-4111-8111-111111111111";

function makeOwnerCtx(): any {
  return {
    ownerId,
    actor: { type: "owner", id: ownerId }
  };
}

describe("POST /v1/installations/:installation_id:rotate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not owner-authenticated", async () => {
    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:rotate` },
      headers: { "idempotency-key": "idem" },
      body: {}
    };

    const result: any = await handler(req, null, {});
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 without Idempotency-Key", async () => {
    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:rotate` },
      headers: {},
      body: {}
    };

    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when owner_id is not a UUID", async () => {
    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:rotate` },
      headers: { "idempotency-key": "idem" },
      body: {}
    };
    const ctx = { ownerId: "not-a-uuid", actor: { type: "owner", id: "not-a-uuid" } };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when grace_seconds is invalid", async () => {
    const invalidValues = [-1, "1.5", "1e3", "120abc"];

    for (const value of invalidValues) {
      const req: any = {
        method: "POST",
        query: { id_action: `${installationId}:rotate` },
        headers: { "idempotency-key": "idem" },
        body: { grace_seconds: value }
      };

      const result: any = await handler(req, null, makeOwnerCtx());
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("VALIDATION_ERROR");
    }

    expect(rotateInstallationApiKeyForOwnerMock).not.toHaveBeenCalled();
  });

  it("returns 200 with a new credential and sets audit fields", async () => {
    rotateInstallationApiKeyForOwnerMock.mockResolvedValue({
      installationId,
      apiKey: "cd_live_abcdefgh.secret",
      apiKeyId: "22222222-2222-4222-8222-222222222222",
      previousApiKeyId: "33333333-3333-4333-8333-333333333333",
      rotatedAt: new Date("2026-02-11T10:00:00.000Z"),
      graceSeconds: 120
    } as any);

    const ctx: any = makeOwnerCtx();
    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:rotate` },
      headers: { "idempotency-key": "idem" },
      body: { grace_seconds: 120 }
    };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.headers["Cache-Control"]).toBe("no-store");
    expect(result.body.installation_id).toBe(installationId);
    expect(result.body.api_key).toBe("cd_live_abcdefgh.secret");
    expect(result.body.api_key_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.body.previous_api_key_id).toBe("33333333-3333-4333-8333-333333333333");
    expect(result.body.grace_seconds).toBe(120);

    expect(ctx.auditEvent).toBe("installation.key_rotated");
    expect(ctx.auditEntityType).toBe("installation");
    expect(ctx.auditEntityId).toBe(installationId);
    expect(ctx.security).toEqual({
      installation_id: installationId,
      grace_seconds: 120,
      api_key_id: "22222222-2222-4222-8222-222222222222",
      previous_api_key_id: "33333333-3333-4333-8333-333333333333"
    });

    expect(rotateInstallationApiKeyForOwnerMock).toHaveBeenCalledWith({
      ownerId,
      installationId,
      graceSeconds: 120
    });
  });

  it("surfaces NOT_FOUND from service as 404", async () => {
    const err: any = new Error("Installation not found");
    err.status = 404;
    err.code = "NOT_FOUND";
    rotateInstallationApiKeyForOwnerMock.mockRejectedValue(err);

    const req: any = {
      method: "POST",
      query: { id_action: `${installationId}:rotate` },
      headers: { "idempotency-key": "idem" },
      body: {}
    };

    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });
});
