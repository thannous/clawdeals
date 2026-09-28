import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../server/services/agents", () => ({
  getAgentById: vi.fn()
}));

vi.mock("../../../../../server/services/api-keys", () => ({
  rotateApiKeyForAgent: vi.fn(),
  revokeApiKeyForAgent: vi.fn(),
  rotateGlobalApiKeyForAgentIfPresent: vi.fn(),
  revokeGlobalApiKeysForAgent: vi.fn()
}));

vi.mock("../../../../../server/services/agent-installations", () => ({
  listActiveInstallationsForOwnerAgent: vi.fn(),
  revokeInstallationForOwner: vi.fn()
}));

const mockEq = vi.fn().mockResolvedValue({ data: null, error: null });
const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
vi.mock("../../../../../server/db/supabase", () => ({
  getSupabaseServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({ update: mockUpdate }))
  }))
}));

import { handler } from "../../../../../pages/api/v1/agents/[id]/[action]";
import { getAgentById } from "../../../../../server/services/agents";
import {
  revokeApiKeyForAgent,
  revokeGlobalApiKeysForAgent,
  rotateApiKeyForAgent,
  rotateGlobalApiKeyForAgentIfPresent
} from "../../../../../server/services/api-keys";
import {
  listActiveInstallationsForOwnerAgent,
  revokeInstallationForOwner
} from "../../../../../server/services/agent-installations";

const ownerId = "a3d3f0ec-6d36-4e9f-a16e-8c8b68fd6a65";
const agentId = "d5dd3a9d-9c1e-4e46-8759-7f502c0449a1";

const getAgentByIdMock = vi.mocked(getAgentById);
const rotateApiKeyForAgentMock = vi.mocked(rotateApiKeyForAgent);
const revokeApiKeyForAgentMock = vi.mocked(revokeApiKeyForAgent);
const rotateGlobalApiKeyForAgentIfPresentMock = vi.mocked(rotateGlobalApiKeyForAgentIfPresent);
const revokeGlobalApiKeysForAgentMock = vi.mocked(revokeGlobalApiKeysForAgent);
const listActiveInstallationsForOwnerAgentMock = vi.mocked(listActiveInstallationsForOwnerAgent);
const revokeInstallationForOwnerMock = vi.mocked(revokeInstallationForOwner);

function baseReq(action: any): any {
  return {
    method: "POST",
    headers: {} as any,
    query: { id: agentId, action },
    body: {}
  };
}

describe("POST /v1/agents/:id/keys actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockResolvedValue({ data: null, error: null });
    listActiveInstallationsForOwnerAgentMock.mockResolvedValue([]);
    revokeInstallationForOwnerMock.mockResolvedValue({
      installation_id: "00000000-0000-4000-a000-000000000010",
      status: "REVOKED"
    } as any);
  });

  it("rotate-all revokes every active installation across multiple batches", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    rotateGlobalApiKeyForAgentIfPresentMock.mockResolvedValue({
      rotated: true,
      apiKey: "cd_live_rotate_all.secret",
      apiKeyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      previousApiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rotatedAt: new Date("2026-02-14T11:22:33.000Z"),
      graceSeconds: 86400
    } as any);

    const batchOne = Array.from({ length: 100 }, (_, i) => ({
      installation_id: `inst-${String(i).padStart(3, "0")}`
    }));
    const batchTwo = [{ installation_id: "inst-100" }];
    listActiveInstallationsForOwnerAgentMock
      .mockResolvedValueOnce(batchOne as any)
      .mockResolvedValueOnce(batchTwo as any)
      .mockResolvedValueOnce([] as any);

    const req = baseReq("keys:rotate-all");
    req.headers["idempotency-key"] = "idem-rotate-all-paginated";
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.revoked_installations_count).toBe(101);
    expect(result.body.data.revoked_installation_ids).toHaveLength(101);
    expect(result.body.data.revoked_installation_ids[0]).toBe("inst-000");
    expect(result.body.data.revoked_installation_ids[100]).toBe("inst-100");
    expect(revokeInstallationForOwnerMock).toHaveBeenCalledTimes(101);
    expect(listActiveInstallationsForOwnerAgentMock).toHaveBeenCalledTimes(3);
  });

  it("returns 500 when rotate status sync write fails", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    rotateApiKeyForAgentMock.mockResolvedValue({
      apiKey: "cd_live_new.secret",
      apiKeyId: "0a9d1f2c-51db-4d0c-9cd1-7346557f6b6e",
      previousApiKeyId: "3f2b2bf1-2c0b-4bd8-bf60-0ea0aa9e43d0",
      rotatedAt: new Date("2026-02-05T12:00:00.000Z"),
      graceSeconds: 86400
    } as any);
    mockEq.mockResolvedValueOnce({
      data: null,
      error: { message: "db down" }
    });
    const req = baseReq("keys:rotate");
    req.headers["idempotency-key"] = "idem-rotate-status-fail";
    const ctx: any = { ownerId, actor: { type: "owner" } };

    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("ERROR");
    expect(result.body.error.details.failure_stage).toBe("agent_status_update");
  });

  it("returns 500 when rotate-all status sync write fails", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    rotateGlobalApiKeyForAgentIfPresentMock.mockResolvedValue({
      rotated: true,
      apiKey: "cd_live_rotate_all.secret",
      apiKeyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      previousApiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rotatedAt: new Date("2026-02-14T11:22:33.000Z"),
      graceSeconds: 86400
    } as any);
    listActiveInstallationsForOwnerAgentMock.mockResolvedValue([] as any);
    mockEq.mockResolvedValueOnce({
      data: null,
      error: { message: "db down" }
    });
    const req = baseReq("keys:rotate-all");
    req.headers["idempotency-key"] = "idem-rotate-all-status-fail";
    const ctx: any = { ownerId, actor: { type: "owner" } };

    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("ERROR");
    expect(result.body.error.details.failure_stage).toBe("agent_status_update");
  });

  it("returns 500 when revoke-all status sync write fails", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    revokeGlobalApiKeysForAgentMock.mockResolvedValue({
      revokedGlobalKeysCount: 0,
      revokedGlobalApiKeyIds: []
    } as any);
    listActiveInstallationsForOwnerAgentMock.mockResolvedValue([] as any);
    mockEq.mockResolvedValueOnce({
      data: null,
      error: { message: "db down" }
    });
    const req = baseReq("keys:revoke-all");
    req.headers["idempotency-key"] = "idem-revoke-all-status-fail";
    const ctx: any = { ownerId, actor: { type: "owner" } };

    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("ERROR");
    expect(result.body.error.details.failure_stage).toBe("agent_status_update");
  });

  it("revoke-all revokes every active installation across multiple batches", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    revokeGlobalApiKeysForAgentMock.mockResolvedValue({
      revokedGlobalKeysCount: 1,
      revokedGlobalApiKeyIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]
    } as any);

    const batchOne = Array.from({ length: 100 }, (_, i) => ({
      installation_id: `inst-${String(i).padStart(3, "0")}`
    }));
    const batchTwo = [{ installation_id: "inst-100" }];
    listActiveInstallationsForOwnerAgentMock
      .mockResolvedValueOnce(batchOne as any)
      .mockResolvedValueOnce(batchTwo as any)
      .mockResolvedValueOnce([] as any);

    const req = baseReq("keys:revoke-all");
    req.headers["idempotency-key"] = "idem-revoke-all-paginated";
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.data.revoked_global_keys_count).toBe(1);
    expect(result.body.data.revoked_installations_count).toBe(101);
    expect(result.body.data.revoked_installation_ids).toHaveLength(101);
    expect(revokeInstallationForOwnerMock).toHaveBeenCalledTimes(101);
    expect(listActiveInstallationsForOwnerAgentMock).toHaveBeenCalledTimes(3);
  });

  it("rotate-all fails fast on installation revoke error", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    rotateGlobalApiKeyForAgentIfPresentMock.mockResolvedValue({
      rotated: true,
      apiKey: "cd_live_rotate_all.secret",
      apiKeyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      previousApiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      rotatedAt: new Date("2026-02-14T11:22:33.000Z"),
      graceSeconds: 86400
    } as any);
    listActiveInstallationsForOwnerAgentMock.mockResolvedValueOnce([
      { installation_id: "00000000-0000-4000-a000-000000000010" },
      { installation_id: "00000000-0000-4000-a000-000000000011" }
    ] as any);
    revokeInstallationForOwnerMock.mockImplementation(async ({ installationId }: any) => {
      if (installationId === "00000000-0000-4000-a000-000000000010") {
        return { installation_id: installationId, status: "REVOKED" };
      }
      throw Object.assign(new Error("Installation not found"), {
        status: 404,
        code: "NOT_FOUND"
      });
    });

    const req = baseReq("keys:rotate-all");
    req.headers["idempotency-key"] = "idem-rotate-all-fail-fast";
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
    expect(result.body.error.details.installation_id).toBe("00000000-0000-4000-a000-000000000011");
    expect(result.body.error.details.failure_stage).toBe("installation_revoke");
    expect(revokeInstallationForOwnerMock).toHaveBeenCalledTimes(2);
  });
});
