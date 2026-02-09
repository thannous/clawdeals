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

  it("rejects non-GET/POST methods", async () => {
    const req = { method: "DELETE", query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when no ownerId", async () => {
    const req = { method: "GET", query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  // --- GET tests ---

  it("GET: validates report_id as UUID", async () => {
    const req = { method: "GET", query: { report_id: "not-a-uuid" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET: returns report on success (200)", async () => {
    const report = {
      report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      status: "UNCONFIRMED",
      entity_type: "deal",
      entity_id: "d1"
    };
    vi.mocked(getReport).mockResolvedValue(report);

    const req = { method: "GET", query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.report).toEqual(report);
  });

  it("GET: returns 404 when null", async () => {
    vi.mocked(getReport).mockResolvedValue(null);

    const req = { method: "GET", query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("NOT_FOUND");
  });

  it("GET: sets ctx.auditEvent = 'report.viewed'", async () => {
    vi.mocked(getReport).mockResolvedValue({ report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" });

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("report.viewed");
  });

  // --- POST tests ---

  it("POST: validates action (must be 'confirm' or 'reject') -> 400", async () => {
    const req = {
      method: "POST",
      query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "invalid" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST: validates reason length (> 1000 -> 400)", async () => {
    const req = {
      method: "POST",
      query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "confirm", reason: "x".repeat(1001) }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST: confirm -> calls resolveReport, returns 200", async () => {
    const resolved = {
      report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      status: "CONFIRMED",
      entity_type: "deal"
    };
    vi.mocked(resolveReport).mockResolvedValue(resolved);

    const req = {
      method: "POST",
      query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "confirm", reason: "Verified spam" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.report).toEqual(resolved);
    expect(resolveReport).toHaveBeenCalledWith({
      reportId: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      action: "confirm",
      reason: "Verified spam",
      resolvedBy: "owner-1"
    });
  });

  it("POST: reject -> calls resolveReport, returns 200", async () => {
    const resolved = {
      report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      status: "REJECTED"
    };
    vi.mocked(resolveReport).mockResolvedValue(resolved);

    const req = {
      method: "POST",
      query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "reject", reason: "False positive" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.report).toEqual(resolved);
  });

  it("POST: returns 409 when resolveReport throws CONFLICT", async () => {
    vi.mocked(resolveReport).mockRejectedValue(
      Object.assign(new Error("Report already resolved or not found"), { status: 409, code: "CONFLICT" })
    );

    const req = {
      method: "POST",
      query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "confirm" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("CONFLICT");
  });

  it("POST: sets ctx.auditEvent = 'report.confirmed' for confirm action", async () => {
    vi.mocked(resolveReport).mockResolvedValue({ report_id: "r1", status: "CONFIRMED" });

    const ctx = { ...baseCtx };
    const req = {
      method: "POST",
      query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "confirm" }
    };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("report.confirmed");
  });

  it("POST: sets ctx.auditEvent = 'report.rejected' for reject action", async () => {
    vi.mocked(resolveReport).mockResolvedValue({ report_id: "r1", status: "REJECTED" });

    const ctx = { ...baseCtx };
    const req = {
      method: "POST",
      query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" },
      body: { action: "reject" }
    };
    await handler(req, null, ctx);

    expect(ctx.auditEvent).toBe("report.rejected");
  });

  it("handles service error", async () => {
    vi.mocked(getReport).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const reqGet = { method: "GET", query: { report_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const resultGet: any = await handler(reqGet, null, { ...baseCtx });
    expect(resultGet.status).toBe(500);
    expect(resultGet.body.error.code).toBe("DB_ERROR");
  });
});
