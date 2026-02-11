import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("../../../../server/services/owner-login", () => ({
  startOwnerLogin: vi.fn(),
  confirmOwnerLogin: vi.fn()
}));

vi.mock("../../../../server/services/owner-login-email", () => ({
  sendOwnerLoginMagicLinkEmail: vi.fn()
}));

vi.mock("../../../../server/db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

vi.mock("../../../../server/services/owner-auth-links", () => ({
  getOwnerLinkBySupabaseUserId: vi.fn(),
  createOwnerLink: vi.fn(),
  touchOwnerLinkLogin: vi.fn()
}));

vi.mock("../../../../server/services/owner-session-issue", () => ({
  issueTrustedOwnerSession: vi.fn()
}));

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn(),
  getOwnerByEmail: vi.fn(),
  upsertOwner: vi.fn()
}));

vi.mock("../../../../server/services/owner-sessions", () => ({
  getOwnerSessionByTokenHash: vi.fn(),
  markOwnerSessionRevoked: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/auth/[action]";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";
import { confirmOwnerLogin, startOwnerLogin } from "../../../../server/services/owner-login";
import { sendOwnerLoginMagicLinkEmail } from "../../../../server/services/owner-login-email";
import {
  createOwnerLink,
  getOwnerLinkBySupabaseUserId,
  touchOwnerLinkLogin
} from "../../../../server/services/owner-auth-links";
import { issueTrustedOwnerSession } from "../../../../server/services/owner-session-issue";
import { getOwner, getOwnerByEmail, upsertOwner } from "../../../../server/services/owners";

const ownerId = "11111111-1111-4111-8111-111111111111";
const supabaseUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerLinkId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const verifiedAt = "2026-02-12T00:00:00Z";

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

const getSupabaseServiceClientMock = vi.mocked(getSupabaseServiceClient);
const sendOwnerLoginMagicLinkEmailMock = vi.mocked(sendOwnerLoginMagicLinkEmail);
const getOwnerLinkBySupabaseUserIdMock = vi.mocked(getOwnerLinkBySupabaseUserId);
const createOwnerLinkMock = vi.mocked(createOwnerLink);
const touchOwnerLinkLoginMock = vi.mocked(touchOwnerLinkLogin);
const issueTrustedOwnerSessionMock = vi.mocked(issueTrustedOwnerSession);
const getOwnerMock = vi.mocked(getOwner);
const getOwnerByEmailMock = vi.mocked(getOwnerByEmail);
const upsertOwnerMock = vi.mocked(upsertOwner);

const supabaseGetUserMock = vi.fn();

describe("POST /v1/auth/[action]", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getSupabaseServiceClientMock.mockReturnValue({
      auth: {
        getUser: supabaseGetUserMock
      }
    } as any);

    sendOwnerLoginMagicLinkEmailMock.mockResolvedValue({
      provider: "none",
      delivered: false,
      skipped: true,
      verify_url: "http://localhost:3000/auth/verify",
      message_id: null
    } as any);

    supabaseGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: supabaseUserId,
          email: "owner@example.com",
          email_confirmed_at: verifiedAt,
          app_metadata: { provider: "google" },
          identities: [{ provider: "google", identity_data: { email_verified: true } }]
        }
      },
      error: null
    } as any);

    getOwnerLinkBySupabaseUserIdMock.mockResolvedValue(null);
    createOwnerLinkMock.mockResolvedValue({ link_id: ownerLinkId, owner_id: ownerId } as any);
    touchOwnerLinkLoginMock.mockResolvedValue({ link_id: ownerLinkId, owner_id: ownerId } as any);

    getOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email: "owner@example.com",
      email_verified_at: verifiedAt,
      phone_e164: null,
      phone_verified_at: null,
      suspended_at: null
    } as any);
    getOwnerByEmailMock.mockResolvedValue(null);
    upsertOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email: "owner@example.com",
      email_verified_at: verifiedAt,
      phone_e164: null,
      phone_verified_at: null,
      suspended_at: null
    } as any);

    issueTrustedOwnerSessionMock.mockResolvedValue({
      session: { expires_at: "2026-02-20T00:00:00Z" },
      set_cookie: "cd_owner_session=cd_os_test; Path=/; HttpOnly"
    } as any);
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
    expect(sendOwnerLoginMagicLinkEmail).toHaveBeenCalled();
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
    expect(sendOwnerLoginMagicLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        sessionId: "22222222-2222-4222-8222-222222222222",
        token: "cd_os_test"
      })
    );
    expect(ctx.auditEvent).toBe("owner.login_magic_link_sent");
  });

  it("returns provider failure when login email delivery fails", async () => {
    vi.mocked(startOwnerLogin).mockResolvedValue({
      owner: { owner_id: ownerId },
      session: { session_id: "22222222-2222-4222-8222-222222222222", expires_at: "2026-02-12T00:00:00Z" },
      session_token: "cd_os_test"
    } as any);
    sendOwnerLoginMagicLinkEmailMock.mockRejectedValueOnce(
      Object.assign(new Error("Failed to send owner login email"), { status: 503, code: "EMAIL_SEND_FAILED" })
    );

    const result: any = await handler(
      makeReq("login:start", { email: "test@example.com" }),
      null,
      makeCtx()
    );

    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("EMAIL_SEND_FAILED");
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

  it("requires bearer authorization for session:bridge", async () => {
    const missingAuthResult: any = await handler(makeReq("session:bridge", {}), null, makeCtx());
    expect(missingAuthResult.status).toBe(401);
    expect(missingAuthResult.body.error.code).toBe("UNAUTHORIZED");

    const bodyTokenResult: any = await handler(
      makeReq("session:bridge", { access_token: "supabase-token" }),
      null,
      makeCtx()
    );
    expect(bodyTokenResult.status).toBe(401);
    expect(bodyTokenResult.body.error.code).toBe("UNAUTHORIZED");
    expect(supabaseGetUserMock).not.toHaveBeenCalled();
  });

  it("rejects invalid Supabase token for session:bridge", async () => {
    supabaseGetUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid jwt" } } as any);

    const result: any = await handler(
      makeReq("session:bridge", {}, { authorization: "Bearer supabase-token" }),
      null,
      makeCtx()
    );

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("bridges session when owner link already exists", async () => {
    getOwnerLinkBySupabaseUserIdMock.mockResolvedValue({
      link_id: ownerLinkId,
      owner_id: ownerId
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(
      makeReq("session:bridge", {}, { authorization: "Bearer supabase-token" }),
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(result.headers["Set-Cookie"]).toContain("cd_owner_session=");
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(result.body.data.auth_provider).toBe("google");
    expect(touchOwnerLinkLogin).toHaveBeenCalled();
    expect(createOwnerLink).not.toHaveBeenCalled();
    expect(ctx.auditEvent).toBe("owner.login_bridged");
  });

  it("preserves existing owner email verification when Supabase omits it for linked login", async () => {
    supabaseGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: supabaseUserId,
          email: "owner@example.com",
          email_confirmed_at: null,
          app_metadata: { provider: "google" },
          identities: []
        }
      },
      error: null
    } as any);
    getOwnerLinkBySupabaseUserIdMock.mockResolvedValue({
      link_id: ownerLinkId,
      owner_id: ownerId
    } as any);
    getOwnerMock.mockResolvedValue({
      owner_id: ownerId,
      email: "owner@example.com",
      email_verified_at: verifiedAt,
      phone_e164: null,
      phone_verified_at: null,
      suspended_at: null
    } as any);

    const result: any = await handler(
      makeReq("session:bridge", {}, { authorization: "Bearer supabase-token" }),
      null,
      makeCtx()
    );

    expect(result.status).toBe(200);
    expect(upsertOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        emailVerifiedAt: verifiedAt
      })
    );
    expect(touchOwnerLinkLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseUserId,
        emailVerifiedAt: verifiedAt
      })
    );
  });

  it("auto-links by verified email when owner exists", async () => {
    getOwnerByEmailMock.mockResolvedValue({
      owner_id: ownerId,
      email: "owner@example.com",
      email_verified_at: null,
      phone_e164: null,
      phone_verified_at: null
    } as any);

    const ctx = makeCtx();
    const result: any = await handler(
      makeReq("session:bridge", {}, { authorization: "Bearer supabase-token" }),
      null,
      ctx
    );

    expect(result.status).toBe(200);
    expect(result.body.data.owner_id).toBe(ownerId);
    expect(createOwnerLink).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        supabaseUserId,
        email: "owner@example.com",
        emailVerifiedAt: expect.stringContaining("2026-02-12T00:00:00")
      })
    );
    expect(ctx.auditEvent).toBe("owner.linked_by_verified_email");
  });

  it("returns conflict when owner exists on unverified email", async () => {
    supabaseGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: supabaseUserId,
          email: "owner@example.com",
          email_confirmed_at: null,
          app_metadata: { provider: "email" },
          identities: []
        }
      },
      error: null
    } as any);

    getOwnerByEmailMock.mockResolvedValue({
      owner_id: ownerId,
      email: "owner@example.com",
      email_verified_at: null
    } as any);

    const result: any = await handler(
      makeReq("session:bridge", {}, { authorization: "Bearer supabase-token" }),
      null,
      makeCtx()
    );

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("OWNER_EMAIL_LINK_CONFLICT");
    expect(createOwnerLink).not.toHaveBeenCalled();
    expect(issueTrustedOwnerSession).not.toHaveBeenCalled();
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
