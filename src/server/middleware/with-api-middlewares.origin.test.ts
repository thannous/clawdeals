import { describe, expect, it, vi } from "vitest";

vi.mock("../audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

import { withApiMiddlewares } from "./with-api-middlewares";
import { safeAuditLog } from "../audit/singleton";
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

describe("withApiMiddlewares audit origin", () => {
  it("includes x-clawdeals-origin in audit.security.origin", async () => {
    const wrapped = withApiMiddlewares(
      async () => {
        return jsonResponse(200, { ok: true });
      },
      { enableRateLimit: false, enableIdempotency: false }
    );

    const req: any = {
      method: "GET",
      url: "/api/v1/deals",
      headers: { "x-clawdeals-origin": "mcp" },
      query: {}
    };
    const res = makeRes();

    await wrapped(req, res);

    expect(safeAuditLog).toHaveBeenCalledTimes(1);
    const event = vi.mocked(safeAuditLog).mock.calls[0][0];
    expect(event.security.origin).toBe("mcp");
  });
});

