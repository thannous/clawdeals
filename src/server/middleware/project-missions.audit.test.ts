import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ audit: vi.fn(), auth: vi.fn(), rateLimit: vi.fn() }));
vi.mock("./auth-stub", () => ({ applyAuthStub: mocks.auth }));
vi.mock("../rate-limit/middleware", () => ({ rateLimitMiddleware: mocks.rateLimit }));
vi.mock("../audit/singleton", () => ({ safeAuditLog: mocks.audit }));
import { withApiMiddlewares } from "./with-api-middlewares";
import { jsonResponse } from "../http/response";

const missionId = "11111111-1111-4111-8111-111111111111";
function response() {
  const res = { writableEnded: false, statusCode: 0, setHeader: vi.fn(), end: vi.fn(() => { res.writableEnded = true; }) };
  return res;
}
function request(suffix: string) {
  return {
    method: "POST", url: `/api/v1/owner/project-missions${suffix}`,
    headers: { origin: "http://localhost", host: "localhost", "content-type": "application/json", "idempotency-key": missionId, "x-expected-owner-id": missionId },
    query: suffix ? { mission_id: missionId } : {},
    body: { brief: { description: "PRIVATE_HOME_BRIEF", location: { lat: 48.123456, lon: 2.123456 } }, facts: { notes: "PRIVATE_SELLER_ANSWER" } }
  };
}

// Browser assertions cannot inspect a pre-handler audit failure. This guards
// against retaining private project descriptions, precise locations and replies.
describe("project mission audit privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockImplementation(async (_req, ctx) => { ctx.actor = { type: "owner", id: missionId }; ctx.ownerId = missionId; ctx.ownerSessionId = "synthetic-session"; });
    mocks.rateLimit.mockResolvedValue({ status: 200, headers: null, body: null, meta: {} });
    mocks.audit.mockResolvedValue(undefined);
  });

  it.each(["", `/${missionId}/facts`, `/${missionId}/contact`])("keeps only the project identity in audit for %s", async suffix => {
    const req = request(suffix);
    const handler = vi.fn(async (_req, _res, ctx) => {
      expect(ctx.canonicalBody).toContain("PRIVATE_HOME_BRIEF");
      expect(req.body.brief.description).toBe("PRIVATE_HOME_BRIEF");
      return jsonResponse(200, { ok: true });
    });
    await withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.write", enableIdempotency: false })(req, response());
    expect(handler).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledOnce();
    const event = mocks.audit.mock.calls[0][0];
    expect(event.payload).toEqual({ mission_id: suffix ? missionId : null });
    expect(JSON.stringify(event)).not.toMatch(/PRIVATE_HOME_BRIEF|PRIVATE_SELLER_ANSWER|48\.123456|2\.123456/);
  });

  it.each(["authentication", "protection unavailable"])("redacts private inputs on %s before the handler", async failure => {
    if (failure === "authentication") mocks.auth.mockImplementation(async (_req, ctx) => { ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Expired" }; });
    else mocks.rateLimit.mockRejectedValue(new Error("Storage unavailable"));
    const handler = vi.fn();
    const res = response();
    await withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.write", enableIdempotency: false })(request(""), res);
    expect(res.statusCode).toBe(failure === "authentication" ? 401 : 503);
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(JSON.stringify(mocks.audit.mock.calls[0][0])).not.toMatch(/PRIVATE_HOME_BRIEF|PRIVATE_SELLER_ANSWER|48\.123456/);
  });
});
