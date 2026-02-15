import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  )
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    apiRequest: apiRequestMock
  };
});

import StepFirstWin from "./StepFirstWin";

describe("StepFirstWin", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it("shows naming prompt when agent has no name", () => {
    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_1",
          name: null,
          owner_id: null,
          installation_id: "ins_1",
          oauth_scopes: ["agent:read", "agent:write"]
        }}
        hasOwnerSession={false}
      />
    );

    expect(screen.getByLabelText("step.firstwin.agentName")).toBeTruthy();
    const saveButton = screen.getByRole("button", { name: "step.firstwin.save" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("shows name with saved confirmation when agent is already named", () => {
    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_2",
          name: "Owner Bot",
          owner_id: "own_1",
          installation_id: "ins_2",
          oauth_scopes: ["agent:read", "agent:write"]
        }}
        hasOwnerSession={true}
      />
    );

    expect(screen.queryByLabelText("step.firstwin.agentName")).toBeNull();
    expect(screen.getByText("Owner Bot")).toBeTruthy();
  });

  it("saves a new name and replaces the prompt with confirmation", async () => {
    apiRequestMock.mockResolvedValueOnce({
      data: { data: { agent_id: "agt_3", name: "Alpha Bot" } }
    });

    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_3",
          name: null,
          owner_id: null,
          installation_id: "ins_3",
          oauth_scopes: ["agent:read", "agent:write"]
        }}
        hasOwnerSession={false}
      />
    );

    const input = screen.getByPlaceholderText("step.firstwin.namePlaceholder");
    fireEvent.change(input, { target: { value: "Alpha Bot" } });
    fireEvent.click(screen.getByRole("button", { name: "step.firstwin.save" }));

    await waitFor(() => {
      expect(screen.getByText("Alpha Bot")).toBeTruthy();
    });
    expect(screen.queryByLabelText("step.firstwin.agentName")).toBeNull();
  });

  it("shows error key on save validation error", async () => {
    apiRequestMock.mockRejectedValueOnce({
      code: "VALIDATION_ERROR",
      message: "name must be 80 characters or less"
    });

    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_4",
          name: null,
          owner_id: null,
          installation_id: "ins_4",
          oauth_scopes: ["agent:read", "agent:write"]
        }}
        hasOwnerSession={false}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("step.firstwin.namePlaceholder"), { target: { value: "Agent Tres Long" } });
    fireEvent.click(screen.getByRole("button", { name: "step.firstwin.save" }));

    await waitFor(() => {
      expect(screen.getByText("step.firstwin.nameErrors.tooLong")).toBeTruthy();
    });
  });

  it("shows limitation banner when not linked to owner", () => {
    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_5",
          name: "Test Bot",
          owner_id: null,
          installation_id: "ins_5",
          oauth_scopes: ["agent:read"]
        }}
        hasOwnerSession={false}
      />
    );

    expect(screen.getByText("step.firstwin.limitedWarning")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "step.firstwin.createAccount" });
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("href")).toBe("/auth/login?next=/start");
  });

  it("hides limitation banner when linked to owner", () => {
    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_6",
          name: "Owner Bot",
          owner_id: "own_1",
          installation_id: "ins_6",
          oauth_scopes: ["agent:read"]
        }}
        hasOwnerSession={true}
      />
    );

    expect(screen.queryByText("step.firstwin.limitedWarning")).toBeNull();
    expect(screen.getByText("step.firstwin.createWatchlist")).toBeTruthy();
  });

  it("renders My Listings card with link to /my/listings (P5)", () => {
    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_p5",
          name: "Owner Bot",
          owner_id: "own_1",
          installation_id: "ins_p5",
          oauth_scopes: ["agent:read"]
        }}
        hasOwnerSession={true}
      />
    );

    const link = screen.getByRole("link", { name: /step\.firstwin\.myListings/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/my/listings");
  });

  it("does not render CTA cards without owner session", () => {
    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_p5b",
          name: "Test Bot",
          owner_id: null,
          installation_id: "ins_p5b",
          oauth_scopes: ["agent:read"]
        }}
        hasOwnerSession={false}
      />
    );

    expect(screen.queryByRole("link", { name: /step\.firstwin\.myListings/i })).toBeNull();
    expect(screen.queryByText("step.firstwin.createWatchlist")).toBeNull();
  });

  it("shows error key on unauthorized save error", async () => {
    apiRequestMock.mockRejectedValueOnce({
      code: "UNAUTHORIZED",
      status: 401
    });

    render(
      <StepFirstWin
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_7",
          name: null,
          owner_id: null,
          installation_id: "ins_7",
          oauth_scopes: []
        }}
        hasOwnerSession={false}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("step.firstwin.namePlaceholder"), { target: { value: "Bot" } });
    fireEvent.click(screen.getByRole("button", { name: "step.firstwin.save" }));

    await waitFor(() => {
      expect(screen.getByText("step.firstwin.nameErrors.unauthorized")).toBeTruthy();
    });
  });

  it("uses current origin for API snippets when NEXT_PUBLIC_API_BASE_URL is unset", async () => {
    const previousApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    try {
      render(
        <StepFirstWin
          apiKey="cd_live_test_123456"
          agentMe={{
            agent_id: "agt_8",
            name: "Owner Bot",
            owner_id: "own_8",
            installation_id: "ins_8",
            oauth_scopes: ["agent:read"]
          }}
          hasOwnerSession={true}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "step.firstwin.resources" }));
      const expectedEndpoint = `${window.location.origin}/api/v1/deals?limit=10`;

      await waitFor(() => {
        expect(screen.getByText((content) => content.includes(expectedEndpoint))).toBeTruthy();
      });
    } finally {
      if (previousApiBase === undefined) {
        delete process.env.NEXT_PUBLIC_API_BASE_URL;
      } else {
        process.env.NEXT_PUBLIC_API_BASE_URL = previousApiBase;
      }
    }
  });
});
