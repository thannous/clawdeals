import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

vi.mock("../services/api-keys", () => ({
  authenticateApiKey: vi.fn()
}));

vi.mock("../idempotency/middleware", () => ({
  beginIdempotency: vi.fn(async (req: any) => {
    const key = req?.headers?.["idempotency-key"] || req?.headers?.["Idempotency-Key"] || "idem";
    return { action: "continue", context: { key, record: { status: "IN_PROGRESS" } } };
  }),
  finalizeIdempotency: vi.fn(async () => {})
}));

import { withApiMiddlewares } from "./with-api-middlewares";
import { safeAuditLog } from "../audit/singleton";
import { authenticateApiKey } from "../services/api-keys";
import { jsonResponse } from "../http/response";

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

describe("withApiMiddlewares (MCP auth mapping + audit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures origin=mcp, api_key_id, agent_id, and idempotency key in audit event", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      ok: true,
      agentId: "agent-1",
      ownerId: "owner-1",
      apiKeyId: "key-1",
      keyState: "ACTIVE"
    } as any);

    const wrapped = withApiMiddlewares(
      async (_req: any, _res: any, ctx: any) => {
        ctx.auditEvent = "deal.create";
        return jsonResponse(201, { ok: true });
      },
      { enableRateLimit: false, enableIdempotency: true }
    );

    const req: any = {
      method: "POST",
      url: "/api/v1/deals",
      headers: {
        "x-clawdeals-origin": "mcp",
        "x-clawdeals-api-key": "cd_live_abcdefgh.secret",
        "idempotency-key": "idem-1",
        "x-request-id": "req-1"
      },
      query: {},
      body: { title: "Test Deal" }
    };
    const res = makeRes();

    await wrapped(req, res);

    expect(safeAuditLog).toHaveBeenCalledTimes(1);
    const event = vi.mocked(safeAuditLog).mock.calls[0][0] as any;

    expect(event.security.origin).toBe("mcp");
    expect(event.auth.agent_id).toBe("agent-1");
    expect(event.auth.api_key_id).toBe("key-1");
    expect(event.idempotency.key).toBe("idem-1");
  });
});

