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
        locale="en"
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

    expect(screen.getByLabelText("Agent name")).toBeTruthy();
    const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("shows name with saved confirmation when agent is already named", () => {
    render(
      <StepFirstWin
        locale="en"
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

    expect(screen.queryByLabelText("Agent name")).toBeNull();
    expect(screen.getByText("Owner Bot")).toBeTruthy();
  });

  it("saves a new name and replaces the prompt with confirmation", async () => {
    apiRequestMock.mockResolvedValueOnce({
      data: { data: { agent_id: "agt_3", name: "Alpha Bot" } }
    });

    render(
      <StepFirstWin
        locale="en"
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

    const input = screen.getByPlaceholderText("My Trading Bot");
    fireEvent.change(input, { target: { value: "Alpha Bot" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Alpha Bot")).toBeTruthy();
    });
    expect(screen.queryByLabelText("Agent name")).toBeNull();
  });

  it("shows localized validation message on save error", async () => {
    apiRequestMock.mockRejectedValueOnce({
      code: "VALIDATION_ERROR",
      message: "name must be 80 characters or less"
    });

    render(
      <StepFirstWin
        locale="fr"
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

    fireEvent.change(screen.getByPlaceholderText("Mon bot trading"), { target: { value: "Agent Tres Long" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(screen.getByText("Le nom doit contenir 80 caractères maximum.")).toBeTruthy();
    });
  });

  it("shows limitation banner when not linked to owner", () => {
    render(
      <StepFirstWin
        locale="en"
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

    expect(screen.getByText("Limited marketplace searches until this key is linked to an account.")).toBeTruthy();
    const cta = screen.getByRole("link", { name: /create account/i });
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("href")).toBe("/auth/login?next=/start");
  });

  it("hides limitation banner when linked to owner", () => {
    render(
      <StepFirstWin
        locale="en"
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

    expect(screen.queryByText("Limited marketplace searches until this key is linked to an account.")).toBeNull();
    expect(screen.getByText("Create a watchlist")).toBeTruthy();
  });

  it("renders My Listings card with link to /my/listings (P5)", () => {
    render(
      <StepFirstWin
        locale="en"
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

    const link = screen.getByRole("link", { name: /my listings/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/my/listings");
  });

  it("does not render CTA cards without owner session", () => {
    render(
      <StepFirstWin
        locale="en"
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

    expect(screen.queryByRole("link", { name: /my listings/i })).toBeNull();
    expect(screen.queryByText("Create a watchlist")).toBeNull();
  });

  it("renders limitation banner in French", () => {
    render(
      <StepFirstWin
        locale="fr"
        apiKey="cd_live_test_123456"
        agentMe={{
          agent_id: "agt_7",
          name: "Bot FR",
          owner_id: null,
          installation_id: "ins_7",
          oauth_scopes: []
        }}
        hasOwnerSession={false}
      />
    );

    expect(screen.getByText("Recherches limitées sur le marketplace tant que cette clé n'est pas liée à un compte.")).toBeTruthy();
    const cta = screen.getByRole("link", { name: /créer un compte/i });
    expect(cta).toBeTruthy();
    expect(cta.getAttribute("href")).toBe("/auth/login?next=/start");
  });

  it("uses current origin for API snippets when NEXT_PUBLIC_API_BASE_URL is unset", async () => {
    const previousApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    try {
      render(
        <StepFirstWin
          locale="en"
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

      fireEvent.click(screen.getByRole("button", { name: "Developer resources" }));
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
