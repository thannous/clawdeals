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

  // Browser routes simulate delivery, so only this transport test inspects the
  // actual generated email. The provider fetch is stubbed; no mail is sent.
  it.each([
    ["/fr/my/missions/new?query=velo&price_max=83.25", "/fr/auth/verify", "/fr/my/missions/new?query=velo&price_max=83.25"],
    ["/es/settings/profile", "/es/auth/verify", "/es/settings/profile"],
    ["https://outside.example/my/missions", "/auth/verify", "/settings/account"],
    ["//outside.example/my/missions", "/auth/verify", "/settings/account"],
    [undefined, "/auth/verify", "/settings/identities"]
  ])("includes only a safe, localized return in the delivered link: %s", async (next, pathname, destination) => {
    process.env.OWNER_LOGIN_EMAIL_PROVIDER = "resend";
    process.env.OWNER_LOGIN_EMAIL_FROM = "Clawdeals <no-reply@example.test>";
    process.env.RESEND_API_KEY = "synthetic-test-key";
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "synthetic-message" }) });
    const result = await sendOwnerLoginMagicLinkEmail({
      email: "owner@example.test", sessionId: VALID_SESSION_ID, token: VALID_TOKEN, next
    });
    const url = new URL(result.verify_url);
    expect(url.origin).toBe("https://app.example.test");
    expect(url.pathname).toBe(pathname);
    expect(url.searchParams.get("next")).toBe(destination);
    expect(url.searchParams.get("session_id")).toBe(VALID_SESSION_ID);
    expect(url.searchParams.get("token")).toBe(VALID_TOKEN);
    const email = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(email.text).toContain(result.verify_url);
    expect(email.html).toContain(`href="${result.verify_url}"`);
  });
});
