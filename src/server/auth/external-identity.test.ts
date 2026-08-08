import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: () => ({ auth: { getUser: mocks.getUser } })
}));

import { verifyExternalAuthIdentity } from "./external-identity";

describe("verifyExternalAuthIdentity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    delete process.env.CLAWDEALS_AUTH_BACKEND;
    delete process.env.NEON_AUTH_BASE_URL;
  });

  it("keeps Supabase verification as the default", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "45f6d706-dac8-4fd1-b3cf-155f22d59218",
          email: "Owner@Example.test",
          email_confirmed_at: "2026-08-07T10:00:00.000Z",
          app_metadata: { provider: "email" }
        }
      },
      error: null
    });

    await expect(verifyExternalAuthIdentity({ accessToken: "supabase-token" })).resolves.toEqual({
      provider: "supabase",
      subject: "45f6d706-dac8-4fd1-b3cf-155f22d59218",
      email: "owner@example.test",
      emailVerifiedAt: "2026-08-07T10:00:00.000Z",
      upstreamProvider: "email"
    });
  });

  it("requires the Neon cookie session and matching bearer token", async () => {
    process.env.CLAWDEALS_AUTH_BACKEND = "neon";
    process.env.NEON_AUTH_BASE_URL = "https://auth.example.test/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          session: { token: "neon-session-token" },
          user: { id: "opaque-neon-subject", email: "owner@example.test", emailVerified: true }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      verifyExternalAuthIdentity({
        accessToken: "neon-session-token",
        cookieHeader: "cd_owner_session=secret; __Secure-neon-auth.session_token=neon-session-token"
      })
    ).resolves.toMatchObject({
      provider: "neon",
      subject: "opaque-neon-subject",
      email: "owner@example.test",
      upstreamProvider: "neon"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.example.test/get-session",
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: "__Secure-neon-auth.session_token=neon-session-token" })
      })
    );

    await expect(
      verifyExternalAuthIdentity({
        accessToken: "wrong",
        cookieHeader: "__Secure-neon-auth.session_token=neon-session-token"
      })
    ).resolves.toBeNull();
  });
});
