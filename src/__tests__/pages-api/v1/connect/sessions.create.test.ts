import crypto from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/connect-sessions", () => ({
  createConnectSession: vi.fn()
}));

vi.mock("../../../../server/services/acquisition", () => ({
  safeRecordActivationStarted: vi.fn().mockResolvedValue({ recorded: true })
}));

import { handler } from "../../../../pages/api/v1/connect/sessions/index";
import { createConnectSession } from "../../../../server/services/connect-sessions";
import { safeRecordActivationStarted } from "../../../../server/services/acquisition";

const createConnectSessionMock = vi.mocked(createConnectSession);
const safeRecordActivationStartedMock = vi.mocked(safeRecordActivationStarted);

const baseCtx: any = {
  authError: null,
  ip: "203.0.113.42",
  userAgent: "Mozilla/5.0 UnitTest"
};

const validBody = {
  requested_agent_name: "OpenClaw",
  requested_scopes: ["agent:read", "agent:write"]
};

describe("POST /v1/connect/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses request host for claim_url in localhost dev", async () => {
    createConnectSessionMock.mockResolvedValue({
      session: {
        session_id: "11111111-1111-1111-1111-111111111111",
        status: "PENDING_CLAIM",
        expires_at: "2026-02-10T12:00:00.000Z",
        poll_token_hash: "pollhash",
        claim_token_hash: "claimhash"
      },
      claim_token: "cd_claim_local",
      poll_token: "cd_poll_test",
      verification_code: "reef-X4B2"
    } as any);

    const req = {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "idempotency-key": "abc"
      },
      body: validBody
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(result.body.data.claim_url).toBe("http://localhost:3000/claim/cd_claim_local");
  });

  it("prefers x-forwarded host/proto for claim_url", async () => {
    createConnectSessionMock.mockResolvedValue({
      session: {
        session_id: "11111111-1111-1111-1111-111111111111",
        status: "PENDING_CLAIM",
        expires_at: "2026-02-10T12:00:00.000Z",
        poll_token_hash: "pollhash",
        claim_token_hash: "claimhash"
      },
      claim_token: "cd_claim_forwarded",
      poll_token: "cd_poll_test",
      verification_code: "reef-X4B2"
    } as any);

    const req = {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "x-forwarded-host": "app-preview.clawdeals.com",
        "x-forwarded-proto": "https",
        "idempotency-key": "abc"
      },
      body: validBody
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(result.body.data.claim_url).toBe("https://app-preview.clawdeals.com/claim/cd_claim_forwarded");
  });

  it("forwards a valid acquisition ID and rejects a malformed one", async () => {
    createConnectSessionMock.mockResolvedValue({
      session: {
        session_id: "11111111-1111-1111-1111-111111111111",
        status: "PENDING_CLAIM",
        created_at: "2026-02-10T11:50:00.000Z",
        expires_at: "2026-02-10T12:00:00.000Z",
        poll_token_hash: "pollhash",
        claim_token_hash: "claimhash"
      },
      claim_token: "cd_claim_acquisition",
      poll_token: "cd_poll_test",
      verification_code: "reef-X4B2"
    } as any);

    const acquisitionId = "018f3c2a-1e4b-4f8a-9ac0-0123456789ab";
    const validResult: any = await handler({
      method: "POST",
      headers: { "idempotency-key": "valid-acquisition" },
      body: { ...validBody, acquisition_id: acquisitionId }
    }, null, { ...baseCtx });
    const invalidResult: any = await handler({
      method: "POST",
      headers: { "idempotency-key": "invalid-acquisition" },
      body: { ...validBody, acquisition_id: "not-a-uuid" }
    }, null, { ...baseCtx });

    expect(validResult.status).toBe(201);
    expect(createConnectSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ acquisitionId })
    );
    expect(safeRecordActivationStartedMock).toHaveBeenCalledWith({
      acquisitionId,
      sessionId: "11111111-1111-1111-1111-111111111111",
      occurredAt: new Date("2026-02-10T11:50:00.000Z")
    });
    expect(invalidResult.status).toBe(400);
    expect(invalidResult.body.error.code).toBe("VALIDATION_ERROR");
  });
});
