import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerMock = {
  locale: "en",
  asPath: "/claim/test-token",
};

const translate = (key: string, values?: Record<string, string | number>) => {
  if (!values) return key;
  return `${key}:${Object.values(values).join(",")}`;
};

vi.mock("next/router", () => ({
  useRouter: () => routerMock,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, locale, ...props }: any) => (
    <a href={String(href)} data-locale={locale} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./api", () => ({
  fetchClaimSession: vi.fn(),
  claimSession: vi.fn(),
  denySession: vi.fn(),
}));

import { claimSession, denySession, fetchClaimSession } from "./api";
import ClaimPage from "./ClaimPage";

const baseSession = {
  session_id: "11111111-1111-4111-8111-111111111111",
  status: "PENDING_CLAIM",
  requested_agent_name: "Deal Scout",
  requested_scopes: ["agent:read", "approvals:write", "custom:scope"],
  client_type: "openclaw",
  client_version: "1.2.3",
  expires_at: "2099-01-01T00:00:00.000Z",
  claimed_at: null,
  owner_context_available: true,
  owner_agent_limit: 3,
  owner_agents: [
    { agent_id: "agent-inactive", name: "Inactive", status: "disabled" },
    { agent_id: "agent-active", name: "Active Scout", status: "active" },
  ],
  allow_create_agent: true,
  default_mode: "attach_agent",
};

describe("ClaimPage", () => {
  beforeEach(() => {
    routerMock.locale = "en";
    routerMock.asPath = "/claim/test-token";
    vi.mocked(fetchClaimSession).mockReset();
    vi.mocked(claimSession).mockReset();
    vi.mocked(denySession).mockReset();
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(JSON.stringify({ data: { email: "owner@example.com" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }) as any
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the missing-token state without loading a session", () => {
    render(<ClaimPage claimToken="" />);

    expect(screen.getByText("missingTokenTitle")).toBeDefined();
    expect(screen.getByText("missingTokenBody")).toBeDefined();
    expect(fetchClaimSession).not.toHaveBeenCalled();
  });

  it("renders a stable load error", async () => {
    vi.mocked(fetchClaimSession).mockResolvedValue({
      ok: false,
      error: "Claim expired",
      status: 410,
    });

    render(<ClaimPage claimToken="expired-token" />);

    expect((await screen.findByRole("alert")).textContent).toContain("Claim expired");
    expect(screen.queryByTestId("claim-loaded")).toBeNull();
  });

  it("loads owner context and attaches the default active agent", async () => {
    vi.mocked(fetchClaimSession).mockResolvedValue({ ok: true, data: baseSession as any });
    vi.mocked(claimSession).mockResolvedValue({
      ok: true,
      data: {
        status: "CLAIMED",
        agent_id: "agent-active",
        owner_id: "owner-1",
        claimed_at: "2026-07-23T10:00:00.000Z",
      },
    });

    render(<ClaimPage claimToken="test-token" />);

    expect(await screen.findByTestId("claim-loaded")).toBeDefined();
    expect((screen.getByTestId("claim-attach-agent-select") as HTMLSelectElement).value).toBe("agent-active");
    expect(screen.getByTestId("claim-requested-scopes").textContent).toContain("scope.agentRead");
    expect(screen.getByTestId("claim-requested-scopes").textContent).toContain("scope.fallback");
    expect(await screen.findByText("owner@example.com")).toBeDefined();

    fireEvent.click(screen.getByTestId("claim-approve"));

    await waitFor(() => {
      expect(claimSession).toHaveBeenCalledWith({
        sessionId: baseSession.session_id,
        claimToken: "test-token",
        mode: "attach_agent",
        agentName: undefined,
        attachAgentId: "agent-active",
      });
    });
    expect(screen.getByTestId("claim-status").textContent).toContain("CLAIMED");
  });

  it("creates an agent and normalizes owner-limit failures into attach guidance", async () => {
    vi.mocked(fetchClaimSession).mockResolvedValue({
      ok: true,
      data: { ...baseSession, default_mode: "create_agent" } as any,
    });
    vi.mocked(claimSession).mockResolvedValue({
      ok: false,
      status: 409,
      error: "Owner agent limit reached",
    });

    render(<ClaimPage claimToken="test-token" />);
    await screen.findByTestId("claim-loaded");

    const nameInput = screen.getByLabelText("newAgentName");
    fireEvent.change(nameInput, { target: { value: "New Scout" } });
    fireEvent.click(screen.getByTestId("claim-approve"));

    expect((await screen.findByRole("alert")).textContent).toContain("ownerLimitReachedAttachHint");
    expect(screen.getByTestId("claim-attach-agent-select")).toBeDefined();
    expect(claimSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "create_agent",
        agentName: "New Scout",
      })
    );
  });

  it("requires owner authentication before enabling claim actions", async () => {
    vi.mocked(fetchClaimSession).mockResolvedValue({
      ok: true,
      data: {
        ...baseSession,
        owner_context_available: false,
        owner_agents: [],
      } as any,
    });

    render(<ClaimPage claimToken="test-token" />);

    await screen.findByTestId("claim-loaded");
    expect(screen.getByText("ownerSignInRequired")).toBeDefined();
    expect(screen.getByText("ownerLogin").closest("a")?.getAttribute("href")).toBe(
      "/auth/login?next=%2Fclaim%2Ftest-token"
    );
    expect((screen.getByTestId("claim-approve") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("claim-deny") as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not deny until confirmed and then finalizes the session", async () => {
    vi.mocked(fetchClaimSession).mockResolvedValue({ ok: true, data: baseSession as any });
    vi.mocked(denySession).mockResolvedValue({
      ok: true,
      data: { status: "CANCELLED", cancelled_at: "2026-07-23T10:00:00.000Z" },
    });
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(<ClaimPage claimToken="test-token" />);
    await screen.findByTestId("claim-loaded");

    fireEvent.click(screen.getByTestId("claim-deny"));
    expect(denySession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("claim-deny"));
    await waitFor(() => {
      expect(denySession).toHaveBeenCalledWith({
        sessionId: baseSession.session_id,
        claimToken: "test-token",
      });
    });
    expect(screen.getByTestId("claim-status").textContent).toContain("CANCELLED");
  });

  it("renders finalized and expired sessions as non-actionable", async () => {
    vi.mocked(fetchClaimSession)
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ...baseSession,
          status: "DELIVERED",
          agent_id: "agent-active",
        } as any,
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ...baseSession,
          expires_at: "2000-01-01T00:00:00.000Z",
        } as any,
      });

    const first = render(<ClaimPage claimToken="final-token" />);
    await screen.findByTestId("claim-loaded");
    expect(screen.getByText("alreadyApproved")).toBeDefined();
    expect(screen.queryByTestId("claim-approve")).toBeNull();
    first.unmount();

    render(<ClaimPage claimToken="expired-token" />);
    await screen.findByTestId("claim-loaded");
    expect((screen.getByTestId("claim-approve") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/expiredAgo/)).toBeDefined();
  });
});
