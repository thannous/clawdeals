// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { receipt, receipts } = vi.hoisted(() => {
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
  return { receipt, receipts: [receipt] };
});

vi.mock("./ui-bridge", () => ({
  getWebMcpActionReceipts: () => receipts,
  subscribeWebMcpActionReceipts: () => () => undefined
}));

import ActivityHud from "./ActivityHud";

afterEach(cleanup);

describe("ActivityHud", () => {
  it("renders a human-readable, redacted and linked receipt", () => {
    render(<ActivityHud />);

    expect(screen.getByTestId("webmcp-activity-hud")).toBeTruthy();
    expect(screen.getByText("make_offer")).toBeTruthy();
    expect(screen.getByText("success")).toBeTruthy();
    expect(screen.getByText("req-1")).toBeTruthy();
    expect(screen.getByText(/human_approved_and_server_accepted/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open related view/i }).getAttribute("href")).toBe("/webmcp");
    expect(document.body.textContent).toContain("[REDACTED]");
    expect(document.body.textContent).not.toContain("cd_live_");
  });

  it("can minimize without losing the persistent receipt count", () => {
    render(<ActivityHud />);
    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));

    expect(screen.queryByTestId("webmcp-action-receipts")).toBeNull();
    expect(screen.getByText("1 redacted receipt")).toBeTruthy();
  });
});
