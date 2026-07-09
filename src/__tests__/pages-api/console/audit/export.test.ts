import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../server/services/audit", () => ({
  exportAuditLogsCsv: vi.fn()
}));

import { handler } from "../../../../pages/api/console/audit/export";
import { exportAuditLogsCsv } from "../../../../server/services/audit";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

const FROM = "2026-02-07T00:00:00Z";
const TO = "2026-02-08T00:00:00Z";

function createMockRes() {
  const headers: Record<string, string> = {};
  let body = "";
  return {
    setHeader: vi.fn((name: string, value: string) => { headers[name] = value; }),
    end: vi.fn((data?: string) => { body = data || ""; }),
    _headers: headers,
    _body: () => body
  };
}

describe("GET /api/console/audit/export", () => {
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

  it("returns 400 when from is missing", async () => {
    const req = { method: "GET", query: { to: TO } };
    const mockRes = createMockRes();
    const result: any = await handler(req, mockRes, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("TIME_RANGE_REQUIRED");
  });

  it("returns 400 when to is missing", async () => {
    const req = { method: "GET", query: { from: FROM } };
    const mockRes = createMockRes();
    const result: any = await handler(req, mockRes, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("TIME_RANGE_REQUIRED");
  });

  it("returns CSV with correct headers", async () => {
    const csvContent = "audit_id,timestamp,actor_type,actor_id,action,entity_type,entity_id,outcome,metadata_hash,request_id\nabc,2026-02-07T12:00:00Z,owner,owner-1,deal.created,deal,deal-1,success,hash123,req-1";
    vi.mocked(exportAuditLogsCsv).mockResolvedValue(csvContent);

    const req = { method: "GET", query: { from: FROM, to: TO } };
    const mockRes = createMockRes();
    await handler(req, mockRes, { ...baseCtx });

    expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
    expect(mockRes.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      expect.stringContaining("attachment; filename=")
    );
    expect(mockRes.end).toHaveBeenCalledWith(csvContent);
  });

  it("sets ctx.auditEvent = 'audit.export_requested'", async () => {
    vi.mocked(exportAuditLogsCsv).mockResolvedValue("header\n");

    const ctx = { ...baseCtx };
    const req = { method: "GET", query: { from: FROM, to: TO } };
    const mockRes = createMockRes();
    await handler(req, mockRes, ctx);

    expect(ctx.auditEvent).toBe("audit.export_requested");
  });

  it("handles service error (500)", async () => {
    vi.mocked(exportAuditLogsCsv).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );

    const req = { method: "GET", query: { from: FROM, to: TO } };
    const mockRes = createMockRes();
    const result: any = await handler(req, mockRes, { ...baseCtx });

    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });

  it("propagates export size errors (413)", async () => {
    vi.mocked(exportAuditLogsCsv).mockRejectedValue(
      Object.assign(new Error("Audit export exceeds the maximum row limit"), {
        status: 413,
        code: "EXPORT_TOO_LARGE",
        details: { max_rows: 10_000 }
      })
    );

    const req = { method: "GET", query: { from: FROM, to: TO } };
    const mockRes = createMockRes();
    const result: any = await handler(req, mockRes, { ...baseCtx });

    expect(result.status).toBe(413);
    expect(result.body.error.code).toBe("EXPORT_TOO_LARGE");
    expect(result.body.error.details).toEqual({ max_rows: 10_000 });
    expect(mockRes.end).not.toHaveBeenCalled();
  });

  it("passes filters to service", async () => {
    vi.mocked(exportAuditLogsCsv).mockResolvedValue("header\n");

    const req = {
      method: "GET",
      query: {
        from: FROM,
        to: TO,
        actor_type: "agent",
        action_name: "deal.created",
        outcome: "success",
        request_id: "req-123"
      }
    };
    const mockRes = createMockRes();
    await handler(req, mockRes, { ...baseCtx });

    expect(exportAuditLogsCsv).toHaveBeenCalledWith(expect.objectContaining({
      from: FROM,
      to: TO,
      actorType: "agent",
      actionName: "deal.created",
      outcome: "success",
      requestId: "req-123"
    }));
  });
});
