import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiRequestMock = vi.hoisted(() => vi.fn());
const generateFunnyAgentNameMock = vi.hoisted(() => vi.fn());

vi.mock("react-qr-code", () => ({
  default: () => <div data-testid="qr-code" />
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    apiRequest: apiRequestMock
  };
});

vi.mock("./agent-name-generator", () => ({
  generateFunnyAgentName: generateFunnyAgentNameMock
}));

import StepConnect from "./StepConnect";

function renderStepConnect(overrides: Record<string, unknown> = {}) {
  const props = {
    locale: "en" as const,
    apiKey: null as string | null,
    onMethodSelected: vi.fn(),
    onApiKeySet: vi.fn(),
    onClaimSessionCreated: vi.fn(),
    claimSession: null,
    pollStatus: "idle" as const,
    pollError: null,
    isCreatingSession: false,
    onCreateSession: vi.fn(async () => ({
      session_id: "sess_1",
      status: "PENDING_CLAIM",
      claim_url: "https://example.com/claim",
      verification_code: "123456",
      poll_token: "poll_1",
      interval_seconds: 2,
      expires_at: new Date(Date.now() + 600000).toISOString()
    })),
    hasOwnerSession: false,
    ...overrides
  };

  render(<StepConnect {...props} />);
  return props;
}

describe("StepConnect", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    generateFunnyAgentNameMock.mockReset();
    generateFunnyAgentNameMock.mockReturnValue("bot-banana-trading");
  });

  afterEach(() => {
    cleanup();
  });

  it("prefills a generated default name in generate mode", async () => {
    renderStepConnect();

    const input = document.getElementById("connect-agent-name") as HTMLInputElement;
    await waitFor(() => {
      expect(input.value).toBe("bot-banana-trading");
    });
  });

  it("uses generated fallback when submitting an empty name", async () => {
    apiRequestMock.mockResolvedValueOnce({
      data: {
        data: {
          agent_id: "agt_1",
          api_key: "cd_live_generated_123"
        }
      }
    });

    const props = renderStepConnect();
    const input = document.getElementById("connect-agent-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });

    fireEvent.click(screen.getByTestId("generate-key"));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });

    expect(apiRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      path: "/v1/agents",
      method: "POST",
      body: { name: "bot-banana-trading" }
    }));
    expect(props.onApiKeySet).toHaveBeenCalledWith("cd_live_generated_123", "agt_1");
    expect(props.onMethodSelected).toHaveBeenCalledWith("apikey");
  });

  it("keeps a manually edited name when generating a key", async () => {
    apiRequestMock.mockResolvedValueOnce({
      data: {
        data: {
          agent_id: "agt_2",
          api_key: "cd_live_manual_123"
        }
      }
    });

    renderStepConnect();
    const input = document.getElementById("connect-agent-name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "my-custom-bot" } });
    fireEvent.click(screen.getByTestId("generate-key"));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });

    expect(apiRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      body: { name: "my-custom-bot" }
    }));
  });

  describe("MCP / IDE card", () => {
    it("shows key acquisition phase by default (no stored key)", () => {
      renderStepConnect();

      // MCP key phase shows its own generate button
      expect(screen.getByTestId("mcp-generate-key")).toBeDefined();

      // Configure phase content should not be present
      expect(screen.queryByTestId("mcp-installed")).toBeNull();
    });

    it("shows configure phase when apiKey is already set", () => {
      renderStepConnect({ apiKey: "cd_live_existing_key_abc123" });

      // Configure phase has the "I've installed it" button
      expect(screen.getByTestId("mcp-installed")).toBeDefined();

      // Key phase generate button should not be present
      expect(screen.queryByTestId("mcp-generate-key")).toBeNull();
    });

    it("generates a key and advances to configure phase", async () => {
      apiRequestMock.mockResolvedValueOnce({
        data: {
          data: {
            agent_id: "agt_mcp_1",
            api_key: "cd_live_mcp_key_123"
          }
        }
      });

      const props = renderStepConnect();

      fireEvent.click(screen.getByTestId("mcp-generate-key"));

      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalledTimes(1);
      });

      expect(props.onApiKeySet).toHaveBeenCalledWith("cd_live_mcp_key_123", "agt_mcp_1");
      // Should NOT call onMethodSelected yet (that happens on "I've installed it")
      expect(props.onMethodSelected).not.toHaveBeenCalled();
    });

    it("validates a pasted key and advances to configure phase", async () => {
      apiRequestMock.mockResolvedValueOnce({ data: { data: [] } });

      const props = renderStepConnect();

      // Switch to paste mode in MCP card
      const iHaveAKeyButtons = screen.getAllByText("I have a key");
      fireEvent.click(iHaveAKeyButtons[iHaveAKeyButtons.length - 1]);

      const input = screen.getByLabelText("API key", { selector: "#mcp-paste-key" }) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "cd_live_pasted_key_1234567890" } });
      fireEvent.click(screen.getByTestId("mcp-validate-key"));

      await waitFor(() => {
        expect(apiRequestMock).toHaveBeenCalledTimes(1);
      });

      expect(props.onApiKeySet).toHaveBeenCalledWith("cd_live_pasted_key_1234567890");
      expect(props.onMethodSelected).not.toHaveBeenCalled();
    });

    it("calls onMethodSelected('mcp') when clicking 'I've installed it'", () => {
      const props = renderStepConnect({ apiKey: "cd_live_existing_key_abc123" });

      fireEvent.click(screen.getByTestId("mcp-installed"));

      expect(props.onMethodSelected).toHaveBeenCalledWith("mcp");
    });

    it("shows limitation warning when no owner session", () => {
      renderStepConnect({ hasOwnerSession: false });

      expect(screen.getByText(/Without an account, your API key will be limited/)).toBeDefined();
      expect(screen.getByText("Log in")).toBeDefined();
      expect(screen.getByText("Create account")).toBeDefined();
    });

    it("does not show limitation warning when owner session exists", () => {
      renderStepConnect({ hasOwnerSession: true });

      expect(screen.queryByText(/Without an account, your API key will be limited/)).toBeNull();
    });

    it("shows back button in configure phase", () => {
      renderStepConnect({ apiKey: "cd_live_existing_key_abc123" });

      expect(screen.getByText("Back")).toBeDefined();
    });
  });
});
