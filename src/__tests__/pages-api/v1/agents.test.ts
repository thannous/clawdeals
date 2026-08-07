import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/agents", () => ({
  createAgent: vi.fn()
}));

vi.mock("../../../server/services/api-keys", () => ({
  createApiKeyForAgent: vi.fn()
}));

import { handler } from "../../../pages/api/v1/agents";
import { createAgent } from "../../../server/services/agents";
import { createApiKeyForAgent } from "../../../server/services/api-keys";

const createAgentMock = vi.mocked(createAgent);
const createApiKeyForAgentMock = vi.mocked(createApiKeyForAgent);

const baseCtx: any = { ownerId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7", authError: null };

describe("POST /v1/agents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires Idempotency-Key", async () => {
    const req = { method: "POST", headers: {}, body: { name: "Agent" } };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates name length", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { name: "a".repeat(81) }
    };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates agent and returns api key", async () => {
    createAgentMock.mockResolvedValue({
      id: "c16baf67-7d52-4e2d-8f52-0b6daedb4d4b",
      trust_score: 10,
      trust_flags: ["unverified_owner"],
      created_at: "2026-02-05T12:00:00.000Z"
    });
    createApiKeyForAgentMock.mockResolvedValue({
      apiKey: "cd_live_test.secret",
      record: { api_key_id: "6bdc3e7a-4c34-4a6d-86b6-6f1bdb9d5df0" }
    });

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { name: "Agent" }
    };
    const result: any = await handler(req, null, baseCtx);

    expect(result.status).toBe(201);
    expect(result.body.data.agent_id).toBe("c16baf67-7d52-4e2d-8f52-0b6daedb4d4b");
    expect(result.body.data.api_key).toBe("cd_live_test.secret");
    expect(result.body.data.trust_score).toBe(10);
  });

  it("normalizes and forwards contact_email to createAgent", async () => {
    createAgentMock.mockResolvedValue({
      id: "c16baf67-7d52-4e2d-8f52-0b6daedb4d4b",
      trust_score: 10,
      trust_flags: ["unverified_owner"],
      created_at: "2026-02-05T12:00:00.000Z"
    });
    createApiKeyForAgentMock.mockResolvedValue({
      apiKey: "cd_live_test.secret",
      record: { api_key_id: "6bdc3e7a-4c34-4a6d-86b6-6f1bdb9d5df0" }
    });

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { name: "Agent", contact_email: "  Dev@Example.COM " }
    };
    const result: any = await handler(req, null, baseCtx);

    expect(result.status).toBe(201);
    expect(createAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: "dev@example.com" })
    );
  });

  it("rejects an invalid contact_email", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { name: "Agent", contact_email: "not-an-email" }
    };
    const result: any = await handler(req, null, baseCtx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(createAgentMock).not.toHaveBeenCalled();
  });

  it("returns auth error when provided", async () => {
    const req = { method: "POST", headers: {}, body: { name: "Agent" } };
    const ctx: any = { authError: { status: 401, code: "UNAUTHORIZED", message: "Invalid" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });
});
