import type { BuyMissionView } from "../ui-bridge";
import type { ConfirmRequest } from "./types";

export type ConfirmMessage = {
  key: string;
  values?: Record<string, string | number>;
};

export type ConfirmPrimaryField = {
  key: string;
  labelKey: string;
  kind: "amount" | "text";
  value: number | string | null;
  currency: string | null;
};

export type ConfirmPolicyHint = {
  tone: "ok" | "warn";
  message: ConfirmMessage;
};

export type ConfirmSummary = {
  title: ConfirmMessage;
  sentence: ConfirmMessage;
  consequence: ConfirmMessage;
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

export function formatMoney(amount: number | null, currency: string | null, locale = "en"): string {
  if (amount === null) return "—";
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

function budgetHint(
  amount: number | null,
  currency: string | null,
  mission: BuyMissionView | null
): ConfirmPolicyHint | null {
  if (amount === null || !mission) return null;
  const values = {
    preferred: mission.preferred_price_max ?? 0,
    ceiling: mission.hard_budget_max,
    currency: mission.currency || currency || "EUR"
  };
  if (amount > mission.hard_budget_max) {
    return { tone: "warn", message: { key: "confirm.policy.exceeds", values } };
  }
  if (mission.preferred_price_max !== null && amount > mission.preferred_price_max) {
    return {
      tone: "ok",
      message: { key: "confirm.policy.abovePreferred", values }
    };
  }
  return { tone: "ok", message: { key: "confirm.policy.within", values } };
}

const message = (key: string, values?: Record<string, string | number>): ConfirmMessage => ({ key, values });

/** Returns translation keys and interpolation values; rendering stays in the locale-aware component. */
export function summarizeConfirmRequest(request: ConfirmRequest, mission: BuyMissionView | null): ConfirmSummary {
  const args = isRecord(request.args) ? request.args : {};
  const currency = str(args.currency) ?? mission?.currency ?? "EUR";

  switch (request.toolName) {
    case "create_buy_mission": {
      const hard = num(args.hard_budget_max);
      const preferred = num(args.preferred_price_max);
      const radius = num(args.radius_km);
      const where = str(args.location_label);
      return {
        title: message("confirm.createMission.title"),
        sentence: message("confirm.createMission.sentence", {
          query: str(args.query) || "—",
          where: where || "—",
          radius: radius ?? 0,
          hard: hard ?? 0,
          preferred: preferred ?? 0,
          currency
        }),
        consequence: message("confirm.createMission.consequence"),
        primaryField: {
          key: "hard_budget_max",
          labelKey: "confirm.fields.hardBudget",
          kind: "amount",
          value: hard,
          currency
        },
        policyHint: null
      };
    }
    case "start_thread": {
      const question = str(args.initial_question);
      const intentKey = str(args.intent) === "ASK" ? "question" : "purchase";
      return {
        title: message("confirm.startThread.title"),
        sentence: message(`confirm.startThread.${intentKey}${question ? "WithQuestion" : ""}`, {
          listingId: shortId(args.listing_id),
          question: question || ""
        }),
        consequence: message("confirm.startThread.consequence"),
        primaryField: question
          ? {
              key: "initial_question",
              labelKey: "confirm.fields.firstQuestion",
              kind: "text",
              value: question,
              currency: null
            }
          : null,
        policyHint: null
      };
    }
    case "send_message": {
      const text = str(args.text);
      return {
        title: message("confirm.sendMessage.title"),
        sentence: message(text ? "confirm.sendMessage.sentenceWithText" : "confirm.sendMessage.sentence", {
          threadId: shortId(args.thread_id),
          text: text || ""
        }),
        consequence: message("confirm.sendMessage.consequence"),
        primaryField: {
          key: "text",
          labelKey: "confirm.fields.message",
          kind: "text",
          value: text,
          currency: null
        },
        policyHint: null
      };
    }
    case "make_offer": {
      const amount = num(args.amount);
      return {
        title: message("confirm.makeOffer.title"),
        sentence: message("confirm.makeOffer.sentence", {
          amount: amount ?? 0,
          currency,
          listingId: shortId(args.listing_id)
        }),
        consequence: message("confirm.makeOffer.consequence"),
        primaryField: {
          key: "amount",
          labelKey: "confirm.fields.offerAmount",
          kind: "amount",
          value: amount,
          currency
        },
        policyHint: budgetHint(amount, currency, mission)
      };
    }
    case "respond_to_offer": {
      const action = str(args.action) || "decline";
      const amount = num(args.amount);
      if (action === "counter") {
        return {
          title: message("confirm.counter.title"),
          sentence: message("confirm.counter.sentence", {
            offerId: shortId(args.offer_id),
            amount: amount ?? 0,
            currency
          }),
          consequence: message("confirm.counter.consequence"),
          primaryField: {
            key: "amount",
            labelKey: "confirm.fields.counterAmount",
            kind: "amount",
            value: amount,
            currency
          },
          policyHint: budgetHint(amount, currency, mission)
        };
      }
      if (action === "accept") {
        return {
          title: message("confirm.accept.title"),
          sentence: message("confirm.accept.sentence", {
            offerId: shortId(args.offer_id)
          }),
          consequence: message("confirm.accept.consequence"),
          primaryField: null,
          policyHint: mission
            ? {
                tone: "ok",
                message: message("confirm.policy.recheck", {
                  ceiling: mission.hard_budget_max,
                  currency: mission.currency
                })
              }
            : null
        };
      }
      return {
        title: message("confirm.decline.title"),
        sentence: message("confirm.decline.sentence", {
          offerId: shortId(args.offer_id)
        }),
        consequence: message("confirm.decline.consequence"),
        primaryField: null,
        policyHint: null
      };
    }
    case "request_contact_reveal":
      return {
        title: message("confirm.contact.title"),
        sentence: message("confirm.contact.sentence", {
          txId: shortId(args.tx_id)
        }),
        consequence: message("confirm.contact.consequence"),
        primaryField: null,
        policyHint: null
      };
    case "resolve_approval": {
      const decision = str(args.decision) || "revoke";
      const decisionKey = decision === "approve" ? "approve" : decision === "deny" ? "deny" : "revoke";
      const amount = num(args.amount);
      return {
        title: message(`confirm.resolve.${decisionKey}Title`),
        sentence: message(
          decisionKey === "approve" && amount !== null
            ? "confirm.resolve.approveEdited"
            : `confirm.resolve.${decisionKey}Sentence`,
          {
            amount: amount ?? 0,
            currency
          }
        ),
        consequence: message("confirm.resolve.consequence"),
        primaryField:
          decision === "approve"
            ? {
                key: "amount",
                labelKey: "confirm.fields.approvedAmount",
                kind: "amount",
                value: amount,
                currency
              }
            : null,
        policyHint: null
      };
    }
    default:
      return {
        title: message("confirm.fallback.title"),
        sentence: message("confirm.fallback.sentence"),
        consequence: message("confirm.fallback.consequence"),
        primaryField: null,
        policyHint: null
      };
  }
}

/** Applies an edited primary field back onto the argument object without touching other keys. */
export function applyPrimaryField(
  args: unknown,
  field: ConfirmPrimaryField,
  rawValue: string
): { args: unknown; error: string | null } {
  if (!isRecord(args)) return { args, error: null };
  if (field.kind === "amount") {
    const trimmed = rawValue.trim();
    if (trimmed === "") return { args, error: "confirm.errors.enterAmount" };
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) return { args, error: "confirm.errors.wholeAmount" };
    return { args: { ...args, [field.key]: parsed }, error: null };
  }
  if (!rawValue.trim()) return { args, error: "confirm.errors.emptyField" };
  return { args: { ...args, [field.key]: rawValue }, error: null };
}
