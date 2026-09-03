import type { ActionReceipt } from "./action-receipts";

export type MilestoneId =
  | "mission_created"
  | "candidates_ranked"
  | "thread_opened"
  | "offer_prepared"
  | "policy_stop"
  | "human_approval"
  | "reserved"
  | "consent_pending"
  | "receipt_verified";

export type MilestoneState = "pending" | "done";

export type Milestone = {
  id: MilestoneId;
  labelKey: string;
  detailKey: string;
  state: MilestoneState;
  requestId: string | null;
  timestamp: string | null;
};

export type PendingApproval = {
  approvalId: string;
  kind: "policy" | "consent";
  toolName: string;
  requestId: string;
  timestamp: string;
  amount: number | null;
  currency: string | null;
  hardBudgetMax: number | null;
};

export type DealRoomStatus =
  | "thread_open"
  | "offer_pending"
  | "countered"
  | "approval_required"
  | "reserved"
  | "declined";

export type DealRoom = {
  status: DealRoomStatus;
  threadId: string | null;
  listingId: string | null;
  offer: { offerId: string | null; amount: number | null; currency: string | null; status: string | null } | null;
  txId: string | null;
  consent: { buyer: string | null; seller: string | null } | null;
  messagesSent: number;
  approvalIds: string[];
  updatedAt: string | null;
};

const MILESTONE_ORDER: MilestoneId[] = [
  "mission_created",
  "candidates_ranked",
  "thread_opened",
  "offer_prepared",
  "policy_stop",
  "human_approval",
  "reserved",
  "consent_pending",
  "receipt_verified"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function timestampMs(receipt: ActionReceipt): number {
  const value = new Date(receipt.timestamp).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function sortReceiptsAscending(receipts: readonly ActionReceipt[]): ActionReceipt[] {
  return [...receipts].sort((a, b) => timestampMs(a) - timestampMs(b));
}

function errorCode(receipt: ActionReceipt): string | null {
  const policy = record(receipt.policy);
  const result = record(receipt.result);
  return asString(policy.error_code) || asString(result.code);
}

function isApprovalRequired(receipt: ActionReceipt): boolean {
  return receipt.outcome !== "success" && errorCode(receipt) === "APPROVAL_REQUIRED";
}

function missionBudget(receipts: readonly ActionReceipt[]): { hardBudgetMax: number | null; currency: string | null } {
  let hardBudgetMax: number | null = null;
  let currency: string | null = null;
  for (const receipt of receipts) {
    if (receipt.tool.name !== "create_buy_mission" || receipt.outcome !== "success") continue;
    const mission = record(record(receipt.result).mission);
    const args = record(receipt.arguments_summary);
    hardBudgetMax = asNumber(mission.hard_budget_max) ?? asNumber(args.hard_budget_max) ?? hardBudgetMax;
    currency = asString(mission.currency) ?? currency;
  }
  return { hardBudgetMax, currency };
}

export function deriveMilestones(receipts: readonly ActionReceipt[]): Milestone[] {
  const done = new Map<MilestoneId, ActionReceipt>();
  const mark = (id: MilestoneId, receipt: ActionReceipt) => {
    if (!done.has(id)) done.set(id, receipt);
  };

  for (const receipt of sortReceiptsAscending(receipts)) {
    const name = receipt.tool.name;
    const result = record(receipt.result);

    if (isApprovalRequired(receipt) && (name === "make_offer" || name === "respond_to_offer")) {
      mark("policy_stop", receipt);
      continue;
    }
    if (receipt.outcome !== "success") continue;

    switch (name) {
      case "create_buy_mission":
        mark("mission_created", receipt);
        break;
      case "search_listings": {
        const items = Array.isArray(result.items) ? result.items : [];
        if (items.some((item) => isRecord(item) && isRecord(item.policy_fit))) mark("candidates_ranked", receipt);
        break;
      }
      case "start_thread":
        mark("thread_opened", receipt);
        break;
      case "make_offer":
        if (receipt.confirmation === "approved") mark("offer_prepared", receipt);
        break;
      case "resolve_approval":
        mark("human_approval", receipt);
        break;
      case "respond_to_offer":
        if (asString(result.listing_status) === "RESERVED") mark("reserved", receipt);
        break;
      case "request_contact_reveal": {
        const states = record(result.consent_states);
        const bothGranted = [states.buyer, states.seller].every((state) => asString(state)?.toUpperCase() === "GRANTED");
        if (!bothGranted) mark("consent_pending", receipt);
        break;
      }
      case "get_action_receipt":
        mark("receipt_verified", receipt);
        break;
      default:
        break;
    }
  }

  return MILESTONE_ORDER.map((id) => {
    const receipt = done.get(id) || null;
    return {
      id,
      labelKey: `milestones.items.${id}.label`,
      detailKey: `milestones.items.${id}.detail`,
      state: receipt ? "done" : "pending",
      requestId: receipt?.request_id ?? null,
      timestamp: receipt?.timestamp ?? null
    };
  });
}

export function derivePendingApprovals(receipts: readonly ActionReceipt[]): PendingApproval[] {
  const ordered = sortReceiptsAscending(receipts);
  const { hardBudgetMax, currency: missionCurrency } = missionBudget(ordered);
  const pending = new Map<string, PendingApproval>();

  for (const receipt of ordered) {
    const name = receipt.tool.name;

    if (name === "resolve_approval" && receipt.outcome === "success") {
      const resolved = asString(record(receipt.result).approval_id);
      if (resolved) pending.delete(resolved);
      for (const id of receipt.approval_ids) pending.delete(id);
      continue;
    }

    let kind: PendingApproval["kind"] | null = null;
    if (isApprovalRequired(receipt)) kind = "policy";
    else if (name === "request_contact_reveal" && receipt.outcome === "success") kind = "consent";
    if (!kind || receipt.approval_ids.length === 0) continue;

    const args = record(receipt.arguments_summary);
    for (const approvalId of receipt.approval_ids) {
      if (pending.has(approvalId)) continue;
      pending.set(approvalId, {
        approvalId,
        kind,
        toolName: name,
        requestId: receipt.request_id,
        timestamp: receipt.timestamp,
        amount: kind === "policy" ? asNumber(args.amount) : null,
        currency: kind === "policy" ? asString(args.currency) ?? missionCurrency : null,
        hardBudgetMax: kind === "policy" ? hardBudgetMax : null
      });
    }
  }

  return [...pending.values()];
}

export function deriveDealRoom(receipts: readonly ActionReceipt[]): DealRoom | null {
  let room: DealRoom | null = null;
  const ensure = (receipt: ActionReceipt): DealRoom => {
    if (!room) {
      room = {
        status: "thread_open",
        threadId: null,
        listingId: null,
        offer: null,
        txId: null,
        consent: null,
        messagesSent: 0,
        approvalIds: [],
        updatedAt: receipt.timestamp
      };
    }
    room.updatedAt = receipt.timestamp;
    return room;
  };
  const addApprovals = (target: DealRoom, receipt: ActionReceipt) => {
    for (const id of receipt.approval_ids) if (!target.approvalIds.includes(id)) target.approvalIds.push(id);
  };

  for (const receipt of sortReceiptsAscending(receipts)) {
    const name = receipt.tool.name;
    const result = record(receipt.result);
    const args = record(receipt.arguments_summary);

    if ((name === "make_offer" || name === "respond_to_offer") && isApprovalRequired(receipt)) {
      const current = ensure(receipt);
      current.status = "approval_required";
      addApprovals(current, receipt);
      continue;
    }
    if (receipt.outcome !== "success") continue;

    switch (name) {
      case "start_thread": {
        const current = ensure(receipt);
        current.threadId = asString(result.thread_id) ?? current.threadId;
        current.listingId = asString(result.listing_id) ?? current.listingId;
        break;
      }
      case "send_message": {
        const current = ensure(receipt);
        current.messagesSent += 1;
        current.threadId = asString(result.thread_id) ?? current.threadId;
        break;
      }
      case "make_offer": {
        const current = ensure(receipt);
        current.status = "offer_pending";
        current.threadId = asString(result.thread_id) ?? current.threadId;
        current.listingId = asString(result.listing_id) ?? current.listingId;
        current.offer = {
          offerId: asString(result.offer_id),
          amount: asNumber(result.amount) ?? asNumber(args.amount),
          currency: asString(result.currency) ?? asString(args.currency),
          status: asString(result.status)
        };
        break;
      }
      case "respond_to_offer": {
        const current = ensure(receipt);
        const action = asString(args.action);
        if (asString(result.listing_status) === "RESERVED" || action === "accept") {
          current.status = "reserved";
          const transaction = record(result.transaction);
          current.txId = asString(transaction.tx_id) ?? current.txId;
          current.listingId = asString(transaction.listing_id) ?? current.listingId;
          if (current.offer) current.offer.status = asString(result.status) ?? "ACCEPTED";
        } else if (action === "decline") {
          current.status = "declined";
          if (current.offer) current.offer.status = asString(result.status) ?? "DECLINED";
        } else {
          current.status = "countered";
          current.offer = {
            offerId: asString(result.offer_id),
            amount: asNumber(result.amount) ?? asNumber(args.amount),
            currency: asString(result.currency) ?? asString(args.currency),
            status: asString(result.status)
          };
        }
        break;
      }
      case "request_contact_reveal": {
        const current = ensure(receipt);
        current.txId = asString(result.tx_id) ?? current.txId;
        const states = record(result.consent_states);
        current.consent = { buyer: asString(states.buyer), seller: asString(states.seller) };
        addApprovals(current, receipt);
        break;
      }
      default:
        break;
    }
  }

  return room;
}

export function formatAmount(amount: number | null, currency: string | null, locale = "en"): string | null {
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${amount} ${currency || ""}`.trim();
  }
}
