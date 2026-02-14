import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getSession: vi.fn(),
  signInWithOAuth: vi.fn(),
  waitForOwnerSessionReady: vi.fn()
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
    isReady: true,
    query: { next: "/start" },
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.waitForOwnerSessionReady.mockResolvedValue(false);
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: "https://oauth.example.test/authorize" },
      error: null
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("uses manual browser redirect for Google OAuth", async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByTestId("auth-login-google"));

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "google",
          options: expect.objectContaining({
            redirectTo: expect.stringMatching(/^http:\/\/localhost(?::\d+)?\/auth\/callback\?next=%2Fstart$/),
            skipBrowserRedirect: true
          })
        })
      );
    });
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
});
