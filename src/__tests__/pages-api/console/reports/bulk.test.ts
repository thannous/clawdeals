import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/report-moderation", () => ({
  bulkResolveReports: vi.fn()
}));

import { handler } from "../../../../pages/api/console/reports/bulk";
import { bulkResolveReports } from "../../../../server/services/report-moderation";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("POST /api/console/reports/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-string reason values -> 400", async () => {
    const req = {
      method: "POST",
      query: {},
      body: {
        report_ids: ["2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"],
        action: "confirm",
        reason: 123
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toMatch(/reason/i);
  });
});
