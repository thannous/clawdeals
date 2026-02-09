import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/report-moderation", () => ({
  listReports: vi.fn(),
  decodeReportCursor: vi.fn()
}));

import { handler } from "../../../../pages/api/console/reports/index";
import { listReports, decodeReportCursor } from "../../../../server/services/report-moderation";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-GET methods", async () => {
    const req = { method: "POST", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 on authError", async () => {
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, {
      ...baseCtx,
      authError: { status: 403, code: "FORBIDDEN", message: "Denied" }
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("FORBIDDEN");
  });

  it("returns items and next_cursor", async () => {
    vi.mocked(listReports).mockResolvedValue({
      reports: [
        {
          report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
          status: "UNCONFIRMED",
          entity_type: "deal",
          created_at: "2026-02-05T12:00:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    });

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].report_id).toBe("2b079372-0a7a-4fa1-93e0-1f269ea0f1d7");
    expect(result.body.next_cursor).toBe("cursor-abc");
  });

  it("defaults status to 'UNCONFIRMED' when not provided", async () => {
    vi.mocked(listReports).mockResolvedValue({ reports: [], nextCursor: null });

    const req = { method: "GET", query: {} };
    await handler(req, null, { ...baseCtx });

    expect(listReports).toHaveBeenCalledWith(expect.objectContaining({
      status: "UNCONFIRMED"
    }));
  });

  it("passes filters (status, entity_type, entity_id, reporter_owner_id, reason_code)", async () => {
    vi.mocked(listReports).mockResolvedValue({ reports: [], nextCursor: null });

    const req = {
      method: "GET",
      query: {
        status: "CONFIRMED",
        entity_type: "deal",
        entity_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
        reporter_owner_id: "owner-2",
        reason_code: "spam"
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(listReports).toHaveBeenCalledWith(expect.objectContaining({
      status: "CONFIRMED",
      entityType: "deal",
      entityId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      reporterOwnerId: "owner-2",
      reasonCode: "spam"
    }));
  });

  it("validates entity_id as UUID when provided (invalid -> 400)", async () => {
    const req = { method: "GET", query: { entity_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates limit", async () => {
    const req = { method: "GET", query: { limit: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates limit range", async () => {
    const req = { method: "GET", query: { limit: "0" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);

    const req2 = { method: "GET", query: { limit: "101" } };
    const result2: any = await handler(req2, null, { ...baseCtx });
    expect(result2.status).toBe(400);
  });

  it("validates cursor (decodeReportCursor error -> 400)", async () => {
    vi.mocked(decodeReportCursor).mockReturnValue({ error: "Invalid cursor" } as any);

    const req = { method: "GET", query: { cursor: "bad-cursor" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets ctx.auditEvent = 'reports.listed'", async () => {
    vi.mocked(listReports).mockResolvedValue({ reports: [], nextCursor: null });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: {} };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("reports.listed");
  });

  it("handles service error", async () => {
    vi.mocked(listReports).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});
