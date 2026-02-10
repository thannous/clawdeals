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

  it("requires Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: { authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates session_id as UUID", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem", authorization: "Bearer cd_poll_test" },
      query: { session_id: "not-a-uuid" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires Authorization header", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("parses Authorization: Bearer <poll_token> (invalid -> 401)", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem", authorization: "Basic abc" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(result.body.error.message).toContain("Invalid Authorization header");
  });

  it("returns 429 when rate-limited", async () => {
    rateLimitMiddlewareMock
      .mockResolvedValueOnce(null as any) // connect.sessions.exchange_ip
      .mockResolvedValueOnce({
      status: 429,
      body: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
      headers: { "Retry-After": "10" },
      meta: { group: "connect.sessions.exchange", scope: "agent", identity: "poll_token_hash" }
    } as any); // connect.sessions.exchange

    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(429);
    expect(result.headers["Retry-After"]).toBe("10");
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "rate_limit" });
  });

  it("replays idempotent response", async () => {
    beginIdempotencyMock.mockResolvedValue({
      action: "replay",
      response: jsonResponse(
        200,
        {
          data: {
            session_id: "11111111-1111-4111-8111-111111111111",
            status: "DELIVERED",
            agent_id: "22222222-2222-4222-8222-222222222222",
            installation_id: "33333333-3333-4333-8333-333333333333",
            api_key: "cd_live_x.y",
            api_key_id: "44444444-4444-4444-8444-444444444444",
            issued_at: "2026-02-10T12:00:00.000Z"
          }
        },
        { "Idempotency-Replayed": "true" }
      ),
      context: { key: "idem", record: { status: "COMPLETED" } }
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.headers["Idempotency-Replayed"]).toBe("true");
    expect(ctx.idempotency).toEqual(expect.objectContaining({ key: "idem", replayed: true }));
  });

  it("returns 409 when Idempotency-Key reuse is detected", async () => {
    beginIdempotencyMock.mockResolvedValue({
      action: "error",
      response: jsonResponse(409, { error: { code: "IDEMPOTENCY_KEY_REUSE", message: "Idempotency-Key reuse detected" } })
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: { client_type: "openclaw" } }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("IDEMPOTENCY_KEY_REUSE");
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "idempotency" });
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(finalizeIdempotencyMock).not.toHaveBeenCalled();
  });

  it("validates requested_key_scope must be agent_write", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem-1", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_read", installation: { client_type: "openclaw" } }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(finalizeIdempotencyMock).toHaveBeenCalled();
  });

  it("requires installation.client_type", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem-1", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: { requested_key_scope: "agent_write", installation: {} }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(exchangeMock).not.toHaveBeenCalled();
    expect(finalizeIdempotencyMock).toHaveBeenCalled();
  });

  it("exchanges session and returns api_key once", async () => {
    exchangeMock.mockResolvedValue({
      session_id: "11111111-1111-4111-8111-111111111111",
      status: "DELIVERED",
      agent_id: "22222222-2222-4222-8222-222222222222",
      owner_id: "55555555-5555-4555-8555-555555555555",
      installation_id: "33333333-3333-4333-8333-333333333333",
      api_key: "cd_live_testprefix.testsecret",
      api_key_id: "44444444-4444-4444-8444-444444444444",
      issued_at: "2026-02-10T12:00:00.000Z"
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "idem-1", authorization: "Bearer cd_poll_test" },
      query: { session_id: "11111111-1111-4111-8111-111111111111" },
      body: {
        requested_key_scope: "agent_write",
        installation: {
          client_type: "openclaw",
          client_version: "1.2.3",
          device_name: "laptop",
          fingerprint: "abc"
        }
      }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(hashConnectSessionPollToken).toHaveBeenCalledWith("cd_poll_test");
    expect(exchangeConnectSessionForInstallationApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "11111111-1111-4111-8111-111111111111",
        pollTokenHash: "poll_token_hash",
        requestedScope: "agent_write",
        installation: expect.objectContaining({ clientType: "openclaw" })
      })
    );

    expect(result.status).toBe(200);
    expect(result.body.data.status).toBe("DELIVERED");
    expect(result.body.data.api_key).toContain("cd_live_");
    expect(ctx.auditEvent).toBe("connect.exchange");
    expect(ctx.security.api_key_id).toBe("44444444-4444-4444-8444-444444444444");

    expect(finalizeIdempotency).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ status: 200 })
    );
    expect(ctx.idempotency).toEqual(expect.objectContaining({ key: "idem-1", replayed: false, status: "COMPLETED" }));
  });
});
