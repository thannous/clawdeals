import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(),
  audit: vi.fn(),
  session: vi.fn(),
  db: vi.fn()
}));
vi.mock("./auth-stub", () => ({ applyAuthStub: mocks.auth }));
vi.mock("../rate-limit/middleware", () => ({ rateLimitMiddleware: mocks.rateLimit }));
vi.mock("../audit/singleton", () => ({ safeAuditLog: mocks.audit }));
vi.mock("../services/connect-sessions", () => ({ getConnectSessionByClaimToken: mocks.session }));
vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: mocks.db }));

import claimEndpoint from "../../pages/api/v1/connect/claims/[claim_token]";
import { createAuditLogger } from "../audit/logger";
import { exportAuditLogsCsv, listAuditLogs } from "../services/audit";
import { jsonResponse } from "../http/response";
import { withApiMiddlewares } from "./with-api-middlewares";

const TOKEN = "cd_claim_private_fixture";
const ENCODED_TOKEN = "%63d_claim_private_fixture";
const AUDIT_PATH = "/api/v1/connect/claims";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const rows: any[] = [];

function response() {
  const res = {
    writableEnded: false,
    statusCode: 0,
    body: null as any,
    setHeader: vi.fn(),
    end: vi.fn((body: string) => {
      res.writableEnded = true;
      res.body = JSON.parse(body);
    })
  };
  return res;
}

function request(url = `${AUDIT_PATH}/${TOKEN}`) {
  return {
    method: "GET",
    url,
    headers: {} as Record<string, string>,
    query: { claim_token: TOKEN } as Record<string, string | string[]>,
    body: undefined as any
  };
}

function expectPrivateAudit(status: number) {
  expect(rows).toHaveLength(1);
  expect(rows[0].request.path).toBe(AUDIT_PATH);
  expect(rows[0].action.path).toBe(AUDIT_PATH);
  expect(rows[0].request.query).toEqual({});
  expect(rows[0].payload).toEqual({});
  expect(rows[0].request.status_code).toBe(status);
  expect(JSON.stringify(rows)).not.toContain(TOKEN);
  expect(JSON.stringify(rows)).not.toContain(ENCODED_TOKEN);
}

// The existing connect E2E checks a successful audit row and the browser suite
// intercepts the endpoint. Neither covers middleware rejection before the
// handler's redaction. Exercise that boundary with the real route and logger;
// only external auth, rate-limit, session and database IO are substituted.
describe("connect claim audit privacy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rows.length = 0;
    mocks.auth.mockResolvedValue(undefined);
    mocks.rateLimit.mockResolvedValue({ status: 200, meta: {} });
    mocks.session.mockResolvedValue({
      session_id: SESSION_ID,
      status: "PENDING_CLAIM",
      requested_agent_name: "Test agent",
      requested_scopes: ["agent:read"],
      expires_at: "2026-10-23T12:10:00.000Z"
    });
    mocks.audit.mockImplementation(createAuditLogger({
      hmacSecret: "local-audit-test-secret",
      write: async (row: any) => { rows.push({ id: "audit-1", ...row }); }
    }));
    const client: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve)
    };
    mocks.db.mockReturnValue(client);
  });

  it.each([
    ["route bucket", `${AUDIT_PATH}/${TOKEN}`, false],
    ["encoded token", `${AUDIT_PATH}/${ENCODED_TOKEN}`, false],
    ["rewritten path", `/v1/connect/claims/${TOKEN}/`, false],
    ["WebMCP bucket", `${AUDIT_PATH}/${TOKEN}`, true]
  ])("omits claim credentials from 429 audit storage and list/export: %s", async (_name, url, webMcp) => {
    const req = request(String(url));
    req.query = { claim_token: [TOKEN, "ignored"], copy: TOKEN, encoded: ENCODED_TOKEN };
    if (webMcp) req.headers["x-client-channel"] = "webmcp";
    const original = structuredClone(req);
    mocks.rateLimit.mockResolvedValue(jsonResponse(429, { error: { code: "RATE_LIMITED" } }, { "Retry-After": "60" }));
    const res = response();

    await claimEndpoint(req, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "60");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(req).toEqual(original);
    expectPrivateAudit(429);
    expect(rows[0].outcome).toBe("BLOCKED");
    const range = { from: "2026-10-23T00:00:00.000Z", to: "2026-10-24T00:00:00.000Z" };
    const listed = await listAuditLogs(range);
    const csv = await exportAuditLogsCsv(range);
    expect(listed.items[0].action).toBe(AUDIT_PATH);
    expect(csv).toContain(AUDIT_PATH);
    expect(JSON.stringify(listed) + csv).not.toContain(TOKEN);
    expect(JSON.stringify(listed) + csv).not.toContain(ENCODED_TOKEN);
  });

  it("keeps protection-store failures closed without retaining claim credentials", async () => {
    mocks.rateLimit.mockRejectedValue(new Error("Protection store unavailable"));
    const res = response();
    await claimEndpoint(request(), res);
    expect(res.statusCode).toBe(503);
    expect(res.body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(mocks.session).not.toHaveBeenCalled();
    expectPrivateAudit(503);
  });

  it("retains token lookup and successful metadata without logging query/body copies", async () => {
    const req = request();
    req.query = { claim_token: [TOKEN, "ignored"], copy: TOKEN };
    req.body = { copy: TOKEN };
    const original = structuredClone(req);
    const res = response();
    await claimEndpoint(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ session_id: SESSION_ID, status: "PENDING_CLAIM" });
    expect(mocks.session).toHaveBeenCalledWith({ claimToken: TOKEN, now: expect.any(Date) });
    expect(req).toEqual(original);
    expectPrivateAudit(200);
    expect(rows[0].action).toMatchObject({ event: "connect.claim_viewed", entity_id: SESSION_ID });
    expect(rows[0].outcome).toBe("SUCCESS");
  });

  it.each([401, 405])("keeps handler rejection semantics and private audit for %s", async (status) => {
    const req = request();
    req.query.copy = TOKEN;
    req.body = { copy: TOKEN };
    if (status === 405) req.method = "POST";
    else mocks.auth.mockImplementation(async (_req, ctx) => {
      ctx.authError = { status: 401, code: "AUTH_ERROR", message: "Invalid credentials" };
    });
    const res = response();
    await claimEndpoint(req, res);
    expect(res.statusCode).toBe(status);
    if (status === 405) expect(res.setHeader).toHaveBeenCalledWith("Allow", "GET");
    else expect(res.body.error.code).toBe("AUTH_ERROR");
    expect(mocks.session).not.toHaveBeenCalled();
    expectPrivateAudit(status);
  });

  it("preserves ordinary audit paths, query and payload on other routes", async () => {
    const req = { ...request("/api/v1/listings/listing-1"), query: { id: "listing-1" }, body: { title: "Chair" } };
    await withApiMiddlewares(async () => jsonResponse(200, { ok: true }), {
      routeGroup: "listings.read", enableIdempotency: false
    })(req, response());
    expect(rows).toHaveLength(1);
    expect(rows[0].request.path).toBe(req.url);
    expect(rows[0].action.path).toBe(req.url);
    expect(rows[0].request.query).toEqual(req.query);
    expect(rows[0].payload).toEqual(req.body);
  });
});
