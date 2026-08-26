import { z } from "zod";

import { callOwnerSessionWebmcp } from "../http";
import type { StableToolResult } from "../types";
import type { ToolDef } from "./defs";

const APPROVAL_PATH_RE = /\/my\/approvals\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\/|$)/i;

export function approvalIdFromPath(pathname: string): string | null {
  const match = APPROVAL_PATH_RE.exec(String(pathname || ""));
  return match?.[1] || null;
}

function currentApprovalId(): string | null {
  if (typeof window === "undefined") return null;
  return approvalIdFromPath(window.location.pathname);
}

const resolveApprovalSchema = z
  .object({
    decision: z.enum(["approve", "deny", "revoke"]),
    amount: z.number().int().min(0).max(2_147_483_647).optional(),
    note: z.string().trim().max(400).optional()
  })
  .strict()
  .superRefine((args, ctx) => {
    if (args.decision !== "approve" && args.amount !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "amount is only valid when approving"
      });
    }
  });

function summarize(result: StableToolResult<any>): StableToolResult<any> {
  if (result.ok === false) return result;
  const approval = (result.data as any)?.data || {};
  return {
    ok: true,
    data: {
      approval_id: String(approval.approval_id || ""),
      action_type: approval.action_type ? String(approval.action_type) : null,
      state: approval.state ? String(approval.state) : null,
      resolved_at: approval.resolved_at ? String(approval.resolved_at) : null
    },
    meta: result.meta
  };
}

export const approvalTools: ToolDef[] = [
  {
    name: "resolve_approval",
    description:
      "Approve, edit, deny, or revoke only the approval shown on this owner-session page. Never uses an agent API key.",
    scope: "admin",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["decision"],
      properties: {
        decision: {
          type: "string",
          enum: ["approve", "deny", "revoke"],
          description: "Owner decision for the approval currently shown."
        },
        amount: {
          type: "integer",
          minimum: 0,
          maximum: 2147483647,
          description: "Optional edited counteroffer amount when approving."
        },
        note: {
          type: "string",
          maxLength: 400,
          description: "Optional owner reason stored in the audit trail."
        }
      }
    },
    zodSchema: resolveApprovalSchema,
    outputHint: "Returns only the approval ID, action type, final state, and resolution time.",
    execute: async (args: any, ctx) => {
      const approvalId = currentApprovalId();
      if (!approvalId) {
        return {
          ok: false,
          error: {
            code: "CONTEXT_MISMATCH",
            message: "Open a specific owner approval page before resolving it",
            details: {}
          },
          meta: { request_id: ctx.requestId }
        };
      }
      const result = await callOwnerSessionWebmcp({
        method: "POST",
        path: `/v1/approvals/${encodeURIComponent(approvalId)}:${args.decision}`,
        body: {
          ...(args.amount !== undefined ? { amount: args.amount } : {}),
          ...(args.note ? { note: args.note } : {})
        },
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal
      });
      return summarize(result);
    }
  }
];
