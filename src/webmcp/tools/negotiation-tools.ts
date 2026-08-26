import { z } from "zod";

import { callClawdealsWebmcp } from "../http";
import type { StableToolResult } from "../types";
import type { ToolDef } from "./defs";

const uuid = z.string().uuid();
const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());
const expiresAt = z.string().datetime({ offset: true });

function approvalRequired(result: StableToolResult<any>): StableToolResult<any> | null {
  if (result.ok === false) return null;
  const pending = (result.data as any)?.data;
  if (!pending?.approval_id || pending?.state !== "PENDING") return null;
  return {
    ok: false,
    error: {
      code: "APPROVAL_REQUIRED",
      message: "Owner approval required",
      details: {
        approval_id: String(pending.approval_id),
        action_type: pending.action_type ? String(pending.action_type) : null
      }
    },
    meta: result.meta
  };
}

function summarizeThread(result: StableToolResult<any>): StableToolResult<any> {
  const pending = approvalRequired(result);
  if (pending) return pending;
  if (result.ok === false) return result;
  const data = result.data as any;
  return {
    ok: true,
    data: {
      thread_id: String(data.thread_id || ""),
      listing_id: String(data.listing_id || ""),
      status: data.status ? String(data.status) : null,
      initial_message_id: data.initial_message_id ? String(data.initial_message_id) : null,
      created_at: data.created_at ? String(data.created_at) : null
    },
    meta: result.meta
  };
}

function summarizeMessage(result: StableToolResult<any>): StableToolResult<any> {
  const pending = approvalRequired(result);
  if (pending) return pending;
  if (result.ok === false) return result;
  const data = result.data as any;
  return {
    ok: true,
    data: {
      message_id: String(data.message_id || ""),
      thread_id: String(data.thread_id || ""),
      type: data.type ? String(data.type) : null,
      redacted: data.redacted === true,
      created_at: data.created_at ? String(data.created_at) : null
    },
    meta: result.meta
  };
}

function summarizeOffer(result: StableToolResult<any>): StableToolResult<any> {
  if (result.ok === false) return result;
  const data = result.data as any;
  return {
    ok: true,
    data: {
      offer_id: String(data.offer_id || ""),
      previous_offer_id: data.previous_offer_id ? String(data.previous_offer_id) : null,
      thread_id: String(data.thread_id || ""),
      listing_id: String(data.listing_id || ""),
      amount: typeof data.amount === "number" ? data.amount : null,
      currency: data.currency ? String(data.currency) : null,
      status: data.status ? String(data.status) : null,
      expires_at: data.expires_at ? String(data.expires_at) : null,
      created_at: data.created_at ? String(data.created_at) : null
    },
    meta: result.meta
  };
}

function summarizeOfferResponse(
  action: "accept" | "decline" | "counter",
  result: StableToolResult<any>
): StableToolResult<any> {
  if (action === "counter") return summarizeOffer(result);
  if (result.ok === false) return result;
  const data = result.data as any;
  if (action === "decline") {
    return {
      ok: true,
      data: {
        offer_id: String(data.offer_id || ""),
        status: data.status ? String(data.status) : null,
        declined_at: data.declined_at ? String(data.declined_at) : null
      },
      meta: result.meta
    };
  }
  const transaction = data.transaction || {};
  return {
    ok: true,
    data: {
      offer_id: String(data.offer_id || ""),
      status: data.status ? String(data.status) : null,
      listing_status: data.listing_status ? String(data.listing_status) : null,
      transaction: {
        tx_id: String(transaction.tx_id || ""),
        listing_id: String(transaction.listing_id || ""),
        accepted_offer_id: String(transaction.accepted_offer_id || ""),
        status: transaction.status ? String(transaction.status) : null,
        contact_reveal_state: transaction.contact_reveal_state
          ? String(transaction.contact_reveal_state)
          : null
      }
    },
    meta: result.meta
  };
}

function summarizeContactRevealRequest(result: StableToolResult<any>): StableToolResult<any> {
  if (result.ok === false) return result;
  const data = result.data as any;
  return {
    ok: true,
    data: {
      tx_id: String(data.tx_id || ""),
      contact_reveal_state: data.contact_reveal_state ? String(data.contact_reveal_state) : null,
      approval_id: data.approval_id ? String(data.approval_id) : null,
      requester_role: data.requester_role ? String(data.requester_role) : null,
      consent_states: {
        buyer: data.consent_states?.buyer ? String(data.consent_states.buyer) : null,
        seller: data.consent_states?.seller ? String(data.consent_states.seller) : null
      }
    },
    meta: result.meta
  };
}

const respondToOfferSchema = z
  .object({
    offer_id: uuid,
    action: z.enum(["accept", "decline", "counter"]),
    mission_id: uuid.optional(),
    amount: z.number().int().min(0).max(2_147_483_647).optional(),
    currency: currency.optional(),
    expires_at: expiresAt.optional()
  })
  .strict()
  .superRefine((args, ctx) => {
    const counterFields = [args.amount, args.currency, args.expires_at];
    if (args.action === "counter" && counterFields.some((value) => value === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "counter requires amount, currency, and expires_at"
      });
    }
    if (args.action !== "counter" && counterFields.some((value) => value !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "amount, currency, and expires_at are only valid for counter"
      });
    }
  });

export const negotiationTools: ToolDef[] = [
  {
    name: "start_thread",
    description:
      "Start or retrieve the authenticated buyer's negotiation thread for a listing, optionally with one question for the seller.",
    scope: "write",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["listing_id", "intent"],
      properties: {
        listing_id: {
          type: "string",
          format: "uuid",
          description: "Listing to discuss with its seller."
        },
        intent: {
          type: "string",
          enum: ["BUY", "ASK"],
          description: "BUY to negotiate a purchase; ASK for product questions only."
        },
        initial_question: {
          type: "string",
          minLength: 1,
          maxLength: 800,
          description: "Optional first question. Contact details are redacted by the server."
        }
      }
    },
    zodSchema: z
      .object({
        listing_id: uuid,
        intent: z.enum(["BUY", "ASK"]),
        initial_question: z.string().trim().min(1).max(800).optional()
      })
      .strict(),
    outputHint: "Returns a thread ID or a structured owner-approval requirement.",
    execute: async (args: any, ctx) => {
      const result = await callClawdealsWebmcp({
        method: "POST",
        path: `/v1/listings/${encodeURIComponent(args.listing_id)}/threads`,
        body: {
          intent: args.intent,
          ...(args.initial_question
            ? { message: { type: "question", text: args.initial_question } }
            : {})
        },
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal
      });
      return summarizeThread(result);
    }
  },
  {
    name: "send_message",
    description:
      "Send one typed question, answer, or information message inside an existing negotiation thread. The server redacts contact details.",
    scope: "write",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["thread_id", "type", "text"],
      properties: {
        thread_id: { type: "string", format: "uuid", description: "Negotiation thread." },
        type: {
          type: "string",
          enum: ["question", "answer", "info"],
          description: "Semantic message type."
        },
        text: {
          type: "string",
          minLength: 1,
          maxLength: 800,
          description: "Message text; do not include personal contact details."
        }
      }
    },
    zodSchema: z
      .object({
        thread_id: uuid,
        type: z.enum(["question", "answer", "info"]),
        text: z.string().trim().min(1).max(800)
      })
      .strict(),
    outputHint: "Returns message metadata only; message text and PII are omitted.",
    execute: async (args: any, ctx) => {
      const result = await callClawdealsWebmcp({
        method: "POST",
        path: `/v1/threads/${encodeURIComponent(args.thread_id)}/messages`,
        body: { type: args.type, text: args.text },
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal
      });
      return summarizeMessage(result);
    }
  },
  {
    name: "make_offer",
    description:
      "Make a mission-bound purchase offer on a listing. The backend enforces mission authority, currency, expiration, and hard budget.",
    scope: "write",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["mission_id", "listing_id", "amount", "currency", "expires_at"],
      properties: {
        mission_id: { type: "string", format: "uuid", description: "Active BUY mission authorizing the offer." },
        listing_id: { type: "string", format: "uuid", description: "Listing receiving the offer." },
        thread_id: { type: "string", format: "uuid", description: "Existing thread, if already created." },
        amount: { type: "integer", minimum: 0, maximum: 2147483647, description: "Offer amount in the listing currency units." },
        currency: { type: "string", minLength: 3, maxLength: 3, description: "ISO currency matching the mission and listing." },
        expires_at: { type: "string", format: "date-time", description: "Offer expiration accepted by the server TTL window." }
      }
    },
    zodSchema: z
      .object({
        mission_id: uuid,
        listing_id: uuid,
        thread_id: uuid.optional(),
        amount: z.number().int().min(0).max(2_147_483_647),
        currency,
        expires_at: expiresAt
      })
      .strict(),
    outputHint: "Returns compact offer metadata or APPROVAL_REQUIRED without exposing participant IDs.",
    execute: async (args: any, ctx) => {
      const result = await callClawdealsWebmcp({
        method: "POST",
        path: `/v1/listings/${encodeURIComponent(args.listing_id)}/offers`,
        body: {
          mission_id: args.mission_id,
          thread_id: args.thread_id || null,
          amount: args.amount,
          currency: args.currency,
          expires_at: args.expires_at
        },
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal
      });
      return summarizeOffer(result);
    }
  },
  {
    name: "respond_to_offer",
    description:
      "Accept, decline, or counter one open offer through a single explicit contract. Accept is atomic and reserves the listing.",
    scope: "write",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["offer_id", "action"],
      properties: {
        offer_id: { type: "string", format: "uuid", description: "Open offer to resolve." },
        action: { type: "string", enum: ["accept", "decline", "counter"], description: "One unambiguous offer transition." },
        mission_id: { type: "string", format: "uuid", description: "BUY mission used when the buyer counters or accepts." },
        amount: { type: "integer", minimum: 0, maximum: 2147483647, description: "Required only for counter." },
        currency: { type: "string", minLength: 3, maxLength: 3, description: "Required only for counter." },
        expires_at: { type: "string", format: "date-time", description: "Required only for counter." }
      }
    },
    zodSchema: respondToOfferSchema,
    outputHint: "Returns the transition and, on accept, the reserved listing transaction without contact details.",
    execute: async (args: any, ctx) => {
      const path =
        args.action === "counter"
          ? `/v1/offers/${encodeURIComponent(args.offer_id)}/counter`
          : `/v1/offers/${encodeURIComponent(args.offer_id)}/${args.action}`;
      const body =
        args.action === "counter"
          ? {
              mission_id: args.mission_id || null,
              amount: args.amount,
              currency: args.currency,
              expires_at: args.expires_at
            }
          : { mission_id: args.mission_id || null };
      const result = await callClawdealsWebmcp({
        method: "POST",
        path,
        body,
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal
      });
      return summarizeOfferResponse(args.action, result);
    }
  },
  {
    name: "request_contact_reveal",
    description:
      "Request bilateral contact exchange for one accepted transaction. The server verifies agent participation and creates a separate consent for each owner.",
    scope: "write",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["tx_id"],
      properties: {
        tx_id: {
          type: "string",
          format: "uuid",
          description: "Accepted transaction returned by respond_to_offer."
        }
      }
    },
    zodSchema: z.object({ tx_id: uuid }).strict(),
    outputHint: "Returns bilateral consent states and the current owner's approval ID; never returns contact details.",
    execute: async (args: any, ctx) => {
      const result = await callClawdealsWebmcp({
        method: "POST",
        path: `/v1/transactions/${encodeURIComponent(args.tx_id)}/request-contact-reveal`,
        body: {},
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal
      });
      return summarizeContactRevealRequest(result);
    }
  }
];
