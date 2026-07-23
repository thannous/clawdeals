import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  replace: vi.fn(),
  show: vi.fn(),
  clipboardWriteText: vi.fn(),
  router: {
    asPath: "/settings/connected-apps?source=test",
    replace: vi.fn()
  }
}));

vi.mock("next/router", () => ({
  useRouter: () => mocks.router
}));

vi.mock("../console/shared/useToast", () => ({
  useToast: () => ({ toasts: [], show: mocks.show })
}));

vi.mock("../console/shared/Toast", () => ({
  default: () => <div data-testid="toast-host" />
}));

vi.mock("../shared/useOwnerAgents", () => ({
  useOwnerAgents: () => ({
    agentMap: { agent_1: "Named agent" }
  })
}));

vi.mock("./SettingsNav", () => ({
  default: () => <nav data-testid="settings-nav" />
}));

vi.mock("../shared/AppNav", () => ({
  default: () => <nav data-testid="app-nav" />
}));

vi.mock("../shared/PageHeader", () => ({
  default: ({ title, children }: any) => (
    <header>
      <h1>{title}</h1>
      {children}
    </header>
  )
}));

import ConnectedAppsPage from "./ConnectedAppsPage";

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body)
  };
}

const activeInstallation = {
  installation_id: "installation_active",
  agent_id: "agent_1",
  client_type: "openclaw",
  client_version: "2.4.0",
  oauth_scopes: ["agent:read", "agent:write", "deals:read", "deals:write"],
  status: "ACTIVE",
  created_at: "2026-07-20T10:00:00.000Z",
  last_seen_at: "2026-07-23T10:00:00.000Z"
};

const revokedInstallation = {
  ...activeInstallation,
  installation_id: "installation_revoked",
  client_version: null,
  oauth_scopes: [],
  status: "REVOKED",
  last_seen_at: null
};

function mockInstallations(items = [activeInstallation, revokedInstallation]) {
  mocks.fetch.mockResolvedValueOnce(response(200, { installations: items }));
}

describe("ConnectedAppsPage", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.router.replace.mockReset();
    mocks.show.mockReset();
    mocks.clipboardWriteText.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.clipboardWriteText }
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders active actions, agent names, scopes and inert revoked rows", async () => {
    mockInstallations();
    render(<ConnectedAppsPage />);

    await screen.findByTestId("connected-apps-table");
    expect(screen.getAllByText("Named agent")).toHaveLength(2);
    expect(screen.getByTestId("connected-apps-upgrade-installation_active")).toBeDefined();
    expect(screen.getByTestId("connected-apps-rotate-installation_active")).toBeDefined();
    expect(screen.getByTestId("connected-apps-revoke-installation_active")).toBeDefined();
    expect(screen.queryByTestId("connected-apps-revoke-installation_revoked")).toBeNull();
    expect(screen.getByText("+1 more")).toBeDefined();
  });

  it("renders empty and retryable error states", async () => {
    mockInstallations([]);
    const first = render(<ConnectedAppsPage />);
    await screen.findByTestId("connected-apps-empty");
    expect(screen.getByText("No connected apps found")).toBeDefined();
    first.unmount();

    mocks.fetch.mockResolvedValueOnce(response(503, {
      error: { message: "installations unavailable" }
    }));
    render(<ConnectedAppsPage />);
    await screen.findByTestId("connected-apps-error");
    expect(screen.getByText("installations unavailable")).toBeDefined();
  });

  it("retries authentication before redirecting to login", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(401, {}))
      .mockResolvedValueOnce(response(401, {}))
      .mockResolvedValueOnce(response(401, {}));
    render(<ConnectedAppsPage />);

    await waitFor(() => {
      expect(mocks.router.replace).toHaveBeenCalledWith(
        "/auth/login?next=%2Fsettings%2Fconnected-apps%3Fsource%3Dtest"
      );
    }, { timeout: 1500 });
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it("revokes with a trimmed reason and refetches the installations", async () => {
    mockInstallations([activeInstallation]);
    mocks.fetch
      .mockResolvedValueOnce(response(200, { status: "REVOKED" }))
      .mockResolvedValueOnce(response(200, { installations: [revokedInstallation] }));
    render(<ConnectedAppsPage />);

    fireEvent.click(await screen.findByTestId("connected-apps-revoke-installation_active"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByTestId("connected-apps-revoke-reason"), {
      target: { value: "  compromised device  " }
    });
    fireEvent.click(within(dialog).getByText("Revoke"));

    await waitFor(() => {
      expect(mocks.show).toHaveBeenCalledWith("Installation revoked", "success");
    });
    expect(mocks.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/installations/installation_active:revoke",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": expect.any(String)
        }),
        body: JSON.stringify({ reason: "compromised device" })
      })
    );
    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(3);
    });
  });

  it("keeps the revoke dialog open and reports API errors", async () => {
    mockInstallations([activeInstallation]);
    mocks.fetch.mockResolvedValueOnce(response(409, {
      error: { message: "already revoked elsewhere" }
    }));
    render(<ConnectedAppsPage />);

    fireEvent.click(await screen.findByTestId("connected-apps-revoke-installation_active"));
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Revoke"));

    await waitFor(() => {
      expect(screen.getByText("already revoked elsewhere")).toBeDefined();
    });
    expect(mocks.show).toHaveBeenCalledWith("already revoked elsewhere", "error");
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("requests selected scope upgrades and reports approval routing", async () => {
    mockInstallations([activeInstallation]);
    mocks.fetch
      .mockResolvedValueOnce(response(202, { approval_id: "approval_42" }))
      .mockResolvedValueOnce(response(200, { installations: [activeInstallation] }));
    render(<ConnectedAppsPage />);

    fireEvent.click(await screen.findByTestId("connected-apps-upgrade-installation_active"));
    const dialog = screen.getByRole("dialog");
    const availableScope = within(dialog)
      .getAllByRole("checkbox")
      .find((checkbox) => !(checkbox as HTMLInputElement).disabled);
    expect(availableScope).toBeDefined();
    fireEvent.click(availableScope!);
    fireEvent.click(within(dialog).getByText("Request"));

    await waitFor(() => {
      expect(mocks.show).toHaveBeenCalledWith(
        "Upgrade requested (approval approval_42). Review in /console/approvals.",
        "success"
      );
    });
    const upgradeRequest = mocks.fetch.mock.calls[1];
    expect(upgradeRequest[0]).toBe("/api/v1/installations/installation_active:scopes-upgrade");
    expect(JSON.parse(upgradeRequest[1].body).requested_scopes).toHaveLength(1);
  });

  it("validates rotation grace, parses the credential and copies it once", async () => {
    mockInstallations([activeInstallation]);
    mocks.fetch
      .mockResolvedValueOnce(response(200, {
        data: {
          api_key: "cd_live_rotated_secret",
          api_key_id: "credential_new",
          previous_api_key_id: "credential_old",
          grace_seconds: "300",
          rotated_at: "2026-07-23T12:00:00.000Z"
        }
      }))
      .mockResolvedValueOnce(response(200, { installations: [activeInstallation] }));
    mocks.clipboardWriteText.mockResolvedValue(undefined);
    render(<ConnectedAppsPage />);

    fireEvent.click(await screen.findByTestId("connected-apps-rotate-installation_active"));
    let dialog = screen.getByRole("dialog");
    const graceInput = within(dialog).getByTestId("connected-apps-rotate-grace-seconds");
    fireEvent.change(graceInput, { target: { value: "-1" } });
    fireEvent.click(within(dialog).getByText("Rotate"));
    expect(screen.getByText("Grace seconds must be a non-negative integer")).toBeDefined();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    fireEvent.change(graceInput, { target: { value: "300" } });
    fireEvent.click(within(dialog).getByText("Rotate"));

    const credential = await screen.findByTestId("connected-apps-rotate-credential");
    expect((credential as HTMLTextAreaElement).value).toBe("cd_live_rotated_secret");
    expect(screen.getByText("credential_id: credential_new")).toBeDefined();
    expect(screen.getByText("previous_credential_id: credential_old")).toBeDefined();
    expect(screen.getByText("grace_seconds: 300")).toBeDefined();

    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Copy"));
    await waitFor(() => {
      expect(mocks.clipboardWriteText).toHaveBeenCalledWith("cd_live_rotated_secret");
    });
    expect(mocks.show).toHaveBeenCalledWith("Credential copied to clipboard", "success");
  });
});
