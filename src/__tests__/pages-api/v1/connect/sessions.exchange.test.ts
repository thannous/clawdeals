import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn().mockResolvedValue(null)
}));

vi.mock("../../../../server/idempotency/middleware", () => ({
  beginIdempotency: vi.fn().mockResolvedValue({ action: "skip" }),
  finalizeIdempotency: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../../../../server/services/connect-sessions", () => ({
  getConnectSessionForPoll: vi.fn().mockResolvedValue({
    session_id: "11111111-1111-4111-8111-111111111111",
    status: "CLAIMED"
  }),
  hashConnectSessionPollToken: vi.fn().mockReturnValue("poll_token_hash")
}));

vi.mock("../../../../server/services/connect-session-exchange", () => ({
  exchangeConnectSessionForInstallationApiKey: vi.fn()
}));

vi.mock("../../../../server/services/acquisition", () => ({
  safeRecordAgentConnected: vi.fn().mockResolvedValue({ recorded: true })
}));

import { jsonResponse } from "../../../../server/http/response";
import { handler } from "../../../../pages/api/v1/connect/sessions/[session_id]/exchange";
import { rateLimitMiddleware } from "../../../../server/rate-limit/middleware";
import { beginIdempotency, finalizeIdempotency } from "../../../../server/idempotency/middleware";
import { getConnectSessionForPoll, hashConnectSessionPollToken } from "../../../../server/services/connect-sessions";
import { exchangeConnectSessionForInstallationApiKey } from "../../../../server/services/connect-session-exchange";

const rateLimitMiddlewareMock = vi.mocked(rateLimitMiddleware);
const beginIdempotencyMock = vi.mocked(beginIdempotency);
const finalizeIdempotencyMock = vi.mocked(finalizeIdempotency);
const getConnectSessionForPollMock = vi.mocked(getConnectSessionForPoll);
const hashConnectSessionPollTokenMock = vi.mocked(hashConnectSessionPollToken);
const exchangeMock = vi.mocked(exchangeConnectSessionForInstallationApiKey);

const baseCtx: any = { authError: null, actor: { type: "anonymous", id: null } };

describe("POST /v1/connect/sessions/:session_id/exchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMiddlewareMock.mockResolvedValue(null as any);
    getConnectSessionForPollMock.mockResolvedValue({
      session_id: "11111111-1111-4111-8111-111111111111",
      status: "CLAIMED"
    } as any);
    hashConnectSessionPollTokenMock.mockReturnValue("poll_token_hash");
    beginIdempotencyMock.mockResolvedValue({
      action: "continue",
      context: { key: "idem-1", record: { idempotency_id: "idem-1" } }
    } as any);
  });

  it("returns 503 when the IP rate limit protection is unavailable", async () => {
    rateLimitMiddlewareMock.mockRejectedValueOnce(new Error("redis down"));

    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(result.headers["Retry-After"]).toBe("1");
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "rate_limit_unavailable" });
    expect(getConnectSessionForPollMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the poll-token rate limit protection is unavailable", async () => {
    rateLimitMiddlewareMock.mockResolvedValueOnce(null as any).mockRejectedValueOnce(new Error("redis down"));

    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "rate_limit_unavailable" });
    expect(getConnectSessionForPollMock).not.toHaveBeenCalled();
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it("returns 503 when idempotency protection is unavailable", async () => {
    beginIdempotencyMock.mockRejectedValueOnce(new Error("idempotency store down"));

    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("IDEMPOTENCY_UNAVAILABLE");
    expect(result.headers["Retry-After"]).toBe("1");
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "idempotency_unavailable" });
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(finalizeIdempotencyMock).not.toHaveBeenCalled();
  });
});
