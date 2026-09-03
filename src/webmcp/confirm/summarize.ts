import type { BuyMissionView } from "../ui-bridge";
import type { ConfirmRequest } from "./types";

export type ConfirmPrimaryField = {
  key: string;
  label: string;
  kind: "amount" | "text";
  value: number | string | null;
  currency: string | null;
};

export type ConfirmPolicyHint = {
  tone: "ok" | "warn";
  text: string;
};

export type ConfirmSummary = {
  title: string;
  sentence: string;
  consequence: string;
  primaryField: ConfirmPrimaryField | null;
  policyHint: ConfirmPolicyHint | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shortId(value: unknown): string {
  const id = str(value);
  return id ? id.slice(0, 8) : "…";
}

export function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return "an unspecified amount";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency || "EUR", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency || ""}`.trim();
  }
}

function budgetHint(amount: number | null, currency: string | null, mission: BuyMissionView | null): ConfirmPolicyHint | null {
  if (amount === null || !mission) return null;
  const ceiling = formatMoney(mission.hard_budget_max, mission.currency || currency);
  if (amount > mission.hard_budget_max) {
    return {
      tone: "warn",
      text: `Exceeds your ${ceiling} hard budget. The server will refuse it and create an owner approval instead of sending it.`
    };
  }
  if (mission.preferred_price_max !== null && amount > mission.preferred_price_max) {
    return {
      tone: "ok",
      text: `Above your preferred ${formatMoney(mission.preferred_price_max, mission.currency || currency)} but within your ${ceiling} hard budget.`
    };
  }
  return { tone: "ok", text: `Within your ${ceiling} hard budget.` };
}

/**
 * Turns a raw confirmation request into the sentence the human actually needs to read.
 * The JSON stays available behind an "Advanced" toggle; the sentence and the primary field carry the decision.
 */
export function summarizeConfirmRequest(request: ConfirmRequest, mission: BuyMissionView | null): ConfirmSummary {
  const args = isRecord(request.args) ? request.args : {};
  const currency = str(args.currency) ?? mission?.currency ?? null;

  switch (request.toolName) {
    case "create_buy_mission": {
      const hard = num(args.hard_budget_max);
      const preferred = num(args.preferred_price_max);
      const radius = num(args.radius_km);
      const where = str(args.location_label);
      return {
        title: "Create a Deal Mission",
        sentence: `Delegate the search for “${str(args.query) || "an item"}”${where ? ` around ${where}` : ""}${
          radius !== null ? ` (${radius} km)` : ""
        } with a hard budget of ${formatMoney(hard, currency)}${
          preferred !== null ? ` and a preferred price of ${formatMoney(preferred, currency)}` : ""
        }.`,
        consequence: "The server will enforce these limits on every offer. Contact details stay hidden until both owners consent.",
        primaryField: { key: "hard_budget_max", label: "Hard budget", kind: "amount", value: hard, currency },
        policyHint: null
      };
    }
    case "start_thread": {
      const question = str(args.initial_question);
      return {
        title: "Open a negotiation thread",
        sentence: `Start a ${str(args.intent) === "ASK" ? "question" : "purchase"} thread with the seller of listing ${shortId(args.listing_id)}${
          question ? ` and ask: “${question}”` : ""
        }.`,
        consequence: "No offer is made and no contact detail is shared. Seller replies are treated as untrusted content.",
        primaryField: question ? { key: "initial_question", label: "First question", kind: "text", value: question, currency: null } : null,
        policyHint: null
      };
    }
    case "send_message": {
      const text = str(args.text);
      return {
        title: "Send a message to the seller",
        sentence: `Send a ${str(args.type) || "message"} in thread ${shortId(args.thread_id)}${text ? `: “${text}”` : ""}.`,
        consequence: "The server redacts contact details before delivery. This does not commit you to any price.",
        primaryField: { key: "text", label: "Message", kind: "text", value: text, currency: null },
        policyHint: null
      };
    }
    case "make_offer": {
      const amount = num(args.amount);
      return {
        title: "Send an offer",
        sentence: `Send a binding offer of ${formatMoney(amount, currency)} on listing ${shortId(args.listing_id)}.`,
        consequence: "If the seller accepts, the listing is reserved for you atomically. No contact detail is shared yet.",
        primaryField: { key: "amount", label: "Offer amount", kind: "amount", value: amount, currency },
        policyHint: budgetHint(amount, currency, mission)
      };
    }
    case "respond_to_offer": {
      const action = str(args.action) || "respond to";
      const amount = num(args.amount);
      if (action === "counter") {
        return {
          title: "Counter the offer",
          sentence: `Counter offer ${shortId(args.offer_id)} at ${formatMoney(amount, currency)}.`,
          consequence: "The other side receives a new binding offer. Nothing is reserved until someone accepts.",
          primaryField: { key: "amount", label: "Counter amount", kind: "amount", value: amount, currency },
          policyHint: budgetHint(amount, currency, mission)
        };
      }
      if (action === "accept") {
        return {
          title: "Accept the offer",
          sentence: `Accept offer ${shortId(args.offer_id)} and reserve the listing.`,
          consequence: "Acceptance is atomic: other open offers are closed and the listing becomes RESERVED. Contact details still require both owners' consent.",
          primaryField: null,
          policyHint: mission
            ? { tone: "ok", text: `The server re-checks the accepted amount against your ${formatMoney(mission.hard_budget_max, mission.currency)} hard budget.` }
            : null
        };
      }
      return {
        title: "Decline the offer",
        sentence: `Decline offer ${shortId(args.offer_id)}.`,
        consequence: "The offer is closed. The agent may prepare a new one within your limits.",
        primaryField: null,
        policyHint: null
      };
    }
    case "request_contact_reveal":
      return {
        title: "Request contact exchange",
        sentence: `Ask to exchange contact details for transaction ${shortId(args.tx_id)}.`,
        consequence: "This records your consent only. Nothing is revealed until the other owner consents too.",
        primaryField: null,
        policyHint: null
      };
    case "resolve_approval": {
      const decision = str(args.decision) || "resolve";
      const amount = num(args.amount);
      return {
        title: decision === "approve" ? "Approve the pending action" : decision === "deny" ? "Reject the pending action" : "Revoke the approval",
        sentence:
          decision === "approve" && amount !== null
            ? `Approve the agent's action with an edited amount of ${formatMoney(amount, currency)}.`
            : `${decision.charAt(0).toUpperCase()}${decision.slice(1)} the approval shown on this page.`,
        consequence: "Only you, on this owner page, can take this decision. The agent cannot call it with its own key.",
        primaryField: decision === "approve" ? { key: "amount", label: "Approved amount", kind: "amount", value: amount, currency } : null,
        policyHint: null
      };
    }
    default:
      return {
        title: "Confirm tool execution",
        sentence: request.toolDescription || `Run ${request.toolName}.`,
        consequence: request.outputHint,
        primaryField: null,
        policyHint: null
      };
  }
}

/** Applies an edited primary field back onto the argument object without touching other keys. */
export function applyPrimaryField(args: unknown, field: ConfirmPrimaryField, rawValue: string): { args: unknown; error: string | null } {
  if (!isRecord(args)) return { args, error: null };
  if (field.kind === "amount") {
    const trimmed = rawValue.trim();
    if (trimmed === "") return { args, error: "Enter an amount." };
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) return { args, error: "Amounts must be whole, non-negative numbers." };
    return { args: { ...args, [field.key]: parsed }, error: null };
  }
  if (!rawValue.trim()) return { args, error: "This field cannot be empty." };
  return { args: { ...args, [field.key]: rawValue }, error: null };
}
