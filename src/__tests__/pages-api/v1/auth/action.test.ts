import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("../../../../server/services/owner-login", () => ({
  startOwnerLogin: vi.fn(),
  confirmOwnerLogin: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/auth/[action]";
import { confirmOwnerLogin, startOwnerLogin } from "../../../../server/services/owner-login";

const ownerId = "11111111-1111-1111-1111-111111111111";

function makeReq(action: string, body: any = {}, headers: any = {}) {
  return {
    method: "POST",
    headers,
    query: { action },
    body
  } as any;
}

function makeCtx() {
  return {} as any;
}

describe("POST /v1/auth/[action]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-POST methods", async () => {
    const req: any = { method: "GET", query: { action: "login" }, headers: {} };
    const result: any = await handler(req, null, makeCtx());
    expect(result.status).toBe(405);
  });

  it("requires email for login:start", async () => {
    const result: any = await handler(
      makeReq("login:start", {}),
      null,
      makeCtx()
    );
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("email");
  });

  it("allows login:start even when auth middleware reports an error (stale cookie)", async () => {
    vi.mocked(startOwnerLogin).mockResolvedValue({
      owner: { owner_id: ownerId },
      session: { session_id: "22222222-2222-4222-8222-222222222222", expires_at: "2026-02-12T00:00:00Z" },
      session_token: "cd_os_test"
    } as any);

    const ctx: any = {
      authError: { status: 401, code: "SESSION_EXPIRED", message: "Session expired" }
    };

    const result: any = await handler(
      makeReq("login:start", { email: "test@example.com" }),
      null,
      ctx
    );

    expect(result.status).toBe(201);
    expect(result.body.data.session_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(ctx.auditEvent).toBe("owner.login_magic_link_sent");
  });

  it("starts login and echoes token in non-prod", async () => {
    vi.mocked(startOwnerLogin).mockResolvedValue({
      owner: { owner_id: ownerId },
      session: { session_id: "22222222-2222-4222-8222-222222222222", expires_at: "2026-02-12T00:00:00Z" },
      session_token: "cd_os_test"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(
      makeReq("login:start", { email: "test@example.com" }),
      null,
      ctx
    );

    expect(result.status).toBe(201);
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(result.body.data.session_id).toBe("22222222-2222-4222-8222-222222222222");
    expect(result.body.data.session_token).toBe("cd_os_test");
    expect(ctx.auditEvent).toBe("owner.login_magic_link_sent");
  });

  it("confirms login and sets session cookie", async () => {
    vi.mocked(confirmOwnerLogin).mockResolvedValue({
      owner: { owner_id: ownerId },
      session: { session_id: "22222222-2222-4222-8222-222222222222", expires_at: "2026-02-12T00:00:00Z" },
      set_cookie: "cd_owner_session=cd_os_test; Path=/; HttpOnly"
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(
      makeReq("login:confirm", { session_id: "22222222-2222-4222-8222-222222222222", token: "cd_os_test" }),
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(result.headers["Set-Cookie"]).toContain("cd_owner_session=");
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(confirmOwnerLogin).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "22222222-2222-4222-8222-222222222222",
      token: "cd_os_test",
      cookieSecure: undefined
    }));
    expect(ctx.auditEvent).toBe("owner.login_completed");
  });

  it("clears session cookie on logout", async () => {
    const result: any = await handler(makeReq("logout"), null, makeCtx());

    expect(result.status).toBe(200);
    expect(result.headers["Set-Cookie"]).toContain("Max-Age=0");
    expect(result.body.data.ok).toBe(true);
  });

  it("returns 404 for unknown action", async () => {
    const result: any = await handler(
      makeReq("unknown", {}, { "idempotency-key": "idemp-3" }),
      null,
      makeCtx()
    );
    expect(result.status).toBe(404);
  });
});
