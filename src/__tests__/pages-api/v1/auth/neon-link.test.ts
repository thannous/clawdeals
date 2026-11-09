import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), link: vi.fn(), createLink: vi.fn(), touch: vi.fn(), owner: vi.fn(), byEmail: vi.fn(), upsert: vi.fn(), session: vi.fn(), issue: vi.fn(), idempotency: vi.fn(), rate: vi.fn() }));
vi.mock("../../../../server/auth/external-identity", () => ({ verifyExternalAuthIdentity: mocks.identity }));
vi.mock("../../../../server/services/owner-auth-links", () => ({ getOwnerLinkByAuthIdentity: mocks.link, createOwnerAuthLink: mocks.createLink, touchOwnerAuthLinkLogin: mocks.touch }));
vi.mock("../../../../server/services/owners", () => ({ getOwner: mocks.owner, getOwnerByEmail: mocks.byEmail, upsertOwner: mocks.upsert }));
vi.mock("../../../../server/services/owner-sessions", () => ({ getOwnerSessionByTokenHash: mocks.session, markOwnerSessionRevoked: vi.fn() }));
vi.mock("../../../../server/services/owner-session-issue", () => ({ issueTrustedOwnerSession: mocks.issue }));
vi.mock("../../../../server/middleware/auth-stub", () => ({ applyAuthStub: vi.fn() }));
vi.mock("../../../../server/rate-limit/middleware", () => ({ rateLimitMiddleware: mocks.rate }));
vi.mock("../../../../server/idempotency/middleware", () => ({ beginIdempotency: mocks.idempotency, finalizeIdempotency: vi.fn() }));
vi.mock("../../../../server/audit/singleton", () => ({ safeAuditLog: vi.fn() }));
import wrappedHandler, { handler } from "../../../../pages/api/v1/auth/[action]";
import { hashOwnerSessionToken } from "../../../../server/utils/session-tokens";
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const token = `cd_os_${"a".repeat(43)}`;
const owner = { owner_id: id, email: "source@example.test", email_verified_at: "2026-01-01T00:00:00Z", suspended_at: null };
const identity = { provider: "neon", subject: "new-neon-subject", email: owner.email, emailVerifiedAt: "2026-11-05T00:00:00Z", upstreamProvider: "google" };
function request(cookie = true, action = "session:bridge"): any { return { method: "POST", query: { action }, body: { expected_owner_id: id }, headers: { authorization: "Bearer fixture-jwt", host: "localhost:3000", origin: "http://localhost:3000", "x-clawdeals-link": "1", ...(cookie ? { cookie: `cd_owner_session=${token}` } : {}) } }; }
async function bridge(cookie = true) { return handler(request(cookie), null, {}) as Promise<any>; }
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("OWNER_SESSION_SECRET", "fixture-secret-not-real");
  vi.stubEnv("CLAWDEALS_AUTH_BACKEND", "neon"); vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND", "neon"); vi.stubEnv("CLAWDEALS_NEON_ACCOUNT_LINKING", "true");
  mocks.identity.mockResolvedValue(identity); mocks.link.mockResolvedValue(null); mocks.owner.mockResolvedValue(owner); mocks.byEmail.mockResolvedValue(owner);
  mocks.session.mockResolvedValue({ owner_id: id, status: "ACTIVE", expires_at: "2099-01-01T00:00:00Z", revoked_at: null });
  mocks.createLink.mockResolvedValue({ owner_id: id, link_id: "new-link" });
  mocks.issue.mockResolvedValue({ session: { expires_at: "2099-01-01T00:00:00Z" }, set_cookie: "fixture-session" }); mocks.upsert.mockResolvedValue(owner);
});
// Exact security boundary failures cannot be proved by intercepted browser responses.
describe("Neon source-owner dual proof", () => {
  it("does not use email, legacy owner header, body or middleware context as source proof", async () => {
    const req = request(false); req.headers["x-owner-id"] = id; req.body.owner_id = id;
    const result: any = await handler(req, null, { ownerId: id });
    expect(result.body.error.code).toBe("OWNER_LINK_PROOF_REQUIRED"); expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.createLink).not.toHaveBeenCalled();
  });
  it("hashes source cookie, adds a Neon link, preserves owner and source link", async () => {
    expect((await bridge()).body.data.owner_id).toBe(id);
    expect(mocks.session).toHaveBeenCalledWith(hashOwnerSessionToken(token));
    expect(mocks.createLink).toHaveBeenCalledWith(expect.objectContaining({ ownerId: id, authProvider: "neon", supabaseUserId: null }));
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.touch).not.toHaveBeenCalled();
  });
  it.each([{ status: "PENDING" }, { status: "REVOKED" }, { status: "EXPIRED" }, { revoked_at: "2026-01-01" }, { expires_at: "2000-01-01" }, { expires_at: "invalid" }, { owner_id: "bad" }])("rejects invalid proof %j for new links but permits linked Neon renewal", async change => {
    mocks.session.mockResolvedValue({ owner_id: id, status: "ACTIVE", expires_at: "2099-01-01T00:00:00Z", ...change });
    expect((await bridge()).body.error.code).toBe("OWNER_LINK_SESSION_INVALID");
    mocks.link.mockResolvedValue({ owner_id: id }); expect((await bridge()).status).toBe(200);
    expect((await handler(request(true, "neon:link"), null, {})).status).toBe(401);
  });
  it("rejects suspended linked owner even when source cookie is stale", async () => {
    mocks.session.mockResolvedValue(null); mocks.link.mockResolvedValue({ owner_id: id }); mocks.owner.mockResolvedValue({ ...owner, suspended_at: "2026-01-01" });
    expect((await bridge()).status).toBe(403); expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("rejects a missing source owner and source database failure", async () => {
    mocks.owner.mockResolvedValueOnce(null); expect((await bridge()).status).toBe(401);
    mocks.session.mockRejectedValue(Object.assign(new Error("fixture unavailable"), { status: 503 })); mocks.link.mockResolvedValue({ owner_id: id });
    expect((await bridge()).status).toBe(503);
  });
  it("rejects valid proof belonging to another linked owner", async () => {
    mocks.link.mockResolvedValue({ owner_id: other }); expect((await bridge()).status).toBe(409); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("accepts a different verified mailbox only with both proofs and no email conflict", async () => {
    mocks.identity.mockResolvedValue({ ...identity, email: "new@example.test" }); mocks.byEmail.mockResolvedValue(null);
    expect((await bridge()).body.data.email).toBe(owner.email); expect(mocks.upsert).not.toHaveBeenCalled();
    mocks.byEmail.mockResolvedValue({ ...owner, owner_id: other }); expect((await bridge()).status).toBe(409);
  });
  it("rejects unverified provider mailbox", async () => {
    mocks.identity.mockResolvedValue({ ...identity, emailVerifiedAt: null }); expect((await bridge()).status).toBe(409); expect(mocks.createLink).not.toHaveBeenCalled();
  });
  it.each([id, other])("arbitrates insert race against stable owner %s", async racedOwner => {
    mocks.link.mockResolvedValueOnce(null).mockResolvedValueOnce({ owner_id: racedOwner });
    mocks.createLink.mockRejectedValue({ code: "23505" }); expect((await bridge()).status).toBe(racedOwner === id ? 200 : 409);
  });
  it("keeps normal new-owner registration outside dedicated operation", async () => {
    mocks.byEmail.mockResolvedValue(null); expect((await bridge(false)).status).toBe(200); expect(mocks.upsert).toHaveBeenCalled();
  });
});
describe("dedicated operation", () => {
  it("disabled default and rejects origin/header errors before authentication", async () => {
    vi.stubEnv("CLAWDEALS_NEON_ACCOUNT_LINKING", ""); expect((await handler(request(true, "neon:link"), null, {})).status).toBe(404);
    vi.stubEnv("CLAWDEALS_NEON_ACCOUNT_LINKING", "true");
    for (const change of [{ origin: "https://evil.test" }, { origin: undefined }, { "x-clawdeals-link": undefined }]) {
      const req = request(true, "neon:link"); Object.assign(req.headers, change); expect((await handler(req, null, {})).status).toBe(403);
    }
    expect(mocks.identity).not.toHaveBeenCalled();
  });
  it("never creates owner or sends login when old proof is absent", async () => {
    mocks.byEmail.mockResolvedValue(null); expect((await handler(request(false, "neon:link"), null, {})).status).toBe(401);
    expect(mocks.identity).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("shows current owner and preserves cookie/profile on successful and repeated link", async () => {
    const status: any = await handler(request(true, "neon:link-status"), null, {}); expect(status.body.data.owner_id).toBe(id); expect(mocks.identity).not.toHaveBeenCalled();
    expect((await handler(request(true, "neon:link"), null, {})).status).toBe(200);
    mocks.link.mockResolvedValue({ owner_id: id }); expect((await handler(request(true, "neon:link"), null, {})).status).toBe(200);
    expect(mocks.issue).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("requires the displayed owner and Neon identity", async () => {
    const req = request(true, "neon:link"); req.body.expected_owner_id = other; expect((await handler(req, null, {})).status).toBe(409);
    mocks.identity.mockResolvedValue({ ...identity, provider: "supabase" }); expect((await handler(request(true, "neon:link"), null, {})).status).toBe(401);
  });
  it("real middleware wrapper never returns cached success for missing/revoked proof", async () => {
    mocks.idempotency.mockResolvedValue({ kind: "replay", response: { status: 200, body: { data: { linked: true } } } });
    const invoke = async (cookie = true) => {
      const req = request(cookie, "neon:link"); req.url = "/api/v1/auth/neon:link"; req.headers["idempotency-key"] = "same-key";
      const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn(), writableEnded: false }; await wrappedHandler(req, res); return res;
    };
    expect((await invoke()).statusCode).toBe(200); expect((await invoke(false)).statusCode).toBe(401);
    mocks.session.mockResolvedValue({ owner_id: id, status: "REVOKED" }); expect((await invoke()).statusCode).toBe(401);
    expect(mocks.idempotency).not.toHaveBeenCalled(); expect(mocks.rate).toHaveBeenCalledTimes(3);
  });
});
