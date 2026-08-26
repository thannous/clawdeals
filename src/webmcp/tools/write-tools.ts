import { z } from "zod";

import { callClawdealsWebmcp } from "../http";
import type { ToolDef } from "./defs";

const uuid = z.string().uuid();
const mediaImageSchema = z
  .object({
    storage_key: z.string().min(1),
    mime: z.string().min(1),
    w: z.number().int().min(1).optional(),
    h: z.number().int().min(1).optional()
  })
  .strict();

export const writeTools: ToolDef[] = [
  {
    name: "clawdeals.listings_create_draft",
    description: "Create a DRAFT listing. Never publishes live. The human must approve the payload in the confirmation dialog first.",
    scope: "write",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
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
        },
        images: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["storage_key", "mime"],
            properties: {
              storage_key: { type: "string", minLength: 1 },
              mime: { type: "string", minLength: 1 },
              w: { type: "integer", minimum: 1 },
              h: { type: "integer", minimum: 1 }
            }
          }
        },
        photos: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["storage_key", "mime"],
            properties: {
              storage_key: { type: "string", minLength: 1 },
              mime: { type: "string", minLength: 1 },
              w: { type: "integer", minimum: 1 },
              h: { type: "integer", minimum: 1 }
            }
          }
        },
        cover_image_index: { type: "integer", minimum: 0, maximum: 7, nullable: true }
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
          .optional(),
        images: z.array(mediaImageSchema).max(8).optional(),
        photos: z.array(mediaImageSchema).max(8).optional(),
        cover_image_index: z.number().int().min(0).max(7).nullable().optional()
      })
      .strict(),
    outputHint: 'Creates a DRAFT listing only. Output: { listing_id, status:"DRAFT", created_at }.',
    execute: async (args: any, ctx) => {
      if (args.images && args.photos && JSON.stringify(args.images) !== JSON.stringify(args.photos)) {
        throw new Error("images and photos must match when both are provided");
      }

      const currency = (args.currency ? String(args.currency) : "EUR").trim().toUpperCase();
      const body: any = {
        title: args.title,
        description: args.description ?? null,
        category: args.category,
        condition: args.condition,
        price: { amount: args.price_amount_minor, currency },
        geo: args.geo ?? null,
        publish: false
      };
      if (args.images !== undefined) body.images = args.images;
      if (args.photos !== undefined) body.photos = args.photos;
      if (args.cover_image_index !== undefined) body.cover_image_index = args.cover_image_index;

      return callClawdealsWebmcp({
        method: "POST",
        path: "/v1/listings",
        body,
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal
      });
    }
  },
  {
    name: "clawdeals.approvals_resolve",
    description: "Approve or deny a pending owner approval. Requires an explicit human confirmation in the page UI.",
    scope: "admin",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
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
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal
      });
    }
  }
];
