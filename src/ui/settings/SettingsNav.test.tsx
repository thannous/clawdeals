import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getBrowserSupabaseClient: vi.fn(),
  signOut: vi.fn(),
  clearStoredOwnerAuth: vi.fn(),
  clearStoredApiKey: vi.fn(),
  clearStoredLastEventId: vi.fn()
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  )
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    locale: "en"
  })
}));

vi.mock("../auth/ownerAuth", () => ({
  clearStoredOwnerAuth: mocks.clearStoredOwnerAuth
}));

vi.mock("../auth/supabase-client", () => ({
  getBrowserSupabaseClient: mocks.getBrowserSupabaseClient
}));

vi.mock("../developer/storage", () => ({
  clearStoredApiKey: mocks.clearStoredApiKey,
  clearStoredLastEventId: mocks.clearStoredLastEventId
}));

import SettingsNav from "./SettingsNav";

describe("SettingsNav logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
    mocks.getBrowserSupabaseClient.mockReturnValue({
      auth: {
        signOut: mocks.signOut
      }
    });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("logs out via API, clears Supabase session, and redirects to login", async () => {
    render(<SettingsNav current="account" />);
    expect(mocks.getBrowserSupabaseClient).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("settings-logout"));

    // Let promises flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    expect(mocks.getBrowserSupabaseClient).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.clearStoredApiKey).toHaveBeenCalledTimes(1);
    expect(mocks.clearStoredLastEventId).toHaveBeenCalledTimes(1);
    expect(mocks.clearStoredOwnerAuth).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/auth/login", undefined, { locale: "en" });
  });
});
