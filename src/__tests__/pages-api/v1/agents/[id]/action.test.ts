import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/agents", () => ({
  getAgentById: vi.fn()
}));

vi.mock("../../../../../server/services/api-keys", () => ({
  rotateApiKeyForAgent: vi.fn(),
  revokeApiKeyForAgent: vi.fn()
}));

import { handler } from "./[action]";
import { getAgentById } from "../../../../../server/services/agents";
import { rotateApiKeyForAgent, revokeApiKeyForAgent } from "../../../../../server/services/api-keys";

const ownerId = "a3d3f0ec-6d36-4e9f-a16e-8c8b68fd6a65";
const agentId = "d5dd3a9d-9c1e-4e46-8759-7f502c0449a1";

const getAgentByIdMock = vi.mocked(getAgentById);
const rotateApiKeyForAgentMock = vi.mocked(rotateApiKeyForAgent);
const revokeApiKeyForAgentMock = vi.mocked(revokeApiKeyForAgent);

function baseReq(action: any): any {
  return {
    method: "POST",
    headers: {} as any,
    query: { id: agentId, action }
  };
}

describe("POST /v1/agents/:id/keys actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner auth", async () => {
    const req = baseReq("keys:rotate");
    const ctx: any = { actor: { type: "agent" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(401);
  });

  it("validates agent id", async () => {
    const req = { method: "POST", headers: {}, query: { id: "bad", action: "keys:rotate" } };
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
  });

  it("returns 404 when agent not found", async () => {
    getAgentByIdMock.mockResolvedValue(null);
    const req = baseReq("keys:rotate");
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(404);
  });

  it("returns 403 when owner mismatched", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: "other" } as any);
    const req = baseReq("keys:rotate");
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(403);
  });

  it("requires Idempotency-Key for rotate", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    const req = baseReq("keys:rotate");
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rotates api key", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    rotateApiKeyForAgentMock.mockResolvedValue({
      apiKey: "cd_live_new.secret",
      apiKeyId: "0a9d1f2c-51db-4d0c-9cd1-7346557f6b6e",
      previousApiKeyId: "3f2b2bf1-2c0b-4bd8-bf60-0ea0aa9e43d0",
      rotatedAt: new Date("2026-02-05T12:00:00.000Z"),
      graceSeconds: 86400
    } as any);
    const req = baseReq("keys:rotate");
    req.headers["idempotency-key"] = "abc";
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.api_key).toBe("cd_live_new.secret");
  });

  it("revokes api key", async () => {
    getAgentByIdMock.mockResolvedValue({ id: agentId, owner_id: ownerId } as any);
    revokeApiKeyForAgentMock.mockResolvedValue({
      api_key_id: "e8e975c9-6a5f-43c2-9b41-7ff0d2f1f8b8",
      revoked_at: "2026-02-05T12:00:00.000Z"
    } as any);
    const req = baseReq("keys:revoke");
    req.body = { api_key_id: "e8e975c9-6a5f-43c2-9b41-7ff0d2f1f8b8" };
    const ctx: any = { ownerId, actor: { type: "owner" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.api_key_id).toBe("e8e975c9-6a5f-43c2-9b41-7ff0d2f1f8b8");
  });
});
