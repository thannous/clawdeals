import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), begin: vi.fn(), finalize: vi.fn() }));
vi.mock("./auth-stub", () => ({ applyAuthStub: mocks.auth }));
vi.mock("../rate-limit/middleware", () => ({ rateLimitMiddleware: mocks.rate }));
vi.mock("../idempotency/middleware", () => ({ beginIdempotency: mocks.begin, finalizeIdempotency: mocks.finalize }));
import { withApiMiddlewares } from "./with-api-middlewares";

const ownerId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
function request() {
  return { method: "POST", url: `/api/v1/owner/project-missions/${ownerId}/contact`, query: { mission_id: ownerId, action: "contact" },
    headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json", "x-expected-owner-id": ownerId, "idempotency-key": otherId },
    body: { expected_version: 2, configuration_id: "economy", confirmed_preview: true } };
}
function response() {
  const res = { writableEnded: false, statusCode: 0, setHeader: vi.fn(), end: vi.fn((_body?: string) => { res.writableEnded = true; }) };
  return res;
}

// A replay never enters the API handler. Guards must run before looking up the
// cached response, not only before the first side effect in the handler.
describe("project mission guard before idempotency replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockImplementation(async (_req, ctx) => { ctx.actor = { type: "owner", id: ownerId }; ctx.ownerId = ownerId; ctx.ownerSessionId = "session"; });
    mocks.rate.mockResolvedValue({ status: 200, body: null, headers: null });
    mocks.begin.mockResolvedValue({ action: "replay", response: { status: 200, body: { private_mission: true }, headers: {} } });
  });
  it.each(["identity", "csrf", "session", "content type"])("rejects %s drift before either protection store", async reason => {
    const req = request();
    if (reason === "identity") req.headers["x-expected-owner-id"] = otherId;
    if (reason === "csrf") req.headers.origin = "https://foreign.example";
    if (reason === "content type") req.headers["content-type"] = "text/plain";
    if (reason === "session") mocks.auth.mockImplementation(async (_req, ctx) => { ctx.actor = { type: "owner" }; ctx.ownerId = ownerId; });
    const res = response();
    const handler = vi.fn();
    await withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.write", enableAudit: false })(req, res);
    expect(res.statusCode).toBe(reason === "session" ? 401 : reason === "content type" ? 415 : 403);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });
  it("allows a same-owner same-origin replay after the guard", async () => {
    const res = response();
    const handler = vi.fn();
    await withApiMiddlewares(handler, { requireOwner: true, routeGroup: "owner.missions.write", enableAudit: false })(request(), res);
    expect(res.statusCode).toBe(200);
    expect(mocks.begin).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });
});
