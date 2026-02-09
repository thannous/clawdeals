import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/console-ops-dashboard", () => ({
  getConsoleOpsDashboard: vi.fn(),
  CONSOLE_OPS_DEFAULT_WINDOW_MINUTES: 60,
  CONSOLE_OPS_WINDOW_MINUTES_RANGE: { min: 5, max: 1440 }
}));

import { handler } from "../../../pages/api/console/ops";
import { getConsoleOpsDashboard } from "../../../server/services/console-ops-dashboard";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/ops", () => {
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

  it("validates window_minutes as integer (invalid -> 400)", async () => {
    const req = { method: "GET", query: { window_minutes: "abc" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("validates window_minutes range (too small -> 400)", async () => {
    const req = { method: "GET", query: { window_minutes: "1" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("defaults window_minutes to 60", async () => {
    vi.mocked(getConsoleOpsDashboard).mockResolvedValue({ ok: true } as any);
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(getConsoleOpsDashboard).toHaveBeenCalledWith(expect.objectContaining({ windowMinutes: 60 }));
  });

  it("passes window_minutes to the service", async () => {
    vi.mocked(getConsoleOpsDashboard).mockResolvedValue({ ok: true } as any);
    const req = { method: "GET", query: { window_minutes: "15" } };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(getConsoleOpsDashboard).toHaveBeenCalledWith(expect.objectContaining({ windowMinutes: 15 }));
  });

  it("sets ctx.auditEvent = 'console.ops_dashboard_viewed'", async () => {
    vi.mocked(getConsoleOpsDashboard).mockResolvedValue({ ok: true } as any);
    const ctx = { ...baseCtx };
    const req = { method: "GET", query: {} };
    await handler(req, null, ctx);
    expect(ctx.auditEvent).toBe("console.ops_dashboard_viewed");
  });

  it("returns service payload", async () => {
    vi.mocked(getConsoleOpsDashboard).mockResolvedValue({
      window: { from: "2026-02-09T00:00:00.000Z", to: "2026-02-09T01:00:00.000Z", minutes: 60 },
      sample: { audit_rows: 10, truncated: false, max_rows: 20000 },
      http: { total: 10, status_2xx: 8, status_3xx: 0, status_4xx: 2, status_429: 0, status_5xx: 0 },
      latency: { by_route_group: [] },
      errors: { by_route_group: [] },
      rate_limit: { status_429: 0, rate_429: 0, top_agents: [], unknown_agent_429: 0 },
      queue: { approvals_pending: 1, jobs_pending: 2, job_queues: [] }
    } as any);

    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(result.body.http.total).toBe(10);
    expect(result.body.queue.approvals_pending).toBe(1);
  });

  it("handles service error", async () => {
    vi.mocked(getConsoleOpsDashboard).mockRejectedValue(
      Object.assign(new Error("DB error"), { status: 500, code: "DB_ERROR" })
    );
    const req = { method: "GET", query: {} };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(500);
    expect(result.body.error.code).toBe("DB_ERROR");
  });
});

