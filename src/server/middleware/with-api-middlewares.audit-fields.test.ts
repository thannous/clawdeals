import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

vi.mock("../idempotency/middleware", () => ({
  beginIdempotency: vi.fn(),
  finalizeIdempotency: vi.fn()
}));

vi.mock("../services/api-keys", () => ({
  authenticateApiKey: vi.fn()
}));

import { withApiMiddlewares } from "./with-api-middlewares";
import { jsonResponse } from "../http/response";
import { safeAuditLog } from "../audit/singleton";
import { beginIdempotency, finalizeIdempotency } from "../idempotency/middleware";
import { authenticateApiKey } from "../services/api-keys";

function makeRes() {
  const res: any = {
    statusCode: 0,
    writableEnded: false,
    setHeader: vi.fn(),
    end: vi.fn(() => {
      res.writableEnded = true;
    })
  };
  return res;
}

describe("withApiMiddlewares audit fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(beginIdempotency).mockResolvedValue({
      action: "continue",
      context: {
        key: "idem-1",
        record: { idempotency_id: "idem-1" }
      }
    } as any);
    vi.mocked(finalizeIdempotency).mockResolvedValue(undefined as any);
    vi.mocked(authenticateApiKey).mockResolvedValue({
      ok: true,
      agentId: "agent-1",
      ownerId: "owner-1",
      apiKeyId: "key-1",
      keyState: "ACTIVE"
    } as any);
  });

  it("includes origin, auth, and idempotency details in audit event", async () => {
    const wrapped = withApiMiddlewares(
      async () => {
        return jsonResponse(201, { ok: true });
      },
      { enableRateLimit: false }
    );

    const req: any = {
      method: "POST",
      url: "/api/v1/deals",
      headers: {
        authorization: "Bearer cd_live_abcdefgh.secret",
        "idempotency-key": "idem-1",
        "x-clawdeals-origin": "mcp"
      },
      query: {}
    };
    const res = makeRes();

    await wrapped(req, res);

    expect(safeAuditLog).toHaveBeenCalledTimes(1);
    const event = vi.mocked(safeAuditLog).mock.calls[0][0];
    expect(event.security.origin).toBe("mcp");
    expect(event.auth.agent_id).toBe("agent-1");
    expect(event.auth.api_key_id).toBe("key-1");
    expect(event.request.status_code).toBe(201);
    expect(event.request.duration_ms).toEqual(expect.any(Number));
    expect(event.request.duration_ms).toBeGreaterThanOrEqual(0);
    expect(event.request.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.idempotency).toEqual(
      expect.objectContaining({
        key: "idem-1",
        replayed: false,
        status: "COMPLETED"
      })
    );
  });
});
