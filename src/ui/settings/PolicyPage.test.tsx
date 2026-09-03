import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  show: vi.fn(),
  router: {
    asPath: "/settings/policy",
    replace: vi.fn()
  }
}));

vi.mock("next/router", () => ({
  useRouter: () => mocks.router
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.decision || values?.errorCode ? `${key}:${values.decision || values.errorCode}` : key
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  )
}));

vi.mock("../shared/PageHeader", () => ({
  default: ({ children }: any) => <header>{children}</header>
}));

vi.mock("../shared/AppNav", () => ({
  default: () => <nav>app nav</nav>
}));

vi.mock("./SettingsNav", () => ({
  default: () => <nav>settings nav</nav>
}));

vi.mock("../console/shared/useToast", () => ({
  useToast: () => ({ toasts: [], show: mocks.show })
}));

vi.mock("../console/shared/Toast", () => ({
  default: () => null
}));

import PolicyPage from "./PolicyPage";

const POLICY = {
  version: 3,
  budgets: { max_offer: 1300, preferred_offer: 1000, currency: "EUR" },
  approval_thresholds: { offer_amount_gt: 1100, contact_reveal: "always" },
  auto_approve: { message_types: ["answer"], actions: ["listing.create"] },
  mission_defaults: { radius_km: 25, autonomous_actions: ["search", "ask_question"] },
  quiet_hours: { enabled: false, start: "22:00", end: "08:00", timezone: "Europe/Paris" },
  allowlist_agent_ids: ["agent-allow"],
  denylist_agent_ids: ["agent-deny"]
};

function jsonResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as any;
}

function makeFetch() {
  return vi.fn(async (input: any, init: RequestInit = {}) => {
    const url = String(input);
    if (url === "/api/v1/auth/session") {
      return jsonResponse(200, { data: { authenticated: true, owner_id: "owner-1" } });
    }
    if (url === "/api/v1/policies" && (!init.method || init.method === "GET")) {
      return jsonResponse(200, { data: POLICY });
    }
    if (url === "/api/v1/owner/policy-decisions?limit=20") {
      return jsonResponse(200, {
        data: {
          decisions: [
            {
              decision_id: "audit-1",
              ts: "2026-09-03T12:00:00.000Z",
              agent_id: "agent-1",
              action: "offer.create",
              entity_type: "offer",
              entity_id: "offer-1",
              outcome: "BLOCKED",
              decision: "REQUIRES_APPROVAL",
              policy_version: 3,
              approval_id: "approval-1",
              request_id: "req-1234567890",
              receipt_url: "/api/v1/owner/policy-decisions?request_id=req-1234567890"
            }
          ]
        }
      });
    }
    if (url === "/api/v1/policies" && init.method === "PUT") {
      const body = JSON.parse(String(init.body));
      return jsonResponse(200, { data: { ...body, version: 4 } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("PolicyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads current limits, renders a live decision, and links the request receipt", async () => {
    globalThis.fetch = makeFetch() as any;
    render(<PolicyPage />);

    await screen.findByTestId("policy-form");
    expect((screen.getByTestId("policy-hard-ceiling") as HTMLInputElement).value).toBe("1300");
    expect(screen.getByTestId("policy-preview-decision").textContent).toContain("APPROVAL_REQUIRED");
    expect(screen.getByRole("link", { name: /Receipt req-12345678/i }).getAttribute("href")).toBe(
      "/api/v1/owner/policy-decisions?request_id=req-1234567890"
    );

    fireEvent.change(screen.getByTestId("policy-hard-ceiling"), { target: { value: "1500" } });
    fireEvent.change(screen.getByTestId("policy-approval-threshold"), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Make policy-compliant offers/i }));
    expect(screen.getByTestId("policy-preview-decision").textContent).toContain("activity.policy.serverAccepted");
  });

  it("saves through the existing policy API with optimistic versioning", async () => {
    const fetchMock = makeFetch();
    globalThis.fetch = fetchMock as any;
    render(<PolicyPage />);
    await screen.findByTestId("policy-form");

    fireEvent.change(screen.getByTestId("policy-hard-ceiling"), { target: { value: "1000" } });
    fireEvent.submit(screen.getByTestId("policy-form"));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => call[1]?.method === "PUT")).toBe(true);
    });
    const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === "PUT");
    expect(putCall?.[1]?.headers).toMatchObject({ "If-Match": "3", "Content-Type": "application/json" });
    const saved = JSON.parse(String(putCall?.[1]?.body));
    expect(saved.budgets).toMatchObject({ max_offer: 1000, preferred_offer: 1000, currency: "EUR" });
    expect(saved.auto_approve).toEqual(POLICY.auto_approve);
    expect(saved.mission_defaults).toMatchObject({
      radius_km: 25,
      autonomous_actions: ["search", "ask_question"]
    });
    await waitFor(() => expect(mocks.show).toHaveBeenCalledWith("Policy v4 saved", "success"));
  });

  it("redirects anonymous owners before requesting policy data", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { data: { authenticated: false, owner_id: null } })
    ) as any;

    render(<PolicyPage />);

    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/auth/login?next=%2Fsettings%2Fpolicy"));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
