// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionReceipt } from "../../webmcp/activity/action-receipts";

const state = vi.hoisted(() => ({ receipts: [] as ActionReceipt[] }));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, number | string>) => {
    const messages: Record<string, string> = {
      "milestones.title": "What you should see", "milestones.progress": "{done}/{total} observed",
      "approvals.count": "{count} approval awaiting your decision", "dealRoom.status.reserved.label": "Reserved",
      "approvals.aboveCeiling": "The agent tried {amount}, above your {ceiling} ceiling.",
      "dealRoom.consent.granted": "granted", "dealRoom.consent.pending": "pending", "dealRoom.openThread": "Open thread",
      "dealRoom.openOffers": "Open offers", "dealRoom.approval": "Approval {id}"
    };
    return (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  }
}));

vi.mock("./useWebMcpReceipts", () => ({
  useWebMcpReceipts: () => state.receipts
}));

import DealRoomPanel from "./DealRoomPanel";
import MissionMilestones from "./MissionMilestones";
import PendingApprovalBanner from "./PendingApprovalBanner";

function receipt(input: Partial<Omit<ActionReceipt, "tool">> & { tool: string; at: string }): ActionReceipt {
  const { tool, at, ...rest } = input;
  return {
    receipt_version: "1",
    receipt_id: `rcpt_${tool}_${at}`,
    request_id: `req_${tool}_${at}`,
    tool: { name: tool, version: "2026-08-26" },
    actor: "agent",
    arguments_summary: {},
    input_hash: `sha256:${"b".repeat(64)}`,
    policy: { decision: "server_accepted" },
    confirmation: "approved",
    approval_ids: [],
    outcome: "success",
    best_effort_error: null,
    result: {},
    timestamp: `2026-09-03T10:00:${at}.000Z`,
    link: null,
    ...rest
  };
}

afterEach(cleanup);
beforeEach(() => {
  state.receipts = [];
});

describe("MissionMilestones", () => {
  it("renders nine pending rows and a 0/9 counter without receipts", () => {
    render(<MissionMilestones />);
    expect(screen.getAllByTestId("mission-milestone")).toHaveLength(9);
    expect(screen.getByTestId("mission-milestones-progress").textContent).toBe("0/9 observed");
  });

  it("lights up milestones from receipts", () => {
    state.receipts = [
      receipt({ tool: "create_buy_mission", at: "01", result: { mission: { hard_budget_max: 1300, currency: "EUR" } } }),
      receipt({
        tool: "respond_to_offer",
        at: "02",
        outcome: "denied",
        policy: { decision: "server_rejected", error_code: "APPROVAL_REQUIRED" },
        approval_ids: ["appr_1"],
        arguments_summary: { action: "accept", amount: 1350, currency: "EUR" },
        result: { code: "APPROVAL_REQUIRED" }
      })
    ];
    render(<MissionMilestones />);
    const rows = screen.getAllByTestId("mission-milestone");
    const byId = Object.fromEntries(rows.map((row) => [row.getAttribute("data-milestone-id"), row.getAttribute("data-state")]));
    expect(byId.mission_created).toBe("done");
    expect(byId.policy_stop).toBe("done");
    expect(byId.reserved).toBe("pending");
    expect(screen.getByTestId("mission-milestones-progress").textContent).toBe("2/9 observed");
  });
});

describe("PendingApprovalBanner", () => {
  it("renders nothing without pending approvals", () => {
    render(<PendingApprovalBanner />);
    expect(screen.queryByTestId("pending-approval-banner")).toBeNull();
  });

  it("links to the owner approval page with the attempted amount and the ceiling", () => {
    state.receipts = [
      receipt({ tool: "create_buy_mission", at: "01", result: { mission: { hard_budget_max: 1300, currency: "EUR" } } }),
      receipt({
        tool: "make_offer",
        at: "02",
        outcome: "denied",
        policy: { decision: "server_rejected", error_code: "APPROVAL_REQUIRED" },
        approval_ids: ["appr_42"],
        arguments_summary: { amount: 1350, currency: "EUR" },
        result: { code: "APPROVAL_REQUIRED" }
      })
    ];
    render(<PendingApprovalBanner />);
    expect(screen.getByTestId("pending-approval-banner").textContent).toContain("1 approval awaiting your decision");
    expect(screen.getByTestId("pending-approval-banner").textContent).toContain("€1,350");
    expect(screen.getByTestId("pending-approval-banner").textContent).toContain("€1,300");
    expect(screen.getByTestId("pending-approval-review").getAttribute("href")).toBe("/my/approvals/appr_42");
  });

  it("disappears once the owner resolves the approval", () => {
    state.receipts = [
      receipt({
        tool: "make_offer",
        at: "02",
        outcome: "denied",
        policy: { decision: "server_rejected", error_code: "APPROVAL_REQUIRED" },
        approval_ids: ["appr_42"],
        result: { code: "APPROVAL_REQUIRED" }
      }),
      receipt({ tool: "resolve_approval", at: "03", actor: "owner", result: { approval_id: "appr_42", state: "APPROVED" } })
    ];
    render(<PendingApprovalBanner />);
    expect(screen.queryByTestId("pending-approval-banner")).toBeNull();
  });
});

describe("DealRoomPanel", () => {
  it("renders nothing before a negotiation starts", () => {
    state.receipts = [receipt({ tool: "search_listings", at: "01", result: { items: [] } })];
    render(<DealRoomPanel />);
    expect(screen.queryByTestId("deal-room")).toBeNull();
  });

  it("shows the reserved state, the latest amount and approval links", () => {
    state.receipts = [
      receipt({ tool: "start_thread", at: "01", result: { thread_id: "11111111-1111-4111-8111-111111111111", listing_id: "l1" } }),
      receipt({ tool: "send_message", at: "02", result: { message_id: "m1", thread_id: "11111111-1111-4111-8111-111111111111" } }),
      receipt({ tool: "make_offer", at: "03", result: { offer_id: "o1", amount: 1100, currency: "EUR", status: "PENDING" } }),
      receipt({
        tool: "respond_to_offer",
        at: "04",
        arguments_summary: { offer_id: "o1", action: "accept" },
        result: { offer_id: "o1", status: "ACCEPTED", listing_status: "RESERVED", transaction: { tx_id: "tx-1", listing_id: "l1" } }
      }),
      receipt({
        tool: "request_contact_reveal",
        at: "05",
        approval_ids: ["appr_consent"],
        result: { tx_id: "tx-1", approval_id: "appr_consent", consent_states: { buyer: "GRANTED", seller: "PENDING" } }
      })
    ];
    render(<DealRoomPanel />);
    expect(screen.getByTestId("deal-room").getAttribute("data-status")).toBe("reserved");
    expect(screen.getByTestId("deal-room-status").textContent).toBe("Reserved");
    expect(screen.getByTestId("deal-room-amount").textContent).toBe("€1,100");
    expect(screen.getByText("granted")).toBeTruthy();
    expect(screen.getByText("pending")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Approval appr_con/ }).getAttribute("href")).toBe("/my/approvals/appr_consent");
    expect(screen.getByRole("link", { name: /Open thread/ }).getAttribute("href")).toBe("/my/threads");
  });
});
