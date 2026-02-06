import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/middleware/console-ops-identity", () => ({
  injectConsoleOpsOwner: vi.fn((handler) => handler)
}));

vi.mock("../../../../server/middleware/with-api-middlewares", () => ({
  withApiMiddlewares: vi.fn((handler) => handler)
}));

vi.mock("../../v1/events/stream", () => ({
  handler: vi.fn()
}));

import { config } from "./stream";
import { handler } from "../../v1/events/stream";
import { injectConsoleOpsOwner } from "../../../../server/middleware/console-ops-identity";
import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";

describe("GET /api/console/events/stream", () => {
  it("exports correct API config for SSE", () => {
    expect(config).toEqual({
      api: {
        externalResolver: true,
        bodyParser: false,
        responseLimit: false
      }
    });
  });

  it("wraps handler with withApiMiddlewares (no idempotency, no audit)", () => {
    expect(withApiMiddlewares).toHaveBeenCalledWith(handler, {
      enableIdempotency: false,
      enableAudit: false
    });
  });

  it("wraps with injectConsoleOpsOwner", () => {
    expect(injectConsoleOpsOwner).toHaveBeenCalled();
  });
});
