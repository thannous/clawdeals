// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const messages: Record<string, string> = {
      "agentKey.roles.buyer": "Buyer", "agentKey.roles.seller": "Seller", "agentKey.roles.other": "other",
      "agentKey.connected": "{role} key connected.", "agentKey.switched": "Switched to the {role} key.",
      "agentKey.roleKey": "{role} key", "agentKey.switchTo": "Switch to {role}", "agentKey.addRole": "Add {role} key",
      "agentKey.disconnected": "Disconnected.", "agentKey.agentKey": "Agent key", "agentKey.disconnect": "Disconnect",
      "agentKey.paste": "Paste a synthetic agent key", "agentKey.pasteRole": "Paste the {role} key", "agentKey.role": "Role",
      "agentKey.hide": "Hide key", "agentKey.show": "Show key", "agentKey.checking": "Checking…", "agentKey.connect": "Connect",
      "agentKey.hint": "Judge keys are supplied privately.", "agentKey.errors.rejectedSandbox": "This key was rejected.",
      "agentKey.errors.rejectedHost": "This key was rejected here.", "agentKey.errors.verify": "Could not verify the key.", "common.cancel": "Cancel"
    };
    return (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values?.[name] || "");
  }
}));

vi.mock("../developer/api", () => ({
  apiRequest: vi.fn(),
  maskApiKey: (key: string) => `${key.slice(0, 6)}…${key.slice(-4)}`
}));

import { apiRequest } from "../developer/api";
import { getStoredApiKey } from "../developer/storage";
import AgentKeyConnect from "./AgentKeyConnect";
import { getRoleKeys } from "./role-keys";

afterEach(cleanup);
beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

async function connect(key: string, role: "buyer" | "seller") {
  fireEvent.change(screen.getByTestId("agent-key-role"), { target: { value: role } });
  fireEvent.change(screen.getByTestId("agent-key-input"), { target: { value: key } });
  await act(async () => {
    fireEvent.submit(screen.getByTestId("agent-key-form"));
  });
}

describe("AgentKeyConnect", () => {
  it("stores a verified key and lets the judge switch roles without re-pasting", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: {}, headers: new Headers() });
    render(<AgentKeyConnect />);

    await connect("cd_test_buyer_key_0001", "buyer");
    await waitFor(() => expect(getStoredApiKey()).toBe("cd_test_buyer_key_0001"));
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/v1/deals?limit=1", method: "GET", apiKey: "cd_test_buyer_key_0001" })
    );
    expect(screen.getByTestId("agent-key-connected").textContent).toContain("Buyer key");
    expect(document.body.textContent).not.toContain("cd_test_buyer_key_0001");

    fireEvent.click(screen.getByTestId("agent-key-add-other"));
    await connect("cd_test_seller_key_0002", "seller");
    await waitFor(() => expect(getStoredApiKey()).toBe("cd_test_seller_key_0002"));
    expect(getRoleKeys()).toEqual({ buyer: "cd_test_buyer_key_0001", seller: "cd_test_seller_key_0002" });

    fireEvent.click(screen.getByTestId("agent-key-switch"));
    await waitFor(() => expect(getStoredApiKey()).toBe("cd_test_buyer_key_0001"));
    expect(screen.getByTestId("agent-key-switch").textContent).toContain("Switch to seller");

    fireEvent.click(screen.getByTestId("agent-key-disconnect"));
    await waitFor(() => expect(getStoredApiKey()).toBeNull());
    expect(getRoleKeys()).toEqual({});
    expect(screen.getByTestId("agent-key-form")).toBeTruthy();
  });

  it("does not store a rejected key", async () => {
    vi.mocked(apiRequest).mockRejectedValue({ status: 401, code: "UNAUTHORIZED", message: "Unauthorized" });
    render(<AgentKeyConnect />);

    await connect("cd_test_bad_key_000000", "buyer");
    await waitFor(() => expect(screen.getByTestId("agent-key-message").textContent).toMatch(/rejected/i));
    expect(getStoredApiKey()).toBeNull();
    expect(getRoleKeys()).toEqual({});
  });
});
