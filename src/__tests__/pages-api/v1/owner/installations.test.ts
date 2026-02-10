import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/agent-installations", () => ({
  listInstallationsForOwner: vi.fn(),
  INSTALLATIONS_DEFAULT_LIMIT: 50,
  INSTALLATIONS_MAX_LIMIT: 100
}));

import { handler } from "../../../../pages/api/v1/owner/installations";
import { listInstallationsForOwner } from "../../../../server/services/agent-installations";

const listInstallationsForOwnerMock = vi.mocked(listInstallationsForOwner);

const validOwnerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

function makeOwnerCtx(): any {
  return {
    ownerId: validOwnerId,
    actor: { type: "owner", id: validOwnerId }
  };
}

describe("GET /v1/owner/installations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 405 for unsupported methods", async () => {
    const req = { method: "POST", query: {}, headers: {} };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(405);
  });

  it("returns 401 when not owner-authenticated", async () => {
    const req = { method: "GET", query: {}, headers: {} };
    const result: any = await handler(req, null, {});
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 when owner_id is not a UUID", async () => {
    const req = { method: "GET", query: {}, headers: {} };
    const ctx = { ownerId: "not-a-uuid", actor: { type: "owner", id: "not-a-uuid" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 when limit is invalid", async () => {
    const req = { method: "GET", query: { limit: "abc" }, headers: {} };
    const result: any = await handler(req, null, makeOwnerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 with installations", async () => {
    listInstallationsForOwnerMock.mockResolvedValue([
      {
        installation_id: "11111111-1111-4111-8111-111111111111",
        agent_id: "22222222-2222-4222-8222-222222222222",
        client_type: "openclaw",
        client_version: "1.2.3",
        status: "ACTIVE",
        created_at: "2026-02-10T12:00:00Z",
        last_seen_at: "2026-02-10T12:30:00Z"
      }
    ] as any);

    const ctx = makeOwnerCtx();
    const req = { method: "GET", query: { limit: "10" }, headers: {} };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(Array.isArray(result.body.installations)).toBe(true);
    expect(result.body.installations[0].installation_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(ctx.auditEvent).toBe("installation.list_viewed");
    expect(listInstallationsForOwner).toHaveBeenCalledWith({ ownerId: validOwnerId, limit: 10 });
  });
});

