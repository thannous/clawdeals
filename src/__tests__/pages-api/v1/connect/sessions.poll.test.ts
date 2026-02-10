import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/connect-sessions", () => ({
  getConnectSessionForPoll: vi.fn(),
  hashConnectSessionPollToken: vi.fn()
}));

vi.mock("../../../../server/rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn().mockResolvedValue(null)
}));

import { handler } from "../../../../pages/api/v1/connect/sessions/[session_id]";
import { getConnectSessionForPoll, hashConnectSessionPollToken } from "../../../../server/services/connect-sessions";

const getConnectSessionForPollMock = vi.mocked(getConnectSessionForPoll);
const hashConnectSessionPollTokenMock = vi.mocked(hashConnectSessionPollToken);

const baseCtx: any = { authError: null };

describe("GET /v1/connect/sessions/:session_id (poll)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hashConnectSessionPollTokenMock.mockReturnValue("poll_token_hash");
  });

  it("requires Authorization header", async () => {
    const req = { method: "GET", headers: {}, query: { session_id: "11111111-1111-1111-1111-111111111111" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("parses Authorization: Bearer <poll_token> (invalid -> 401)", async () => {
    const req = {
      method: "GET",
      headers: { authorization: "Basic abc" },
      query: { session_id: "11111111-1111-1111-1111-111111111111" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
    expect(result.body.error.message).toContain("Invalid Authorization header");
  });

  it("returns 401 for invalid poll token", async () => {
    getConnectSessionForPollMock.mockRejectedValue(
      Object.assign(new Error("Invalid poll token"), { status: 401, code: "CONNECT_POLL_TOKEN_INVALID" })
    );

    const req = {
      method: "GET",
      headers: { authorization: "Bearer cd_poll_invalid" },
      query: { session_id: "11111111-1111-1111-1111-111111111111" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(hashConnectSessionPollToken).toHaveBeenCalledWith("cd_poll_invalid");
    expect(getConnectSessionForPoll).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "11111111-1111-1111-1111-111111111111",
        pollToken: "cd_poll_invalid",
        now: expect.any(Date)
      })
    );

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("CONNECT_POLL_TOKEN_INVALID");
  });
});

