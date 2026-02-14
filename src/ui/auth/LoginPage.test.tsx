import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getSession: vi.fn(),
  signInWithOAuth: vi.fn(),
  waitForOwnerSessionReady: vi.fn(),
  router: {
    isReady: true,
    query: { next: "/start" as string | undefined } as Record<string, unknown>
  }
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  )
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    isReady: mocks.router.isReady,
    query: mocks.router.query,
    replace: mocks.replace
  })
}));

vi.mock("./supabase-client", () => ({
  getBrowserSupabaseClient: () => ({
    auth: {
      getSession: mocks.getSession,
      signInWithOAuth: mocks.signInWithOAuth
    }
  })
}));

vi.mock("./ownerSessionReady", () => ({
  waitForOwnerSessionReady: mocks.waitForOwnerSessionReady
}));

import LoginPage from "./LoginPage";

describe("LoginPage Google OAuth", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    mocks.router.isReady = true;
    mocks.router.query = { next: "/start" };
    window.history.replaceState({}, "", "/auth/login?next=/start");
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.waitForOwnerSessionReady.mockResolvedValue(false);
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: "https://oauth.example.test/authorize" },
      error: null
    });
  });

  afterEach(() => {
    cleanup();
    if (originalAppUrl == null) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }
  });

  it("uses manual browser redirect for Google OAuth", async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByTestId("auth-login-google"));

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            redirectTo: expect.stringMatching(/^http:\/\/localhost(?::\d+)?\/auth\/callback$/),
            skipBrowserRedirect: true
          })
        })
      );
    });
    expect(sessionStorage.getItem("clawdeals.auth_next")).toBe("/start");
  });

  it("shows an error when Supabase does not return an OAuth redirect URL", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: null, error: null });
    render(<LoginPage />);

    fireEvent.click(screen.getByTestId("auth-login-google"));

    await waitFor(() => {
      const errorBox = screen.getByTestId("auth-login-error");
      expect(errorBox.textContent || "").toContain("Google OAuth redirect URL is missing.");
    });
  });

  it("uses next from window.location.search when router is not ready", async () => {
    mocks.router.isReady = false;
    mocks.router.query = {};
    window.history.replaceState({}, "", "/auth/login?next=/start");
    render(<LoginPage />);

    fireEvent.click(screen.getByTestId("auth-login-google"));

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            redirectTo: expect.stringMatching(/^http:\/\/localhost(?::\d+)?\/auth\/callback$/),
            skipBrowserRedirect: true
          })
        })
      );
    });
    expect(sessionStorage.getItem("clawdeals.auth_next")).toBe("/start");
  });

  it("keeps default redirect when next is absent and router is not ready", async () => {
    mocks.router.isReady = false;
    mocks.router.query = {};
    window.history.replaceState({}, "", "/auth/login");
    render(<LoginPage />);

    fireEvent.click(screen.getByTestId("auth-login-google"));

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            redirectTo: expect.stringMatching(/^http:\/\/localhost(?::\d+)?\/auth\/callback$/),
            skipBrowserRedirect: true
          })
        })
      );
    });
    expect(sessionStorage.getItem("clawdeals.auth_next")).toBe("/settings/account");
  });

  it("forces localhost callback origin in local dev even when NEXT_PUBLIC_APP_URL is set", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.clawdeals.com";
    render(<LoginPage />);

    fireEvent.click(screen.getByTestId("auth-login-google"));

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            redirectTo: expect.stringMatching(/^http:\/\/localhost(?::\d+)?\/auth\/callback$/),
            skipBrowserRedirect: true
          })
        })
      );
    });
  });
});
