import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NeonAccountLinkPage from "./NeonAccountLinkPage";
const mocks = vi.hoisted(() => ({ session: vi.fn(), exchange: vi.fn(), oauth: vi.fn(), password: vi.fn() }));
vi.mock("./browser-auth-client", () => ({ getBrowserAuthClient: () => ({ auth: { getSession: mocks.session, exchangeCodeForSession: mocks.exchange, signInWithOAuth: mocks.oauth, signInWithPassword: mocks.password } }) }));
const owner = { owner_id: "fixture-owner", email: "source@example.test" };
const session = { access_token: "fixture-jwt", user: { email: "neon@example.test" } };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear(); window.history.replaceState(null, "", "/settings/neon-link");
  mocks.session.mockResolvedValue({ data: { session } });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: owner }) }); vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
// Isolation pins security-critical callback/owner-switch failures alongside browser fixtures.
describe("explicit Neon account continuation", () => {
  it("never links on load/callback; confirmation binds the shown owner", async () => {
    window.history.replaceState(null, "", "/settings/neon-link?code=fixture-code");
    mocks.session.mockResolvedValueOnce({ data: { session: null } }); mocks.exchange.mockResolvedValue({ data: { session } });
    render(<NeonAccountLinkPage />); await screen.findByText("Neon account: neon@example.test");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm account link" }));
    await screen.findByText("Account linked. Your owner ID and existing session were preserved.");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/neon:link");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ expected_owner_id: owner.owner_id }); expect(window.location.search).toBe("");
  });
  it("preserves interrupted attempts without auto linking and refuses switched owner", async () => {
    sessionStorage.setItem("clawdeals.neon_link_owner", "other-owner"); render(<NeonAccountLinkPage />);
    await screen.findByText(/current owner changed/); expect(mocks.session).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Confirm account link" })).toBeNull();
  });
  it("keeps confirmation available after conflict without signup/logout or cookie clearing", async () => {
    render(<NeonAccountLinkPage />); await screen.findByText("Neon account: neon@example.test");
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "Identity belongs to another owner" } }) });
    fireEvent.click(screen.getByRole("button", { name: "Confirm account link" })); await screen.findByText("Identity belongs to another owner");
    await waitFor(() => expect((screen.getByRole("button", { name: "Confirm account link" }) as HTMLButtonElement).disabled).toBe(false));
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("logout") && !String(url).includes("bridge"))).toBe(true);
  });
  it("renders no auth actions without opt-in or original proof", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: { message: "Account linking is not enabled" } }) });
    render(<NeonAccountLinkPage />); await screen.findByText("Account linking is not enabled");
    expect(screen.queryByRole("button", { name: "Sign in to Neon" })).toBeNull(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("returns Google to the exact current-origin route and stores only pending owner", async () => {
    mocks.oauth.mockResolvedValue({ data: { url: "ignored-adapter-callback" }, error: null });
    render(<NeonAccountLinkPage />); await screen.findByText("Neon account: neon@example.test"); fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: `${window.location.origin}/settings/neon-link` } }));
    expect(sessionStorage.getItem("clawdeals.neon_link_owner")).toBe(owner.owner_id); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("clears password after thrown sign-in error without touching the existing session", async () => {
    mocks.password.mockRejectedValue(new Error("Fixture sign-in failed")); render(<NeonAccountLinkPage />); await screen.findByText("Neon account: neon@example.test");
    fireEvent.change(screen.getByLabelText("Neon email"), { target: { value: "fixture@example.test" } }); fireEvent.change(screen.getByLabelText("Neon password"), { target: { value: "fixture-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in to Neon" }).closest("form")!); await screen.findByText("Fixture sign-in failed");
    expect((screen.getByLabelText("Neon password") as HTMLInputElement).value).toBe(""); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
