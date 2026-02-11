import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendOwnerLoginMagicLinkEmail } from "./owner-login-email";

const VALID_SESSION_ID = "22222222-2222-4222-8222-222222222222";
const VALID_TOKEN = `cd_os_${"a".repeat(43)}`;

describe("owner-login-email", () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
    vi.stubGlobal("fetch", fetchMock as any);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("skips delivery in non-production when provider is not configured", async () => {
    (process.env as any).NODE_ENV = "development";
    delete process.env.OWNER_LOGIN_EMAIL_PROVIDER;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendOwnerLoginMagicLinkEmail({
      email: "owner@example.com",
      sessionId: VALID_SESSION_ID,
      token: VALID_TOKEN,
      expiresAt: "2026-02-20T00:00:00Z"
    });

    expect(result).toEqual({
      provider: "none",
      delivered: false,
      skipped: true,
      verify_url: expect.stringContaining("/auth/verify?session_id="),
      message_id: null
    });
    expect(result.verify_url).toContain("https://app.example.test/auth/verify");
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("fails in production when provider is not configured", async () => {
    (process.env as any).NODE_ENV = "production";
    delete process.env.OWNER_LOGIN_EMAIL_PROVIDER;

    await expect(
      sendOwnerLoginMagicLinkEmail({
        email: "owner@example.com",
        sessionId: VALID_SESSION_ID,
        token: VALID_TOKEN
      })
    ).rejects.toMatchObject({
      status: 503,
      code: "EMAIL_PROVIDER_NOT_CONFIGURED"
    });
  });

  it("sends owner login email with resend provider", async () => {
    (process.env as any).NODE_ENV = "production";
    process.env.OWNER_LOGIN_EMAIL_PROVIDER = "resend";
    process.env.OWNER_LOGIN_EMAIL_FROM = "Clawdeals <no-reply@example.com>";
    process.env.RESEND_API_KEY = "test-api-key";

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "mail_123" })
    } as any);

    const result = await sendOwnerLoginMagicLinkEmail({
      email: "owner@example.com",
      sessionId: VALID_SESSION_ID,
      token: VALID_TOKEN,
      expiresAt: "2026-02-20T00:00:00Z"
    });

    expect(result).toEqual({
      provider: "resend",
      delivered: true,
      skipped: false,
      verify_url: expect.stringContaining("/auth/verify?session_id="),
      message_id: "mail_123"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["owner@example.com"]);
    expect(body.from).toBe("Clawdeals <no-reply@example.com>");
    expect(body.subject).toContain("magic login link");
  });

  it("maps resend API failures to EMAIL_SEND_FAILED", async () => {
    (process.env as any).NODE_ENV = "production";
    process.env.OWNER_LOGIN_EMAIL_PROVIDER = "resend";
    process.env.OWNER_LOGIN_EMAIL_FROM = "Clawdeals <no-reply@example.com>";
    process.env.RESEND_API_KEY = "test-api-key";

    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "invalid from" })
    } as any);

    await expect(
      sendOwnerLoginMagicLinkEmail({
        email: "owner@example.com",
        sessionId: VALID_SESSION_ID,
        token: VALID_TOKEN
      })
    ).rejects.toMatchObject({
      status: 503,
      code: "EMAIL_SEND_FAILED"
    });
  });

  it("uses explicit appUrl when provided", async () => {
    (process.env as any).NODE_ENV = "development";
    delete process.env.OWNER_LOGIN_EMAIL_PROVIDER;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendOwnerLoginMagicLinkEmail({
      email: "owner@example.com",
      sessionId: VALID_SESSION_ID,
      token: VALID_TOKEN,
      appUrl: "http://localhost:3000"
    });

    expect(result.verify_url).toContain("http://localhost:3000/auth/verify");
    warnSpy.mockRestore();
  });
});
