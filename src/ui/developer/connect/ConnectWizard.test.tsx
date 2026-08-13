import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  useWizardState: vi.fn(),
  useConnectSession: vi.fn(),
  router: {
    replace: vi.fn(),
    query: {} as Record<string, string>,
    locale: "en",
    asPath: "/start",
    isReady: true
  }
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
  useRouter: () => mocks.router
}));

vi.mock("./useWizardState", () => ({
  useWizardState: mocks.useWizardState
}));

vi.mock("./useConnectSession", () => ({
  useConnectSession: mocks.useConnectSession
}));

vi.mock("./StepConnect", () => ({
  default: ({ acquisitionId, loginHref }: { acquisitionId: string | null; loginHref: string }) => (
    <div data-testid="step-connect" data-acquisition-id={acquisitionId || ""} data-login-href={loginHref}>Step Connect</div>
  )
}));

vi.mock("./StepVerify", () => ({
  default: () => <div>Step Verify</div>
}));

vi.mock("./StepFirstWin", () => ({
  default: ({ hasOwnerSession }: { hasOwnerSession: boolean }) => (
    <div data-testid="step-first-win" data-owner-session={String(hasOwnerSession)}>
      Step First Win
    </div>
  )
}));

import ConnectWizard from "./ConnectWizard";

function buildWizardHookState(hasOwnerSession: boolean) {
  return {
    state: {
      step: "connect",
      method: null,
      apiKey: null,
      agentId: null,
      claimSession: null,
      agentMe: null,
      verified: false,
      autoVerifying: false,
      hasOwnerSession
    },
    selectMethod: vi.fn(),
    setApiKey: vi.fn(),
    setClaimSession: vi.fn(),
    setVerified: vi.fn(),
    reset: vi.fn()
  };
}

describe("ConnectWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.router.query = {};
    mocks.router.locale = "en";
    mocks.router.asPath = "/start";
    mocks.useConnectSession.mockReturnValue({
      createSession: vi.fn(),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
      exchangeForApiKey: vi.fn(),
      resetSession: vi.fn(),
      pollStatus: "idle",
      error: null,
      isCreating: false
    });
  });

  it("preserves acquisition ID and source through authentication", () => {
    mocks.router.query = {
      acq_id: "018f3c2a-1e4b-4f8a-9ac0-0123456789ab",
      from: "explore-card-gig-101"
    };
    mocks.router.locale = "fr";
    mocks.useWizardState.mockReturnValue(buildWizardHookState(false));

    render(<ConnectWizard />);

    const step = screen.getByTestId("step-connect");
    expect(step.dataset.acquisitionId).toBe("018f3c2a-1e4b-4f8a-9ac0-0123456789ab");
    expect(decodeURIComponent(step.dataset.loginHref || "")).toContain("/fr/start?acq_id=018f3c2a-1e4b-4f8a-9ac0-0123456789ab&from=explore-card-gig-101");
  });

  it("does not render settings header navigation without owner session", () => {
    mocks.useWizardState.mockReturnValue(buildWizardHookState(false));

    render(<ConnectWizard />);

    expect(screen.queryByTestId("settings-nav")).toBeNull();
    expect(screen.queryByTestId("settings-logout")).toBeNull();
  });

  it("renders settings header navigation with owner session", () => {
    mocks.useWizardState.mockReturnValue(buildWizardHookState(true));

    render(<ConnectWizard />);

    expect(screen.getByTestId("settings-nav")).toBeTruthy();
    expect(screen.getByTestId("settings-logout")).toBeTruthy();
  });

  it("passes hasOwnerSession to StepFirstWin on firstwin step", () => {
    const hookState = buildWizardHookState(false);
    hookState.state.step = "firstwin" as any;
    hookState.state.verified = true;
    mocks.useWizardState.mockReturnValue(hookState);

    render(<ConnectWizard />);

    const el = screen.getByTestId("step-first-win");
    expect(el).toBeTruthy();
    expect(el.dataset.ownerSession).toBe("false");
  });
});
