import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiRequestMock = vi.hoisted(() => vi.fn());
const setStoredApiKeyMock = vi.hoisted(() => vi.fn());
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

vi.mock("../storage", () => ({
  setStoredApiKey: setStoredApiKeyMock
}));

vi.mock("./agent-name-generator", () => ({
  generateFunnyAgentName: generateFunnyAgentNameMock
}));

import StepConnect from "./StepConnect";

function renderStepConnect() {
  const props = {
    locale: "en" as const,
    apiKey: null,
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
    }))
  };

  render(<StepConnect {...props} />);
  return props;
}

describe("StepConnect", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    setStoredApiKeyMock.mockReset();
    generateFunnyAgentNameMock.mockReset();
    generateFunnyAgentNameMock.mockReturnValue("bot-banana-trading");
  });

  afterEach(() => {
    cleanup();
  });

  it("prefills a generated default name in generate mode", async () => {
    renderStepConnect();

    const input = screen.getByLabelText("Agent name (optional)") as HTMLInputElement;
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
    const input = screen.getByLabelText("Agent name (optional)");
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
    expect(setStoredApiKeyMock).toHaveBeenCalledWith("cd_live_generated_123");
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
    const input = screen.getByLabelText("Agent name (optional)");
    fireEvent.change(input, { target: { value: "my-custom-bot" } });
    fireEvent.click(screen.getByTestId("generate-key"));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledTimes(1);
    });

    expect(apiRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      body: { name: "my-custom-bot" }
    }));
  });
});
