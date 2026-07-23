import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (
    key === "step.verify.mcp.title" ? "Verify MCP installation" : key
  )
}));

vi.mock("react-qr-code", () => ({
  default: ({ value }: { value: string }) => <div data-testid="qr-code">{value}</div>
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    apiRequest: apiRequestMock
  };
});

import StepVerify from "./StepVerify";
import type { ConnectSessionData } from "./types";

const claimSession: ConnectSessionData = {
  session_id: "session_1",
  status: "PENDING_CLAIM",
  claim_url: "https://app.example.test/claim/session_1",
  verification_code: "ABC-123",
  poll_token: "poll_1",
  expires_at: "2099-01-01T00:00:00.000Z",
  interval_seconds: 2
};

function renderStepVerify(overrides: Record<string, unknown> = {}) {
  const props = {
    method: "apikey" as const,
    apiKey: "cd_live_1234567890",
    claimSession: null as ConnectSessionData | null,
    pollStatus: "idle" as const,
    pollError: null as string | null,
    onVerified: vi.fn(),
    onApiKeySet: vi.fn(),
    onExchangeForApiKey: vi.fn(),
    onBack: vi.fn(),
    ...overrides
  };

  render(<StepVerify {...props} />);
  return props;
}

describe("StepVerify", () => {
  const clipboardWriteText = vi.fn();

  beforeEach(() => {
    apiRequestMock.mockReset();
    clipboardWriteText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWriteText }
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("auto-verifies an API key and exposes the resolved agent contract", async () => {
    apiRequestMock.mockResolvedValueOnce({
      data: {
        data: {
          agent_id: "agent_1",
          name: "Alpha",
          owner_id: "owner_1",
          installation_id: "installation_1",
          oauth_scopes: ["agent:read", "deals:read"]
        }
      }
    });

    const props = renderStepVerify();

    await waitFor(() => {
      expect(props.onVerified).toHaveBeenCalledWith(expect.objectContaining({
        agent_id: "agent_1",
        owner_id: "owner_1"
      }));
    });

    expect(apiRequestMock).toHaveBeenCalledWith({
      path: "/v1/agents/me",
      method: "GET",
      apiKey: "cd_live_1234567890"
    });
    expect(screen.getByText("agent_1")).toBeDefined();
    expect(screen.getByText("agent:read, deals:read")).toBeDefined();
    expect(screen.getByText("cd_liv…7890")).toBeDefined();
  });

  it("rejects missing identity data and surfaces API failures", async () => {
    apiRequestMock.mockResolvedValueOnce({ data: { data: null } });
    const first = renderStepVerify();

    await waitFor(() => {
      expect(screen.getByText("step.verify.apikey.identityError")).toBeDefined();
    });
    expect(first.onVerified).not.toHaveBeenCalled();

    cleanup();
    apiRequestMock.mockRejectedValueOnce(new Error("identity service unavailable"));
    const second = renderStepVerify({ apiKey: "cd_live_other_key_123" });

    await waitFor(() => {
      expect(screen.getByText("identity service unavailable")).toBeDefined();
    });
    expect(second.onVerified).not.toHaveBeenCalled();
  });

  it("opens, copies and renders the QR code for a pending claim", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    clipboardWriteText.mockResolvedValue(undefined);
    renderStepVerify({
      method: "claim",
      apiKey: null,
      claimSession,
      pollStatus: "polling"
    });

    fireEvent.click(screen.getByText("step.verify.claim.openClaimPage"));
    expect(open).toHaveBeenCalledWith(claimSession.claim_url, "_blank", "noopener,noreferrer");
    expect(screen.getByText("step.verify.claim.popupBlocked")).toBeDefined();

    fireEvent.click(screen.getByText("step.verify.claim.copyLink"));
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(claimSession.claim_url);
    });
    expect(screen.getByText("common.copied")).toBeDefined();

    fireEvent.click(screen.getByText("step.verify.claim.qrCode"));
    expect(screen.getByTestId("qr-code").textContent).toBe(claimSession.claim_url);
    expect(screen.getAllByText(claimSession.verification_code)).toHaveLength(2);
  });

  it("exchanges a claimed session and prefers the fetched identity", async () => {
    const resolvedIdentity = {
      agent_id: "agent_resolved",
      name: "Resolved",
      owner_id: "owner_1",
      installation_id: "installation_resolved",
      oauth_scopes: ["agent:read"]
    };
    apiRequestMock.mockResolvedValueOnce({ data: { data: resolvedIdentity } });
    const exchange = vi.fn().mockResolvedValue({
      session_id: "session_1",
      status: "CLAIMED",
      agent_id: "agent_fallback",
      installation_id: "installation_fallback",
      api_key: "cd_live_exchange_123456",
      api_key_id: "key_1",
      issued_at: "2026-07-23T00:00:00.000Z"
    });

    const props = renderStepVerify({
      method: "claim",
      apiKey: null,
      claimSession,
      pollStatus: "claimed",
      onExchangeForApiKey: exchange
    });

    await waitFor(() => {
      expect(props.onVerified).toHaveBeenCalledWith(resolvedIdentity);
    });
    expect(exchange).toHaveBeenCalledWith(claimSession);
    expect(props.onApiKeySet).toHaveBeenCalledWith("cd_live_exchange_123456", "agent_fallback");
    expect(screen.getByText("agent_resolved")).toBeDefined();
  });

  it("keeps the exchanged identity when its follow-up lookup fails", async () => {
    apiRequestMock.mockRejectedValueOnce(new Error("temporary lookup failure"));
    const exchange = vi.fn().mockResolvedValue({
      session_id: "session_1",
      status: "CLAIMED",
      agent_id: "agent_fallback",
      installation_id: "installation_fallback",
      api_key: "cd_live_exchange_fallback",
      api_key_id: "key_2",
      issued_at: "2026-07-23T00:00:00.000Z"
    });

    const props = renderStepVerify({
      method: "claim",
      apiKey: null,
      claimSession,
      pollStatus: "claimed",
      onExchangeForApiKey: exchange
    });

    await waitFor(() => {
      expect(props.onVerified).toHaveBeenCalledWith(expect.objectContaining({
        agent_id: "agent_fallback",
        installation_id: "installation_fallback",
        oauth_scopes: ["agent:read", "agent:write"]
      }));
    });
  });

  it("surfaces exchange and polling errors through retry actions", async () => {
    const exchange = vi.fn().mockRejectedValue(new Error("exchange denied"));
    const props = renderStepVerify({
      method: "claim",
      apiKey: null,
      claimSession,
      pollStatus: "claimed",
      pollError: "poll timed out",
      onExchangeForApiKey: exchange
    });

    await waitFor(() => {
      expect(screen.getByText("exchange denied")).toBeDefined();
    });
    expect(screen.getByText("poll timed out")).toBeDefined();

    const retryButtons = screen.getAllByText("common.tryAgain");
    fireEvent.click(retryButtons[0]);
    fireEvent.click(retryButtons[1]);
    expect(props.onBack).toHaveBeenCalledTimes(2);
  });

  it("validates a pasted MCP key and supports copy and skip", async () => {
    clipboardWriteText.mockResolvedValue(undefined);
    apiRequestMock.mockResolvedValueOnce({
      data: {
        data: {
          agent_id: "agent_mcp",
          name: null,
          owner_id: null,
          installation_id: null,
          oauth_scopes: []
        }
      }
    });
    const props = renderStepVerify({
      method: "mcp",
      apiKey: null
    });

    fireEvent.click(screen.getByText("step.verify.mcp.verify"));
    expect(screen.getByText("step.verify.mcp.pasteToVerify")).toBeDefined();

    fireEvent.change(screen.getByPlaceholderText("cd_live_..."), {
      target: { value: "  cd_live_pasted_123  " }
    });
    fireEvent.click(screen.getByText("step.verify.mcp.verify"));

    await waitFor(() => {
      expect(props.onVerified).toHaveBeenCalledWith(expect.objectContaining({
        agent_id: "agent_mcp"
      }));
    });
    expect(props.onApiKeySet).toHaveBeenCalledWith("cd_live_pasted_123", "agent_mcp");

    fireEvent.click(screen.getByText("step.verify.mcp.copyPrompt"));
    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(
        "List tools, then call:\nclawdeals.deals.list { \"limit\": 1 }"
      );
    });

    fireEvent.click(screen.getByText("step.verify.mcp.skipVerify"));
    expect(props.onVerified).toHaveBeenLastCalledWith(null);
  });

  it("reports invalid MCP identities and network errors", async () => {
    apiRequestMock.mockResolvedValueOnce({ data: { data: {} } });
    const first = renderStepVerify({
      method: "mcp",
      apiKey: "cd_live_existing_123"
    });

    fireEvent.click(screen.getByText("step.verify.mcp.verify"));
    await waitFor(() => {
      expect(screen.getByText("step.verify.mcp.identityError")).toBeDefined();
    });
    expect(first.onVerified).not.toHaveBeenCalled();

    cleanup();
    apiRequestMock.mockRejectedValueOnce(new Error("MCP lookup failed"));
    renderStepVerify({
      method: "mcp",
      apiKey: "cd_live_existing_456"
    });
    fireEvent.click(screen.getByText("step.verify.mcp.verify"));

    await waitFor(() => {
      expect(screen.getByText("MCP lookup failed")).toBeDefined();
    });
  });
});
