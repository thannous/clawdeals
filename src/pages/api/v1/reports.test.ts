import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/reports", () => ({
  createReport: vi.fn()
}));

vi.mock("../../../server/trustscore/context", () => ({
  resolveTrustContext: vi.fn()
}));

import { handler } from "./reports";
import { createReport } from "../../../server/services/reports";
import { resolveTrustContext } from "../../../server/trustscore/context";

const agentId = "c16baf67-7d52-4e2d-8f52-0b6daedb4d4b";
const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const entityId = "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

function baseCtx() {
  return { agentId, ownerId, authError: null } as any;
}

function makeReq(body = {}, headers = {}) {
  return {
    method: "POST",
    headers: { "idempotency-key": "idem-1", ...headers },
    body
  };
}

function validBody(overrides = {}) {
  return {
    entity_type: "deal",
    entity_id: entityId,
    reason_code: "spam",
    free_text: "test report",
    ...overrides
  };
}

describe("POST /v1/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveTrustContext).mockResolvedValue({ trust_score: 50, trust_flags: [], quarantine_applied: false } as any);
  });

  it("returns 405 for non-POST", async () => {
    const req = { method: "GET", headers: {} };
    const result: any = await handler(req, null, baseCtx());
    expect(result.status).toBe(405);
  });

  it("returns 401 on authError", async () => {
    const req = makeReq(validBody());
    const ctx: any = { authError: { status: 401, code: "UNAUTHORIZED", message: "Invalid" } };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 without Idempotency-Key", async () => {
    const req = { method: "POST", headers: {}, body: validBody() };
    const result: any = await handler(req, null, baseCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("Idempotency-Key");
  });

  it("returns 401 without agentId", async () => {
    const req = makeReq(validBody());
    const ctx: any = { agentId: null, ownerId, authError: null };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(401);
  });

  it("returns 400 for invalid entity_type", async () => {
    const result: any = await handler(makeReq(validBody({ entity_type: "invalid" })), null, baseCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("entity_type");
  });

  it("returns 400 for non-UUID entity_id", async () => {
    const result: any = await handler(makeReq(validBody({ entity_id: "not-uuid" })), null, baseCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("entity_id");
  });

  it("returns 400 for invalid reason_code", async () => {
    const result: any = await handler(makeReq(validBody({ reason_code: "invalid" })), null, baseCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("reason_code");
  });

  it("returns 400 for free_text over 500 chars", async () => {
    const result: any = await handler(makeReq(validBody({ free_text: "a".repeat(501) })), null, baseCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("500");
  });

  it("returns 400 without reporter owner_id", async () => {
    const ctx: any = { agentId, ownerId: null, authError: null };
    const result: any = await handler(makeReq(validBody()), null, ctx);
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("owner_id");
  });

  it("returns 201 with report data and sets auditEvent", async () => {
    vi.mocked(createReport).mockResolvedValue({
      report_id: "report-1",
      status: "UNCONFIRMED",
      report_weight: 0.73,
      created_at: "2026-02-05T12:00:00Z"
    } as any);
    const ctx: any = baseCtx();
    const result: any = await handler(makeReq(validBody()), null, ctx);
    expect(result.status).toBe(201);
    expect(result.body.data.report_id).toBe("report-1");
    expect(result.body.data.report_weight).toBe(0.73);
    expect(ctx.auditEvent).toBe("report.created");
  });

  it("returns 409 on duplicate report", async () => {
    vi.mocked(createReport).mockRejectedValue(
      Object.assign(new Error("Duplicate report"), { status: 409, code: "REPORT_DUPLICATE" })
    );
    const result: any = await handler(makeReq(validBody()), null, baseCtx());
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("REPORT_DUPLICATE");
  });
});
