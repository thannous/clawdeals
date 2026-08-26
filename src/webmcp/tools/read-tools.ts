import { z } from "zod";

import { callClawdealsWebmcp, callPublicWebmcp } from "../http";
import { applyDealsSearchUi, applyListingsSearchUi, applyOpenDealUi, applyOpenListingUi } from "../ui-bridge";
import type { ToolDef } from "./defs";
import type { StableToolResult } from "../types";

const uuid = z.string().uuid();

function stableError<T>(requestId: string, code: string, message: string): StableToolResult<T> {
  return { ok: false, error: { code, message, details: {} }, meta: { request_id: requestId } };
}

function joinCsv(values: unknown): string | null {
  if (!Array.isArray(values)) return null;
  const normalized = values.map((v) => String(v).trim()).filter(Boolean);
  return normalized.length ? normalized.join(",") : null;
}

export const readTools: ToolDef[] = [
  {
    name: "clawdeals.deals_search",
    description: "Search deals and update the deals grid the human is viewing. REST: GET /v1/deals or public feed.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        sort: { type: "string", enum: ["new", "temp", "trend"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" },
        q: { type: "string", minLength: 1, maxLength: 80 },
        tags: { type: "array", items: { type: "string" }, maxItems: 20 },
        min_temperature: { type: "integer", minimum: 0, maximum: 100 },
        status: { type: "array", items: { type: "string", enum: ["NEW", "ACTIVE", "EXPIRED"] }, maxItems: 3 },
        price_max: { type: "number", minimum: 0 }
      }
    },
    zodSchema: z
      .object({
        sort: z.enum(["new", "temp", "trend"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
        q: z.string().min(1).max(80).optional(),
        tags: z.array(z.string()).max(20).optional(),
        min_temperature: z.number().int().min(0).max(100).optional(),
        status: z.array(z.enum(["NEW", "ACTIVE", "EXPIRED"])).max(3).optional(),
        price_max: z.number().min(0).optional()
      })
      .strict(),
    outputHint: "Deals list (items + next_cursor) with minimal, UI-visible fields.",
    execute: async (args: any, ctx) => {
      const query: any = {};
      if (args.sort) query.sort = args.sort;
      if (args.limit != null) query.limit = args.limit;
      if (args.cursor) query.cursor = args.cursor;
      if (args.q) query.q = args.q;
      if (args.min_temperature != null) query.min_temperature = args.min_temperature;
      if (args.price_max != null) query.price_max = args.price_max;
      const tags = joinCsv(args.tags);
      if (tags) query.tags = tags;
      const status = joinCsv(args.status);
      if (status) query.status = status;

      const publicQuery: any = {
        sort: args.sort || "new",
        limit: args.limit ?? 12
      };
      if (args.q) publicQuery.q = args.q;
      if (args.status?.length === 1) publicQuery.status = args.status[0];

      const publicResult = await callPublicWebmcp({
        method: "GET",
        path: "/v1/public/deals",
        query: publicQuery,
        requestId: ctx.requestId,
        signal: ctx.signal
      });
      if (publicResult.ok) {
        applyDealsSearchUi({ q: args.q, sort: args.sort, status: args.status?.[0] });
        return publicResult;
      }

      const authed = await callClawdealsWebmcp({
        method: "GET",
        path: "/v1/deals",
        query,
        requestId: ctx.requestId,
        signal: ctx.signal
      });
      if (authed.ok) applyDealsSearchUi({ q: args.q, sort: args.sort, status: args.status?.[0] });
      return authed;
    }
  },
  {
    name: "clawdeals.deals_get",
    description: "Fetch one deal and open it in the shared UI. REST: GET /v1/deals/{deal_id}.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["deal_id"],
      properties: {
        deal_id: { type: "string", format: "uuid" }
      }
    },
    zodSchema: z.object({ deal_id: uuid }).strict(),
    outputHint: "Deal detail (minimal fields).",
    execute: async (args: any, ctx) => {
      applyOpenDealUi(args.deal_id);
      return callClawdealsWebmcp({
        method: "GET",
        path: `/v1/deals/${encodeURIComponent(args.deal_id)}`,
        requestId: ctx.requestId,
        signal: ctx.signal
      });
    }
  },
  {
    name: "clawdeals.listings_search",
    description: "Search live listings and update the marketplace grid the human is viewing.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string" },
        condition: { type: "string", enum: ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"] },
        price_min: { type: "integer", minimum: 0 },
        price_max: { type: "integer", minimum: 0 },
        sort: { type: "string", enum: ["recent", "price_asc", "price_desc", "distance"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" },
        q: { type: "string", maxLength: 80 },
        lat: { type: "number", minimum: -90, maximum: 90 },
        lng: { type: "number", minimum: -180, maximum: 180 },
        distance_km: { type: "number", minimum: 0 }
      }
    },
    zodSchema: z
      .object({
        category: z.string().optional(),
        condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]).optional(),
        price_min: z.number().int().min(0).optional(),
        price_max: z.number().int().min(0).optional(),
        sort: z.enum(["recent", "price_asc", "price_desc", "distance"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
        q: z.string().max(80).optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        distance_km: z.number().min(0).optional()
      })
      .strict(),
    outputHint: "Listings list (minimal summary rows + next_cursor).",
    execute: async (args: any, ctx) => {
      const publicResult = await callPublicWebmcp({
        method: "GET",
        path: "/v1/public/listings",
        query: {
          q: args.q,
          category: args.category,
          condition: args.condition,
          price_min: args.price_min,
          price_max: args.price_max,
          sort: args.sort && args.sort !== "distance" ? args.sort : "recent",
          limit: args.limit ?? 12,
          cursor: args.cursor
        },
        requestId: ctx.requestId,
        signal: ctx.signal
      });
      if (publicResult.ok) {
        applyListingsSearchUi({
          q: args.q,
          category: args.category,
          condition: args.condition,
          price_min: args.price_min,
          price_max: args.price_max,
          sort: args.sort
        });
        return publicResult;
      }
      const authed = await callClawdealsWebmcp({
        method: "GET",
        path: "/v1/listings",
        query: args,
        requestId: ctx.requestId,
        signal: ctx.signal
      });
      if (authed.ok) {
        applyListingsSearchUi({
          q: args.q,
          category: args.category,
          condition: args.condition,
          price_min: args.price_min,
          price_max: args.price_max,
          sort: args.sort
        });
      }
      return authed;
    }
  },
  {
    name: "clawdeals.listings_get",
    description: "Fetch one listing and open it in the shared UI.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["listing_id"],
      properties: {
        listing_id: { type: "string", format: "uuid" }
      }
    },
    zodSchema: z.object({ listing_id: uuid }).strict(),
    outputHint: "Listing detail (minimal fields).",
    execute: async (args: any, ctx) => {
      applyOpenListingUi(args.listing_id);
      return callClawdealsWebmcp({
        method: "GET",
        path: `/v1/listings/${encodeURIComponent(args.listing_id)}`,
        requestId: ctx.requestId,
        signal: ctx.signal
      });
    }
  },
  {
    name: "clawdeals.approvals_list",
    description: "List pending human approvals for the signed-in agent owner.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100 },
        cursor: { type: "string" }
      }
    },
    zodSchema: z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional()
      })
      .strict(),
    outputHint: "Pending approvals list (minimal fields + next_cursor).",
    execute: async (args: any, ctx) => {
      return callClawdealsWebmcp({
        method: "GET",
        path: "/v1/approvals",
        query: {
          state: "PENDING",
          ...(args.limit != null ? { limit: args.limit } : {}),
          ...(args.cursor ? { cursor: args.cursor } : {})
        },
        requestId: ctx.requestId,
        signal: ctx.signal
      });
    }
  },
  {
    name: "clawdeals.approvals_get",
    description: "Fetch one pending approval so the human can review it.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["approval_id"],
      properties: {
        approval_id: { type: "string", format: "uuid" }
      }
    },
    zodSchema: z.object({ approval_id: uuid }).strict(),
    outputHint: "Approval detail (minimal fields).",
    execute: async (args: any, ctx) => {
      if (!args.approval_id) {
        return stableError(ctx.requestId, "VALIDATION_ERROR", "approval_id is required");
      }
      return callClawdealsWebmcp({
        method: "GET",
        path: `/v1/approvals/${encodeURIComponent(args.approval_id)}`,
        requestId: ctx.requestId,
        signal: ctx.signal
      });
    }
  }
];

