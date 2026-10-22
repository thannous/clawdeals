import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ audit: vi.fn(), auth: vi.fn(), rateLimit: vi.fn() }));
vi.mock("./auth-stub", () => ({ applyAuthStub: mocks.auth }));
vi.mock("../rate-limit/middleware", () => ({ rateLimitMiddleware: mocks.rateLimit }));
vi.mock("../audit/singleton", () => ({ safeAuditLog: mocks.audit }));
import { withApiMiddlewares } from "./with-api-middlewares";
import { jsonResponse } from "../http/response";

function response() {
  const res = { writableEnded: false, statusCode: 0, setHeader: vi.fn(), end: vi.fn(() => { res.writableEnded = true; }) };
  return res;
}
function request(method: string, suffix = "") {
  return {
    method, url: `/api/v1/owner/listings/11111111-1111-4111-8111-111111111111/passport${suffix}`,
    headers: {}, query: { id: "11111111-1111-4111-8111-111111111111" },
    body: { model: "private draft", checks: { notes: "private seller draft" }, data_base64: "ORIGINAL_PHOTO_WITH_EXIF" }
  };
}
// E2E observes HTTP responses, not the audit writer. These counterexamples
// prevent private originals from being retained before auth or after upload.
describe("passport audit privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockImplementation(async (_req, ctx) => { ctx.actor = { type: "owner", id: "owner" }; ctx.ownerId = "owner"; });
    mocks.rateLimit.mockResolvedValue({ status: 200, headers: null, body: null, meta: {} });
    mocks.audit.mockResolvedValue(undefined);
  });
  it.each([["PUT", ""], ["POST", "/photos"]])("omits private payload after %s success without modifying the request/canonical body", async (method, suffix) => {
    const req = request(method, suffix);
    const handler = vi.fn(async (_req, _res, ctx) => {
      expect(ctx.canonicalBody).toContain("ORIGINAL_PHOTO_WITH_EXIF");
      expect(req.body.data_base64).toBe("ORIGINAL_PHOTO_WITH_EXIF");
      return jsonResponse(200, { data: { ok: true } });
    });
    await withApiMiddlewares(handler, { requireOwner: true, enableIdempotency: false })(req, response());
    expect(handler).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledOnce();
    const event = mocks.audit.mock.calls[0][0];
    expect(event.payload).toEqual({ listing_id: req.query.id });
    expect(JSON.stringify(event)).not.toMatch(/private seller draft|private draft|ORIGINAL_PHOTO_WITH_EXIF/);
  });
  it("omits photo and draft content when authentication rejects before handler", async () => {
    mocks.auth.mockImplementation(async (_req, ctx) => { ctx.authError = { status: 401, code: "UNAUTHORIZED", message: "Expired" }; });
    const handler = vi.fn();
    const res = response();
    await withApiMiddlewares(handler, { requireOwner: true, enableIdempotency: false })(request("POST", "/photos"), res);
    expect(res.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.audit.mock.calls[0][0])).not.toMatch(/private seller draft|private draft|ORIGINAL_PHOTO_WITH_EXIF/);
  });
  it.each([["PUT", ""], ["POST", "/photos"]])("fails closed for %s when upload protection is unavailable", async (method, suffix) => {
    mocks.rateLimit.mockRejectedValue(new Error("Storage unavailable"));
    const handler = vi.fn();
    const res = response();
    await withApiMiddlewares(handler, { requireOwner: true, enableIdempotency: false })(request(method, suffix), res);
    expect(res.statusCode).toBe(503);
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.audit.mock.calls[0][0])).not.toContain("ORIGINAL_PHOTO_WITH_EXIF");
  });
});
