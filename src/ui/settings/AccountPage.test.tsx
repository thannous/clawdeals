import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn()
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
    asPath: "/settings/account",
    replace: mocks.replace
  })
}));

import AccountPage from "./AccountPage";

function jsonResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as any;
}

function createFetchMock(options?: { rotateError?: boolean }) {
  return vi.fn(async (input: any) => {
    const url = String(input || "");

    if (url.startsWith("/api/v1/auth/me")) {
      return jsonResponse(200, {
        data: {
          owner_id: "11111111-1111-4111-8111-111111111111",
          email: "owner@example.com",
          email_verified_at: "2026-02-10T12:00:00.000Z"
        }
      });
    }

    if (url.startsWith("/api/v1/owner/agents")) {
      return jsonResponse(200, {
        data: {
          owner_id: "11111111-1111-4111-8111-111111111111",
          agents: [
            {
              agent_id: "22222222-2222-4222-8222-222222222222",
              name: "Alpha Agent",
              status: "ACTIVE",
              trust_score: 30,
              suspended_at: null,
              created_at: "2026-02-10T10:00:00Z"
            }
          ]
        }
      });
    }

    if (url.startsWith("/api/v1/owner/claims")) {
      return jsonResponse(200, {
        data: { claims: [] }
      });
    }

    if (url.startsWith("/api/v1/owner/activity")) {
      return jsonResponse(200, {
        data: { activities: [] }
      });
    }

    if (url.includes("/keys:rotate-all")) {
      if (options?.rotateError) {
        return jsonResponse(404, {
          error: {
            code: "NOT_FOUND",
            message: "Installation not found",
            details: {
              installation_id: "33333333-3333-4333-8333-333333333333",
              failure_stage: "installation_revoke"
            }
          }
        });
      }

      return jsonResponse(200, {
        data: {
          agent_id: "22222222-2222-4222-8222-222222222222",
          rotated: true,
          api_key: "cd_live_new.secret",
          api_key_id: "44444444-4444-4444-8444-444444444444",
          previous_api_key_id: "55555555-5555-4555-8555-555555555555",
          grace_seconds: 86400,
          revoked_installations_count: 1,
          revoked_installation_ids: ["33333333-3333-4333-8333-333333333333"],
          rotated_at: "2026-02-14T12:00:00.000Z"
        }
      });
    }

    if (url.includes("/keys:revoke-all")) {
      return jsonResponse(200, {
        data: {
          agent_id: "22222222-2222-4222-8222-222222222222",
          revoked_global_keys_count: 1,
          revoked_global_api_key_ids: ["44444444-4444-4444-8444-444444444444"],
          revoked_installations_count: 1,
          revoked_installation_ids: ["33333333-3333-4333-8333-333333333333"],
          revoked_at: "2026-02-14T12:00:00.000Z"
        }
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe("AccountPage security actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders rotate/revoke credential buttons for selected agent", async () => {
    globalThis.fetch = createFetchMock() as any;

    render(<AccountPage />);

    await screen.findByTestId("account-security-actions");
    expect(screen.getByTestId("account-rotate-credentials")).toBeTruthy();
    expect(screen.getByTestId("account-revoke-credentials")).toBeTruthy();
  });

  it("calls rotate-all endpoint and refetches account data", async () => {
    const fetchMock = createFetchMock();
    globalThis.fetch = fetchMock as any;

    render(<AccountPage />);
    await screen.findByTestId("account-security-actions");

    fireEvent.click(screen.getByTestId("account-rotate-credentials"));
    await screen.findByTestId("confirm-modal");
    fireEvent.click(screen.getByText("Rotate + revoke apps"));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes("/keys:rotate-all"))
      ).toBe(true);
    });

    await waitFor(() => {
      const ownerAgentsCalls = fetchMock.mock.calls.filter((call) => String(call[0]).startsWith("/api/v1/owner/agents"));
      expect(ownerAgentsCalls.length).toBeGreaterThan(1);
    });
  });

  it("shows installation id in rotate-all fail-fast errors", async () => {
    globalThis.fetch = createFetchMock({ rotateError: true }) as any;

    render(<AccountPage />);
    await screen.findByTestId("account-security-actions");

    fireEvent.click(screen.getByTestId("account-rotate-credentials"));
    await screen.findByTestId("confirm-modal");
    fireEvent.click(screen.getByText("Rotate + revoke apps"));

    await waitFor(() => {
      expect(screen.getAllByText(/installation: 33333333-3333-4333-8333-333333333333/i).length).toBeGreaterThan(0);
    });
  });
});
