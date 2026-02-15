import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

import AgentDropdown from "./AgentDropdown";

const agents = [
  { id: "aaaa-1111-2222-3333-4444", name: "Bot Alpha" },
  { id: "bbbb-1111-2222-3333-4444", name: null },
];

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("AgentDropdown", () => {
  it("renders nothing when agents list is empty", () => {
    const { container } = render(
      <AgentDropdown agents={[]} selectedAgentId={null} onAgentChange={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows 'allAgents' label when no agent selected", () => {
    render(
      <AgentDropdown agents={agents} selectedAgentId={null} onAgentChange={vi.fn()} />
    );
    expect(screen.getByText("allAgents")).toBeTruthy();
  });

  it("shows selected agent name", () => {
    render(
      <AgentDropdown agents={agents} selectedAgentId="aaaa-1111-2222-3333-4444" onAgentChange={vi.fn()} />
    );
    expect(screen.getByText("Bot Alpha")).toBeTruthy();
  });

  it("opens dropdown and lists all agents on click", () => {
    render(
      <AgentDropdown agents={agents} selectedAgentId={null} onAgentChange={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId("agent-dropdown").querySelector("button")!);

    // All agents option + 2 agents
    const buttons = screen.getByTestId("agent-dropdown").querySelectorAll("button");
    // 1 toggle + 1 "All" + 2 agents = 4
    expect(buttons.length).toBe(4);
  });

  it("calls onAgentChange with agent id when selected", () => {
    const onChange = vi.fn();
    render(
      <AgentDropdown agents={agents} selectedAgentId={null} onAgentChange={onChange} />
    );

    fireEvent.click(screen.getByTestId("agent-dropdown").querySelector("button")!);
    fireEvent.click(screen.getByText("Bot Alpha"));

    expect(onChange).toHaveBeenCalledWith("aaaa-1111-2222-3333-4444");
  });

  it("calls onAgentChange with null when 'All' selected", () => {
    const onChange = vi.fn();
    render(
      <AgentDropdown agents={agents} selectedAgentId="aaaa-1111-2222-3333-4444" onAgentChange={onChange} />
    );

    fireEvent.click(screen.getByTestId("agent-dropdown").querySelector("button")!);

    // The "allAgents" button in the dropdown menu (not the toggle)
    const allButtons = screen.getAllByText("allAgents");
    fireEvent.click(allButtons[allButtons.length - 1]);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("closes on Escape key", () => {
    render(
      <AgentDropdown agents={agents} selectedAgentId={null} onAgentChange={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId("agent-dropdown").querySelector("button")!);
    expect(screen.getByText("Bot Alpha")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    // After escape, the dropdown items should be gone (except the trigger button text)
    const dropdown = screen.getByTestId("agent-dropdown");
    const menuItems = dropdown.querySelectorAll("div > button");
    // Only the toggle button remains in a closed state
    expect(menuItems.length).toBe(1);
  });

  it("shows 'Agent N' fallback for agents without name", () => {
    render(
      <AgentDropdown agents={agents} selectedAgentId={null} onAgentChange={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId("agent-dropdown").querySelector("button")!);
    expect(screen.getByText("Agent 2")).toBeTruthy();
  });
});
