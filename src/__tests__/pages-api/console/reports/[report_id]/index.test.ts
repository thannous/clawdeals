import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/report-moderation", () => ({
  getReport: vi.fn(),
  resolveReport: vi.fn()
}));

import { handler } from "../../../../../pages/api/console/reports/[report_id]/index";
import { getReport, resolveReport } from "../../../../../server/services/report-moderation";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("/api/console/reports/[report_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST: rejects non-string reason values -> 400", async () => {
    const req = {
      method: "POST",
      query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "confirm", reason: { nope: true } }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toMatch(/reason/i);
  });
});
