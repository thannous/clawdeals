import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./owners", () => ({
  getOwner: vi.fn(),
  getOwnerByEmail: vi.fn(),
  upsertOwner: vi.fn(),
  setOwnerVerified: vi.fn()
}));

vi.mock("./owner-sessions", () => ({
  createOwnerSession: vi.fn(),
  getOwnerSessionById: vi.fn(),
  incrementOwnerSessionAttempt: vi.fn(),
  markOwnerSessionActive: vi.fn(),
  markOwnerSessionExpired: vi.fn(),
  markOwnerSessionRevoked: vi.fn(),
  touchOwnerSession: vi.fn()
}));

import { getOwner, getOwnerByEmail } from "./owners";
import {
  createOwnerSession,
  getOwnerSessionById,
  incrementOwnerSessionAttempt,
  markOwnerSessionActive,
  markOwnerSessionExpired,
  markOwnerSessionRevoked,
  touchOwnerSession
} from "./owner-sessions";
import { buildOwnerSessionCookie } from "../auth/session-cookie";
import { hashOwnerSessionToken } from "../utils/session-tokens";
import { confirmOwnerLogin, startOwnerLogin } from "./owner-login";

describe("owner-login", () => {
  const TOKEN_VALID = `cd_os_${"a".repeat(43)}`;
  const TOKEN_OTHER = `cd_os_${"b".repeat(43)}`;
  const TOKEN_WRONG = `cd_os_${"c".repeat(43)}`;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OWNER_SESSION_SECRET = "test-secret";
    process.env = { ...process.env, NODE_ENV: "development" };
    delete process.env.OWNER_SESSION_COOKIE_SECURE;
    delete process.env.OWNER_SESSION_COOKIE_SAMESITE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("starts an owner session and returns token", async () => {
    const owner = { owner_id: "owner-1", email: "test@example.com", suspended_at: null };
    vi.mocked(getOwnerByEmail).mockResolvedValue(owner as any);
    vi.mocked(createOwnerSession).mockResolvedValue({ session_id: "sess-1" } as any);

    const now = new Date("2026-02-11T10:00:00Z");
    const result = await startOwnerLogin({ email: "Test@Example.com", now });

    expect(result.owner).toBe(owner);
    expect(result.session_token.startsWith("cd_os_")).toBe(true);
    expect(createOwnerSession).toHaveBeenCalledWith(expect.objectContaining({ ownerId: "owner-1" }));
  });

  it("blocks start when owner is suspended", async () => {
    vi.mocked(getOwnerByEmail).mockResolvedValue({ owner_id: "owner-1", suspended_at: "2026-02-10T00:00:00Z" } as any);

    await expect(startOwnerLogin({ email: "test@example.com" })).rejects.toMatchObject({
      status: 403,
      code: "OWNER_SUSPENDED"
    });
  });

  it("increments attempts and returns remaining attempts for invalid token", async () => {
    const token = TOKEN_VALID;
    const session = {
      session_id: "sess-1",
      owner_id: "owner-1",
      status: "PENDING",
      token_hash: hashOwnerSessionToken(TOKEN_OTHER),
      attempt_count: 1,
      max_attempts: 3,
      expires_at: "2026-02-12T00:00:00Z"
    };

    vi.mocked(getOwnerSessionById).mockResolvedValue(session as any);
    vi.mocked(incrementOwnerSessionAttempt).mockResolvedValue({ ...session, attempt_count: 2 } as any);

    await expect(confirmOwnerLogin({ sessionId: "sess-1", token })).rejects.toMatchObject({
      status: 400,
      code: "INVALID_SESSION_TOKEN",
      details: { remaining_attempts: 1 }
    });

    expect(incrementOwnerSessionAttempt).toHaveBeenCalledWith("sess-1", 2, expect.any(Date));
  });

  it("locks out after max attempts", async () => {
    const session = {
      session_id: "sess-1",
      owner_id: "owner-1",
      status: "PENDING",
      token_hash: hashOwnerSessionToken(TOKEN_OTHER),
      attempt_count: 0,
      max_attempts: 1,
      expires_at: "2026-02-12T00:00:00Z"
    };

    vi.mocked(getOwnerSessionById).mockResolvedValue(session as any);
    vi.mocked(incrementOwnerSessionAttempt).mockResolvedValue({ ...session, attempt_count: 1 } as any);

    await expect(confirmOwnerLogin({ sessionId: "sess-1", token: TOKEN_WRONG })).rejects.toMatchObject({
      status: 429,
      code: "SESSION_LOCKED"
    });
  });

  it("marks expired sessions and returns 410", async () => {
    const session = {
      session_id: "sess-1",
      owner_id: "owner-1",
      status: "PENDING",
      token_hash: hashOwnerSessionToken(TOKEN_VALID),
      attempt_count: 0,
      max_attempts: 5,
      expires_at: "2026-02-10T00:00:00Z"
    };

    vi.mocked(getOwnerSessionById).mockResolvedValue(session as any);

    await expect(
      confirmOwnerLogin({ sessionId: "sess-1", token: TOKEN_VALID, now: new Date("2026-02-11T00:00:00Z") })
    ).rejects.toMatchObject({ status: 410, code: "SESSION_EXPIRED" });

    expect(markOwnerSessionExpired).toHaveBeenCalledWith("sess-1", expect.any(Date));
  });

  it("revokes session when owner is suspended on confirm", async () => {
    const token = TOKEN_VALID;
    const session = {
      session_id: "sess-1",
      owner_id: "owner-1",
      status: "PENDING",
      token_hash: hashOwnerSessionToken(token),
      attempt_count: 0,
      max_attempts: 5,
      expires_at: "2026-02-12T00:00:00Z"
    };

    vi.mocked(getOwnerSessionById).mockResolvedValue(session as any);
    vi.mocked(getOwner).mockResolvedValue({ owner_id: "owner-1", suspended_at: "2026-02-10T00:00:00Z" } as any);

    await expect(confirmOwnerLogin({ sessionId: "sess-1", token })).rejects.toMatchObject({
      status: 403,
      code: "OWNER_SUSPENDED"
    });

    expect(markOwnerSessionRevoked).toHaveBeenCalledWith("sess-1", expect.any(Date));
  });

  it("confirms a pending session and marks it active", async () => {
    const token = TOKEN_VALID;
    const session = {
      session_id: "sess-1",
      owner_id: "owner-1",
      status: "PENDING",
      token_hash: hashOwnerSessionToken(token),
      attempt_count: 0,
      max_attempts: 5,
      expires_at: "2026-02-12T00:00:00Z"
    };
    const owner = { owner_id: "owner-1", suspended_at: null, email_verified_at: "2026-02-01T00:00:00Z" };

    vi.mocked(getOwnerSessionById).mockResolvedValue(session as any);
    vi.mocked(getOwner).mockResolvedValue(owner as any);
    vi.mocked(markOwnerSessionActive).mockResolvedValue({ ...session, status: "ACTIVE" } as any);

    const result = await confirmOwnerLogin({ sessionId: "sess-1", token });

    expect(markOwnerSessionActive).toHaveBeenCalledWith("sess-1", expect.any(Date));
    expect(result.owner).toBe(owner);
    expect(result.set_cookie).toContain(`cd_owner_session=${TOKEN_VALID}`);
  });

  it("touches active sessions on confirm", async () => {
    const token = TOKEN_VALID;
    const session = {
      session_id: "sess-1",
      owner_id: "owner-1",
      status: "ACTIVE",
      token_hash: hashOwnerSessionToken(token),
      attempt_count: 0,
      max_attempts: 5,
      expires_at: "2026-02-12T00:00:00Z"
    };
    const owner = { owner_id: "owner-1", suspended_at: null, email_verified_at: "2026-02-01T00:00:00Z" };

    vi.mocked(getOwnerSessionById).mockResolvedValue(session as any);
    vi.mocked(getOwner).mockResolvedValue(owner as any);
    vi.mocked(touchOwnerSession).mockResolvedValue({ ...session, last_used_at: "2026-02-11T00:00:00Z" } as any);

    await confirmOwnerLogin({ sessionId: "sess-1", token });

    expect(touchOwnerSession).toHaveBeenCalledWith("sess-1", expect.any(Date));
  });

  it("builds dev cookie without Secure and with SameSite=Lax", () => {
    const cookie = buildOwnerSessionCookie({
      token: TOKEN_VALID,
      expiresAt: new Date("2026-02-12T00:00:00Z")
    });

    expect(cookie).toContain(`cd_owner_session=${TOKEN_VALID}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie.includes("Secure")).toBe(false);
  });
});
