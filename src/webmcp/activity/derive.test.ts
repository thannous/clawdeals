import { describe, expect, it } from "vitest";

import type { ActionReceipt } from "./action-receipts";
import { deriveDealRoom, deriveMilestones, derivePendingApprovals, formatAmount } from "./derive";

let counter = 0;

type ReceiptInput = Partial<Omit<ActionReceipt, "tool">> & { tool: string; at: number };

function receipt(overrides: ReceiptInput): ActionReceipt {
  counter += 1;
  const { tool, at, ...rest } = overrides;
  return {
    receipt_version: "1",
    receipt_id: `rcpt_${counter}`,
    request_id: `req_${counter}`,
    tool: { name: tool, version: "2026-08-26" },
    actor: "agent",
    arguments_summary: {},
    input_hash: `sha256:${"a".repeat(64)}`,
    policy: { decision: "server_accepted" },
    confirmation: "approved",
    approval_ids: [],
    outcome: "success",
    best_effort_error: null,
    result: {},
    timestamp: new Date(Date.UTC(2026, 8, 3, 10, 0, at)).toISOString(),
    link: null,
    ...rest
  };
}

const mission = receipt({
  tool: "create_buy_mission",
  at: 1,
  arguments_summary: { hard_budget_max: 1300, preferred_price_max: 1200 },
  result: { mission: { mission_id: "m1", hard_budget_max: 1300, currency: "EUR" } }
});
const search = receipt({
  tool: "search_listings",
  at: 2,
  confirmation: "not_required",
  result: { items: [{ listing_id: "l1", policy_fit: { eligible: true, issues: [] } }] }
});
const thread = receipt({ tool: "start_thread", at: 3, result: { thread_id: "t1", listing_id: "l1" } });
const message = receipt({ tool: "send_message", at: 4, result: { message_id: "msg1", thread_id: "t1" } });
const offer = receipt({
  tool: "make_offer",
  at: 5,
  arguments_summary: { amount: 1100, currency: "EUR" },
  result: { offer_id: "o1", amount: 1100, currency: "EUR", status: "PENDING", thread_id: "t1", listing_id: "l1" }
});
const policyStop = receipt({
  tool: "respond_to_offer",
  at: 6,
  outcome: "denied",
  arguments_summary: { offer_id: "o2", action: "accept" },
  policy: { decision: "server_rejected", error_code: "APPROVAL_REQUIRED" },
  approval_ids: ["appr_1"],
  result: { code: "APPROVAL_REQUIRED", details: { approval_id: "appr_1" } }
});
const resolved = receipt({
  tool: "resolve_approval",
  at: 7,
  actor: "owner",
  approval_ids: ["appr_1"],
  result: { approval_id: "appr_1", state: "APPROVED" }
});
const accepted = receipt({
  tool: "respond_to_offer",
  at: 8,
  arguments_summary: { offer_id: "o1", action: "accept" },
  result: { offer_id: "o1", status: "ACCEPTED", listing_status: "RESERVED", transaction: { tx_id: "tx1", listing_id: "l1" } }
});
const consent = receipt({
  tool: "request_contact_reveal",
  at: 9,
  approval_ids: ["appr_consent"],
  result: { tx_id: "tx1", approval_id: "appr_consent", consent_states: { buyer: "GRANTED", seller: "PENDING" } }
});
const reread = receipt({ tool: "get_action_receipt", at: 10, confirmation: "not_required", result: { receipt_version: "1" } });

describe("deriveMilestones", () => {
  it("returns nine pending milestones without receipts", () => {
    const milestones = deriveMilestones([]);
    expect(milestones).toHaveLength(9);
    expect(milestones.every((entry) => entry.state === "pending")).toBe(true);
  });

  it("marks the full judge journey regardless of receipt order", () => {
    const shuffled = [reread, consent, accepted, resolved, policyStop, offer, message, thread, search, mission];
    const milestones = deriveMilestones(shuffled);
    const byId = Object.fromEntries(milestones.map((entry) => [entry.id, entry]));

    expect(byId.mission_created.state).toBe("done");
    expect(byId.candidates_ranked.state).toBe("done");
    expect(byId.thread_opened.state).toBe("done");
    expect(byId.offer_prepared.state).toBe("done");
    expect(byId.policy_stop.state).toBe("done");
    expect(byId.policy_stop.requestId).toBe(policyStop.request_id);
    expect(byId.human_approval.state).toBe("done");
    expect(byId.reserved.state).toBe("done");
    expect(byId.consent_pending.state).toBe("done");
    expect(byId.receipt_verified.state).toBe("done");
  });

  it("does not count a human-denied offer or a search without policy_fit", () => {
    const denied = receipt({ tool: "make_offer", at: 5, outcome: "denied", confirmation: "denied", policy: { decision: "human_denied" }, result: { code: "USER_DENIED" } });
    const plainSearch = receipt({ tool: "search_listings", at: 2, result: { items: [{ listing_id: "l1" }] } });
    const byId = Object.fromEntries(deriveMilestones([denied, plainSearch]).map((entry) => [entry.id, entry]));
    expect(byId.offer_prepared.state).toBe("pending");
    expect(byId.policy_stop.state).toBe("pending");
    expect(byId.candidates_ranked.state).toBe("pending");
  });
});

describe("derivePendingApprovals", () => {
  it("lists a policy stop with the attempted amount and the mission ceiling", () => {
    const attempted = receipt({
      tool: "make_offer",
      at: 6,
      outcome: "denied",
      arguments_summary: { amount: 1350, currency: "EUR" },
      policy: { decision: "server_rejected", error_code: "APPROVAL_REQUIRED" },
      approval_ids: ["appr_9"],
      result: { code: "APPROVAL_REQUIRED" }
    });
    const pending = derivePendingApprovals([attempted, mission]);
    expect(pending).toEqual([
      expect.objectContaining({ approvalId: "appr_9", kind: "policy", amount: 1350, currency: "EUR", hardBudgetMax: 1300 })
    ]);
  });

  it("removes approvals once the owner resolves them and keeps consent approvals separate", () => {
    const pending = derivePendingApprovals([mission, policyStop, resolved, consent]);
    expect(pending.map((entry) => entry.approvalId)).toEqual(["appr_consent"]);
    expect(pending[0].kind).toBe("consent");
  });

  it("deduplicates identical approval ids across retries", () => {
    const retry = { ...policyStop, receipt_id: "rcpt_retry", request_id: "req_retry" };
    expect(derivePendingApprovals([policyStop, retry])).toHaveLength(1);
  });
});

describe("deriveDealRoom", () => {
  it("returns null without negotiation receipts", () => {
    expect(deriveDealRoom([mission, search])).toBeNull();
  });

  it("follows thread → offer → policy stop → reserved → consent", () => {
    expect(deriveDealRoom([thread, message])).toMatchObject({ status: "thread_open", threadId: "t1", listingId: "l1", messagesSent: 1 });
    expect(deriveDealRoom([thread, offer])).toMatchObject({ status: "offer_pending", offer: { offerId: "o1", amount: 1100, currency: "EUR" } });
    expect(deriveDealRoom([thread, offer, policyStop])).toMatchObject({ status: "approval_required", approvalIds: ["appr_1"] });
    expect(deriveDealRoom([thread, offer, policyStop, resolved, accepted])).toMatchObject({ status: "reserved", txId: "tx1" });
    expect(deriveDealRoom([thread, offer, accepted, consent])).toMatchObject({
      status: "reserved",
      consent: { buyer: "GRANTED", seller: "PENDING" },
      approvalIds: ["appr_consent"]
    });
  });

  it("records seller counters and declines", () => {
    const counter = receipt({
      tool: "respond_to_offer",
      at: 6,
      arguments_summary: { offer_id: "o1", action: "counter", amount: 1350, currency: "EUR" },
      result: { offer_id: "o2", amount: 1350, currency: "EUR", status: "PENDING" }
    });
    expect(deriveDealRoom([offer, counter])).toMatchObject({ status: "countered", offer: { offerId: "o2", amount: 1350 } });
    const declined = receipt({ tool: "respond_to_offer", at: 7, arguments_summary: { offer_id: "o2", action: "decline" }, result: { offer_id: "o2", status: "DECLINED" } });
    expect(deriveDealRoom([offer, counter, declined])).toMatchObject({ status: "declined" });
  });
});

describe("formatAmount", () => {
  it("formats amounts and tolerates unknown currencies", () => {
    expect(formatAmount(1300, "EUR")).toBe("€1,300");
    expect(formatAmount(1300, "EUR", "fr")).toMatch(/1[\s\u202f]300\s€/);
    expect(formatAmount(null, "EUR")).toBeNull();
    expect(formatAmount(12, "???")).toBe("12 ???");
  });
});
