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
});
