// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, number | string>) => {
    const messages: Record<string, string> = {
      "activity.policy.humanAndServerAccepted": "Approved by you · server accepted", "activity.openRelated": "Open related view",
      "activity.outcomes.success": "success",
      "common.copied": "Copied", "common.copyFailed": "Copy failed", "activity.minimize": "Minimize", "activity.expand": "Expand",
      "activity.receiptCount": "{count} redacted receipt", "activity.newCount": "{count} new"
    };
    return (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  }
}));

const state = vi.hoisted(() => {
  const receipt = {
    receipt_version: "1",
    receipt_id: "rcpt_req-1",
    request_id: "req-1",
    tool: { name: "make_offer", version: "2026-08-26" },
    actor: "agent",
    arguments_summary: { amount: 1290, api_key: "[REDACTED]" },
    input_hash: `sha256:${"a".repeat(64)}`,
    policy: { decision: "human_approved_and_server_accepted", limit: 1300 },
    confirmation: "approved",
    approval_ids: ["approval-1"],
    outcome: "success",
    best_effort_error: null,
    result: { offer_id: "offer-1", status: "accepted" },
    timestamp: "2026-08-26T10:00:00.000Z",
    link: "/webmcp"
  };
  const listeners = new Set<() => void>();
  return {
    receipt,
    receipts: [receipt] as any[],
    listeners,
    clear: vi.fn()
  };
});

vi.mock("./ui-bridge", () => ({
  getWebMcpActionReceipts: () => state.receipts,
  subscribeWebMcpActionReceipts: (listener: () => void) => {
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  },
  clearWebMcpActionReceipts: () => state.clear()
}));

import ActivityHud from "./ActivityHud";

afterEach(cleanup);
beforeEach(() => {
  state.receipts = [state.receipt];
  state.clear.mockReset();
});

describe("ActivityHud", () => {
  it("renders a human-readable, redacted and linked receipt", () => {
    render(<ActivityHud />);

    expect(screen.getByTestId("webmcp-activity-hud")).toBeTruthy();
    expect(screen.getByText("make_offer")).toBeTruthy();
    expect(screen.getByText("success")).toBeTruthy();
    expect(screen.getByText("req-1")).toBeTruthy();
    expect(screen.getByTestId("webmcp-receipt-policy-chip").textContent).toBe("Approved by you · server accepted");
    expect(screen.getByText(/human_approved_and_server_accepted/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open related view/i }).getAttribute("href")).toBe("/webmcp");
    expect(document.body.textContent).toContain("[REDACTED]");
    expect(document.body.textContent).not.toContain("cd_live_");
  });

  it("copies the request ID and the full sanitized receipt", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ActivityHud />);

    fireEvent.click(screen.getByTestId("webmcp-receipt-copy-request-id"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("req-1"));
    fireEvent.click(screen.getByTestId("webmcp-receipt-copy-receipt"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(JSON.parse(writeText.mock.calls[1][0] as string)).toMatchObject({ receipt_id: "rcpt_req-1", outcome: "success" });
    expect(await screen.findAllByText("Copied")).not.toHaveLength(0);
  });

  it("can minimize without losing the persistent receipt count and flags new receipts", () => {
    render(<ActivityHud />);
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));

    expect(screen.queryByTestId("webmcp-action-receipts")).toBeNull();
    expect(screen.getByText("1 redacted receipt")).toBeTruthy();
    expect(screen.queryByTestId("webmcp-activity-unread")).toBeNull();

    act(() => {
      state.receipts = [{ ...state.receipt, receipt_id: "rcpt_req-2", request_id: "req-2" }, state.receipt];
      for (const listener of state.listeners) listener();
    });
    expect(screen.getByTestId("webmcp-activity-unread").textContent).toContain("1 new");

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.queryByTestId("webmcp-activity-unread")).toBeNull();
    expect(screen.getAllByTestId("webmcp-action-receipt")).toHaveLength(2);
  });

  it("asks for confirmation before clearing receipts", () => {
    render(<ActivityHud />);
    fireEvent.click(screen.getByTestId("webmcp-activity-clear"));
    expect(state.clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("webmcp-activity-clear-confirm"));
    expect(state.clear).toHaveBeenCalledTimes(1);
  });
});
