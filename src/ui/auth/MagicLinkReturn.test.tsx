import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en.json";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  fetch: vi.fn(),
  getSession: vi.fn(),
  waitForOwnerSessionReady: vi.fn(),
  router: { isReady: true, query: {} as Record<string, unknown> }
}));

vi.mock("next/link", () => ({
  default: ({ children, href, locale: _locale, ...props }: any) => <a href={href} {...props}>{children}</a>
}));
vi.mock("next/router", () => ({
  useRouter: () => ({ ...mocks.router, replace: mocks.replace })
}));
vi.mock("./supabase-client", () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: mocks.getSession } })
}));
vi.mock("./ownerSessionReady", () => ({
  waitForOwnerSessionReady: mocks.waitForOwnerSessionReady
}));

import LoginPage from "./LoginPage";
import LegacyLoginPage from "./LegacyLoginPage";
import VerifyPage from "./VerifyPage";
import { missionDraftSourceFromUrl, saveBuyMissionDraft } from "../webmcp/buyMissionDraft";

// The password browser journey does not visit this alternative login path.
// These regressions keep email/verification HTTP calls simulated: no mail is sent.
const missionPath = "/fr/my/missions/new?query=velo&price_max=83.25";
const nextKey = "clawdeals.auth_next";
const reply = (data: object) => ({ ok: true, status: 200, json: async () => ({ data }) });
const withMessages = (child: React.ReactNode) => <NextIntlClientProvider locale="en" messages={messages}>{child}</NextIntlClientProvider>;
const savedDraft = {
  query: "velo", marketCode: "FR" as const, cityPreset: "paris", locationLabel: "Paris", latitude: "48.85", longitude: "2.35", radiusKm: "20",
  preferredPriceMax: "75.50", hardBudgetMax: "83.25", requirements: "Private draft edits", autonomousActions: [] as [], expiresAt: ""
};

describe("Magic link mission return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/auth/login");
    mocks.router.isReady = true;
    mocks.router.query = { next: missionPath };
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.waitForOwnerSessionReady.mockResolvedValue(false);
    mocks.fetch.mockImplementation(async (url: string) => url === "/api/v1/auth/login:start"
      ? reply({ session_id: "synthetic-session", session_token: "synthetic-token" })
      : reply({ authenticated: true, owner_id: "11111111-1111-4111-8111-111111111111" }));
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("keeps the localized mission destination when switching to Magic link", async () => {
    render(<NextIntlClientProvider locale="en" messages={messages}><LoginPage /></NextIntlClientProvider>);
    const link = screen.getByTestId("auth-login-legacy-link");
    expect(new URL(link.getAttribute("href")!, window.location.origin).searchParams.get("next")).toBe(missionPath);
  });

  it("carries the safe destination to verification and keeps it for a same-tab emailed link", async () => {
    render(withMessages(<LegacyLoginPage />));
    fireEvent.change(screen.getByTestId("auth-login-email"), { target: { value: "buyer@example.test" } });
    fireEvent.click(screen.getByTestId("auth-login-submit"));
    await waitFor(() => expect(screen.queryByTestId("auth-login-verify-link")).not.toBeNull());
    const link = new URL(screen.getByTestId("auth-login-verify-link").getAttribute("href")!, window.location.origin);
    expect(link.searchParams.get("next")).toBe(missionPath);
    expect(sessionStorage.getItem(nextKey)).toBe(missionPath);
    expect(mocks.fetch).toHaveBeenCalledWith("/api/v1/auth/login:start", expect.objectContaining({
      method: "POST", body: JSON.stringify({ email: "buyer@example.test", next: missionPath })
    }));
  });

  it.each(["query", "stored"] as const)("returns to the mission after verification using a %s destination", async (source) => {
    mocks.router.query = { session_id: "synthetic-session", token: "synthetic-token",
      ...(source === "query" ? { next: missionPath } : {}) };
    sessionStorage.setItem(nextKey, source === "stored" ? missionPath : "/settings/account");
    saveBuyMissionDraft(missionDraftSourceFromUrl(missionPath)!, savedDraft);
    const rawDraft = sessionStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D");
    mocks.waitForOwnerSessionReady.mockResolvedValue(true);
    render(withMessages(<VerifyPage />));
    fireEvent.click(screen.getByTestId("auth-verify-submit"));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(missionPath, undefined, { locale: false }));
    expect(sessionStorage.getItem(nextKey)).toBeNull();
    expect(sessionStorage.getItem("clawdeals:buy-mission-draft:v3:anonymous:search%3A%5B%22velo%22%2C%2283.25%22%5D")).toBe(rawDraft);
  });

  it("rejects an external destination even when a previous stored destination exists", async () => {
    mocks.router.query = { session_id: "synthetic-session", token: "synthetic-token", next: "https://outside.example/my/missions" };
    sessionStorage.setItem(nextKey, missionPath);
    mocks.waitForOwnerSessionReady.mockResolvedValue(true);
    render(withMessages(<VerifyPage />));
    fireEvent.click(screen.getByTestId("auth-verify-submit"));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/settings/account", undefined, { locale: false }));
  });

  it.each(["missing", "unrelated"])("explains original-tab recovery when the mission draft is %s", async (draft) => {
    mocks.router.query = { session_id: "synthetic-session", token: "synthetic-token", next: missionPath };
    if (draft === "unrelated") saveBuyMissionDraft("search:[\"different\",\"\"]", savedDraft);
    mocks.waitForOwnerSessionReady.mockResolvedValue(true);
    render(withMessages(<VerifyPage />));
    fireEvent.click(screen.getByTestId("auth-verify-submit"));
    const link = await screen.findByRole("link", { name: "Open mission here without my draft" });
    expect(link.getAttribute("href")).toBe(missionPath);
    expect(screen.getByText(/Return to the tab where you prepared your mission/)).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(`clawdeals:buy-mission-draft:v3:anonymous:${encodeURIComponent(draft === "missing" ? missionDraftSourceFromUrl(missionPath)! : 'search:["different",""]')}`)).toEqual(draft === "missing" ? null : expect.any(String));
  });

  it.each(["query", "stored"])("keeps the %s destination when requesting a replacement email", async (source) => {
    mocks.router.query = source === "query" ? { next: missionPath } : {};
    if (source === "stored") sessionStorage.setItem(nextKey, missionPath);
    localStorage.setItem("clawdeals.owner_email", "buyer@example.test");
    render(withMessages(<VerifyPage />));
    fireEvent.click(screen.getByTestId("auth-verify-resend"));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith("/api/v1/auth/login:start", expect.objectContaining({
      body: JSON.stringify({ email: "buyer@example.test", next: missionPath })
    })));
  });
});

