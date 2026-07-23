import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerMock: {
  isReady: boolean;
  query: Record<string, string | string[] | undefined>;
} = {
  isReady: true,
  query: {},
};

vi.mock("next/router", () => ({
  useRouter: () => routerMock,
}));

vi.mock("./api", () => ({
  fetchDeviceRequest: vi.fn(),
  approveDevice: vi.fn(),
  denyDevice: vi.fn(),
}));

import { approveDevice, denyDevice, fetchDeviceRequest } from "./api";
import DevicePage from "./DevicePage";

const baseRequest = {
  authorization_id: "11111111-1111-4111-8111-111111111111",
  status: "PENDING",
  client_id: "openclaw-cli",
  requested_scopes: ["agent:read", "agent:write"],
  requested_agent_name: "Deal Scout",
  expires_at: "2099-01-01T00:00:00.000Z",
  owner_id: null,
  agent_id: null,
  authorized_at: null,
  denied_at: null,
};

describe("DevicePage", () => {
  beforeEach(() => {
    routerMock.isReady = true;
    routerMock.query = {};
    vi.mocked(fetchDeviceRequest).mockReset();
    vi.mocked(approveDevice).mockReset();
    vi.mocked(denyDevice).mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("normalizes manual codes and rejects invalid formats without an API call", async () => {
    render(<DevicePage />);

    fireEvent.change(screen.getByTestId("device-user-code"), { target: { value: "abc0 efgh" } });
    fireEvent.click(screen.getByTestId("device-lookup"));

    expect((await screen.findByTestId("device-error")).textContent).toContain("Invalid code format");
    expect((screen.getByTestId("device-user-code") as HTMLInputElement).value).toBe("ABC0 EFGH");
    expect(fetchDeviceRequest).not.toHaveBeenCalled();
  });

  it("looks up a query-string code and renders the pending request", async () => {
    routerMock.query = { userCode: ["abcd-efgh", "ignored"] };
    vi.mocked(fetchDeviceRequest).mockResolvedValue({ ok: true, data: baseRequest as any });

    render(<DevicePage />);

    expect(await screen.findByTestId("device-loaded")).toBeDefined();
    expect(fetchDeviceRequest).toHaveBeenCalledWith("ABCD-EFGH");
    expect(screen.getByTestId("device-status").textContent).toBe("PENDING");
    expect(screen.getByText("agent:read")).toBeDefined();
    expect((screen.getByLabelText("New Agent Name") as HTMLInputElement).value).toBe("Deal Scout");
  });

  it("shows lookup failures and clears the previous request", async () => {
    vi.mocked(fetchDeviceRequest).mockResolvedValue({
      ok: false,
      status: 404,
      error: "Unknown device code",
    });

    render(<DevicePage />);
    fireEvent.change(screen.getByTestId("device-user-code"), { target: { value: "ABCD-EFGH" } });
    fireEvent.click(screen.getByTestId("device-lookup"));

    expect((await screen.findByTestId("device-error")).textContent).toContain("Unknown device code");
    expect(screen.queryByTestId("device-loaded")).toBeNull();
  });

  it("approves a request by creating the requested agent", async () => {
    vi.mocked(fetchDeviceRequest).mockResolvedValue({ ok: true, data: baseRequest as any });
    vi.mocked(approveDevice).mockResolvedValue({
      ok: true,
      data: {
        status: "AUTHORIZED",
        agent_id: "agent-created",
        owner_id: "owner-1",
        authorized_at: "2026-07-23T10:00:00.000Z",
      },
    });

    render(<DevicePage />);
    fireEvent.change(screen.getByTestId("device-user-code"), { target: { value: "ABCD-EFGH" } });
    fireEvent.click(screen.getByTestId("device-lookup"));
    await screen.findByTestId("device-loaded");

    fireEvent.change(screen.getByLabelText("New Agent Name"), { target: { value: "New Agent" } });
    fireEvent.click(screen.getByTestId("device-approve"));

    await waitFor(() => {
      expect(approveDevice).toHaveBeenCalledWith({
        userCode: "ABCD-EFGH",
        mode: "create_agent",
        agentName: "New Agent",
        attachAgentId: undefined,
      });
    });
    expect(screen.getByTestId("device-status").textContent).toBe("AUTHORIZED");
    expect(screen.getByText(/agent_id=agent-created/)).toBeDefined();
  });

  it("approves through attach mode and exposes API failures", async () => {
    vi.mocked(fetchDeviceRequest).mockResolvedValue({ ok: true, data: baseRequest as any });
    vi.mocked(approveDevice).mockResolvedValue({
      ok: false,
      status: 409,
      error: "Agent belongs to another owner",
    });

    render(<DevicePage />);
    fireEvent.change(screen.getByTestId("device-user-code"), { target: { value: "ABCD-EFGH" } });
    fireEvent.click(screen.getByTestId("device-lookup"));
    await screen.findByTestId("device-loaded");

    fireEvent.click(screen.getByText("Attach"));
    fireEvent.change(screen.getByLabelText("Existing Agent ID"), { target: { value: "agent-existing" } });
    fireEvent.click(screen.getByTestId("device-approve"));

    expect(await screen.findByText("Agent belongs to another owner")).toBeDefined();
    expect(approveDevice).toHaveBeenCalledWith({
      userCode: "ABCD-EFGH",
      mode: "attach_agent",
      agentName: undefined,
      attachAgentId: "agent-existing",
    });
  });

  it("requires confirmation before denying and finalizes a confirmed denial", async () => {
    vi.mocked(fetchDeviceRequest).mockResolvedValue({ ok: true, data: baseRequest as any });
    vi.mocked(denyDevice).mockResolvedValue({
      ok: true,
      data: { status: "DENIED", denied_at: "2026-07-23T10:00:00.000Z" },
    });
    vi.mocked(window.confirm).mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(<DevicePage />);
    fireEvent.change(screen.getByTestId("device-user-code"), { target: { value: "ABCD-EFGH" } });
    fireEvent.click(screen.getByTestId("device-lookup"));
    await screen.findByTestId("device-loaded");

    fireEvent.click(screen.getByTestId("device-deny"));
    expect(denyDevice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("device-deny"));

    await waitFor(() => expect(denyDevice).toHaveBeenCalledWith({ userCode: "ABCD-EFGH" }));
    expect(screen.getByTestId("device-status").textContent).toBe("DENIED");
  });

  it("disables actions for expired and already-authorized requests", async () => {
    vi.mocked(fetchDeviceRequest)
      .mockResolvedValueOnce({
        ok: true,
        data: { ...baseRequest, expires_at: "2000-01-01T00:00:00.000Z" } as any,
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { ...baseRequest, status: "AUTHORIZED" } as any,
      });

    const first = render(<DevicePage />);
    fireEvent.change(screen.getByTestId("device-user-code"), { target: { value: "ABCD-EFGH" } });
    fireEvent.click(screen.getByTestId("device-lookup"));
    await screen.findByTestId("device-loaded");
    expect((screen.getByTestId("device-approve") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/expired .* ago/)).toBeDefined();
    first.unmount();

    render(<DevicePage />);
    fireEvent.change(screen.getByTestId("device-user-code"), { target: { value: "ABCD-EFGH" } });
    fireEvent.click(screen.getByTestId("device-lookup"));
    await screen.findByTestId("device-loaded");
    expect(screen.getByText(/not actionable/)).toBeDefined();
    expect((screen.getByTestId("device-deny") as HTMLButtonElement).disabled).toBe(true);
  });
});
