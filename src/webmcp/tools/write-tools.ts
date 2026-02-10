import { z } from "zod";

import { callClawdealsWebmcp } from "../http";
import type { ToolDef } from "./defs";

const uuid = z.string().uuid();

export const writeTools: ToolDef[] = [
  {
    name: "clawdeals.listings_create_draft",
    description: "REST: POST /v1/listings (publish=false) to create a DRAFT listing.",
    scope: "write",
    requiresConfirmation: true,
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "category", "condition", "price_amount_minor"],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120 },
        description: { type: "string", maxLength: 4000 },
        category: { type: "string" },
        condition: { type: "string", enum: ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"] },
        price_amount_minor: { type: "integer", minimum: 0 },
        currency: { type: "string", minLength: 3, maxLength: 3, default: "EUR" },
        geo: {
          type: "object",
          additionalProperties: false,
          required: ["lat", "lng"],
          properties: {
            lat: { type: "number", minimum: -90, maximum: 90 },
            lng: { type: "number", minimum: -180, maximum: 180 }
          }
        }
      }
    },
    zodSchema: z
      .object({
        title: z.string().min(1).max(120),
        description: z.string().max(4000).optional(),
        category: z.string().min(1),
        condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]),
        price_amount_minor: z.number().int().min(0),
        currency: z.string().min(3).max(3).optional(),
        geo: z
          .object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180)
          })
          .strict()
          .optional()
      })
      .strict(),
    outputHint: 'Creates a DRAFT listing only. Output: { listing_id, status:"DRAFT", created_at }.',
    execute: async (args: any, ctx) => {
      const currency = (args.currency ? String(args.currency) : "EUR").trim().toUpperCase();
      return callClawdealsWebmcp({
        method: "POST",
        path: "/v1/listings",
        body: {
          title: args.title,
          description: args.description ?? null,
          category: args.category,
          condition: args.condition,
          price: { amount: args.price_amount_minor, currency },
          geo: args.geo ?? null,
          publish: false
        },
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey
      });
    }
  },
  {
    name: "clawdeals.approvals_resolve",
    description: "REST: POST /v1/approvals/{approval_id}:(approve|deny).",
    scope: "admin",
    requiresConfirmation: true,
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["approval_id", "decision"],
      properties: {
        approval_id: { type: "string", format: "uuid" },
        decision: { type: "string", enum: ["APPROVE", "DENY"] },
        note: { type: "string", maxLength: 400 }
      }
    },
    zodSchema: z
      .object({
        approval_id: uuid,
        decision: z.enum(["APPROVE", "DENY"]),
        note: z.string().max(400).optional()
      })
      .strict(),
    outputHint: "Resolves an approval. Output includes final state and resolved_at.",
    execute: async (args: any, ctx) => {
      const action = args.decision === "APPROVE" ? "approve" : "deny";
      return callClawdealsWebmcp({
        method: "POST",
        path: `/v1/approvals/${encodeURIComponent(args.approval_id)}:${action}`,
        body: args.note ? { note: String(args.note) } : {},
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey
      });
    }
  }
];

