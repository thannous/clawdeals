import { z } from "zod";

import { sanitizeActionReceipt } from "../activity/action-receipts";
import { getWebMcpActionReceipt } from "../ui-bridge";
import type { ToolDef } from "./defs";

const getActionReceiptSchema = z
  .object({
    receipt_id: z.string().trim().min(1).max(180).optional(),
    request_id: z.string().trim().min(1).max(180).optional()
  })
  .strict()
  .superRefine((args, ctx) => {
    if (Boolean(args.receipt_id) === Boolean(args.request_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of receipt_id or request_id"
      });
    }
  });

export const activityTools: ToolDef[] = [
  {
    name: "get_action_receipt",
    description:
      "Read one local, redacted action receipt by receipt ID or request ID. Returns no API keys, cookies, tokens, contact details, or raw personal data.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        receipt_id: { type: "string", minLength: 1, maxLength: 180 },
        request_id: { type: "string", minLength: 1, maxLength: 180 }
      },
      oneOf: [{ required: ["receipt_id"] }, { required: ["request_id"] }]
    },
    zodSchema: getActionReceiptSchema,
    outputHint: "Versioned, redacted action receipt with policy, confirmation, approvals, result, and timestamp.",
    execute: async (args: any, ctx) => {
      const receipt = getWebMcpActionReceipt({
        receiptId: args.receipt_id,
        requestId: args.request_id
      });
      if (!receipt) {
        return {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "Action receipt not found in this browser",
            details: {}
          },
          meta: { request_id: ctx.requestId }
        };
      }
      return {
        ok: true,
        data: sanitizeActionReceipt(receipt),
        meta: { request_id: ctx.requestId }
      };
    }
  }
];
