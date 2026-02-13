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

    expect(screen.getByText("Name your agent")).toBeTruthy();
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

    expect(screen.queryByText("Name your agent")).toBeNull();
    expect(screen.getByText("Owner Bot")).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
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
      expect(screen.getByText("Saved")).toBeTruthy();
    });
    expect(screen.queryByText("Name your agent")).toBeNull();
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
      expect(screen.getByText("Le nom doit contenir 80 caracteres maximum.")).toBeTruthy();
    });
  });
});
