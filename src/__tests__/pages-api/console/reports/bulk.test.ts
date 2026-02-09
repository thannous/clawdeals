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

  it("rejects non-POST methods", async () => {
    const req = { method: "GET", query: {}, body: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "POST", query: {}, body: {} };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 on authError", async () => {
    const req = { method: "POST", query: {}, body: {} };
    const result: any = await handler(req, null, {
      ...baseCtx,
      authError: { status: 403, code: "FORBIDDEN", message: "Denied" }
    });
    expect(result.status).toBe(403);
  });

  it("validates report_ids is an array", async () => {
    const req = { method: "POST", query: {}, body: { report_ids: "not-array", action: "confirm" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates report_ids length (empty -> 400)", async () => {
    const req = { method: "POST", query: {}, body: { report_ids: [], action: "confirm" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates report_ids length (> 100 -> 400)", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `2b079372-0a7a-4fa1-93e0-1f269ea0f${String(i).padStart(3, "0")}`);
    const req = { method: "POST", query: {}, body: { report_ids: ids, action: "confirm" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates each report_id is a UUID", async () => {
    const req = {
      method: "POST",
      query: {},
      body: {
        report_ids: ["not-a-uuid"],
        action: "confirm"
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates action", async () => {
    const req = {
      method: "POST",
      query: {},
      body: {
        report_ids: ["2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"],
        action: "invalid"
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates reason length (> 1000 -> 400)", async () => {
    const req = {
      method: "POST",
      query: {},
      body: {
        report_ids: ["2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"],
        action: "confirm",
        reason: "x".repeat(1001)
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
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

  it("returns resolved and skipped on success", async () => {
    vi.mocked(bulkResolveReports).mockResolvedValue({
      resolved: ["2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"],
      skipped: ["3c089483-1b8b-5fb2-a4f1-2f37aea1f2e8"]
    });

    const req = {
      method: "POST",
      query: {},
      body: {
        report_ids: [
          "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
          "3c089483-1b8b-5fb2-a4f1-2f37aea1f2e8"
        ],
        action: "reject",
        reason: "False positives"
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.resolved).toEqual(["2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"]);
    expect(result.body.skipped).toEqual(["3c089483-1b8b-5fb2-a4f1-2f37aea1f2e8"]);
    expect(bulkResolveReports).toHaveBeenCalledWith({
      reportIds: [
        "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
        "3c089483-1b8b-5fb2-a4f1-2f37aea1f2e8"
      ],
      action: "reject",
      reason: "False positives",
      resolvedBy: "owner-1"
    });
  });

  it("sets ctx.auditEvent = 'reports.bulk_resolved'", async () => {
    vi.mocked(bulkResolveReports).mockResolvedValue({ resolved: [], skipped: [] });

    const ctx = { ...baseCtx };
    const req = {
      method: "POST",
      query: {},
      body: {
        report_ids: ["2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"],
        action: "confirm"
      }
    };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("reports.bulk_resolved");
  });

  it("handles service error", async () => {
    vi.mocked(bulkResolveReports).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = {
      method: "POST",
      query: {},
      body: {
        report_ids: ["2b079372-0a7a-4fa1-93e0-1f269ea0f1d7"],
        action: "confirm"
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});
