import { z } from "zod";

import {
  applyDealsSearchUi,
  applyListingsSearchUi,
  applyOpenDealUi,
  applyOpenListingUi,
  getPageContext
} from "../ui-bridge";
import { callPublicWebmcp } from "../http";
import type { ToolDef } from "./defs";
import type { StableToolResult } from "../types";

const uuid = z.string().uuid();

function ok<T>(requestId: string, data: T): StableToolResult<T> {
  return { ok: true, data, meta: { request_id: requestId } };
}

function summarizeListings(payload: any): Array<{ listing_id: string; title?: string; price?: unknown; condition?: string; category?: string }> {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : [];
  return items.slice(0, 5).map((item: any) => ({
    listing_id: String(item.listing_id || ""),
    title: item.title,
    price: item.price,
    condition: item.condition,
    category: item.category
  }));
}

function summarizeDeals(payload: any): Array<{ deal_id: string; title?: string; price?: unknown; status?: string }> {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : [];
  return items.slice(0, 5).map((item: any) => ({
    deal_id: String(item.deal_id || ""),
    title: item.title,
    price: item.price,
    status: item.status
  }));
}

export const collabTools: ToolDef[] = [
  {
    name: "get_page_context",
    description:
      "Read the current Clawdeals page: path, title, query params, and what the human currently sees. Use this before searching or navigating.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    inputJsonSchema: { type: "object", additionalProperties: false, properties: {} },
    zodSchema: z.object({}).strict(),
    outputHint: "Current page path, title, and query.",
    execute: async (_args, ctx) => ok(ctx.requestId, getPageContext())
  },
  {
    name: "show_listings",
    description:
      "Update the visible marketplace grid to highlight specific listing IDs so the human can review the same items. Call after search_listings / clawdeals.listings_search.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["listing_ids"],
      properties: {
        listing_ids: {
          type: "array",
          minItems: 1,
          maxItems: 24,
          items: { type: "string" }
        }
      }
    },
    zodSchema: z.object({ listing_ids: z.array(z.string().min(1)).min(1).max(24) }).strict(),
    outputHint: "Highlights listing cards in the shared UI.",
    execute: async (args: any, ctx) => {
      applyListingsSearchUi({ highlight_ids: args.listing_ids });
      return ok(ctx.requestId, { highlighted: args.listing_ids, ui: "updated" });
    }
  },
  {
    name: "open_listing",
    description: "Open a listing detail page in this browser tab so the human and the agent look at the same listing.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["listing_id"],
      properties: { listing_id: { type: "string", format: "uuid" } }
    },
    zodSchema: z.object({ listing_id: uuid }).strict(),
    outputHint: "Navigates the shared UI to the listing.",
    execute: async (args: any, ctx) => {
      applyOpenListingUi(args.listing_id);
      return ok(ctx.requestId, { opened: args.listing_id, href: `/browse/${args.listing_id}` });
    }
  },
  {
    name: "open_deal",
    description: "Open a deal detail page in this browser tab so the human and the agent look at the same deal.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["deal_id"],
      properties: { deal_id: { type: "string", format: "uuid" } }
    },
    zodSchema: z.object({ deal_id: uuid }).strict(),
    outputHint: "Navigates the shared UI to the deal.",
    execute: async (args: any, ctx) => {
      applyOpenDealUi(args.deal_id);
      return ok(ctx.requestId, { opened: args.deal_id, href: `/browse/deals/${args.deal_id}` });
    }
  },
  {
    name: "search_listings",
    description:
      "Search the public marketplace and update the listings grid the human is looking at. Prefer this over clicking filters. Price fields are minor units (cents).",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        q: { type: "string", maxLength: 80 },
        category: { type: "string" },
        condition: { type: "string", enum: ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"] },
        price_min: { type: "integer", minimum: 0 },
        price_max: { type: "integer", minimum: 0 },
        sort: { type: "string", enum: ["recent", "price_asc", "price_desc"] },
        limit: { type: "integer", minimum: 1, maximum: 5 }
      }
    },
    zodSchema: z
      .object({
        q: z.string().max(80).optional(),
        category: z.string().optional(),
        condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]).optional(),
        price_min: z.number().int().min(0).optional(),
        price_max: z.number().int().min(0).optional(),
        sort: z.enum(["recent", "price_asc", "price_desc"]).optional(),
        limit: z.number().int().min(1).max(5).optional()
      })
      .strict(),
    outputHint: "Matching listings plus a UI update on the marketplace grid.",
    execute: async (args: any, ctx) => {
      const result = await callPublicWebmcp({
        method: "GET",
        path: "/v1/public/listings",
        query: {
          q: args.q,
          category: args.category,
          condition: args.condition,
          price_min: args.price_min,
          price_max: args.price_max,
          sort: args.sort || "recent",
          limit: args.limit ?? 5
        },
        requestId: ctx.requestId,
        signal: ctx.signal
      });
      if (result.ok) {
        const items = summarizeListings(result.data);
        applyListingsSearchUi({
          q: args.q,
          category: args.category,
          condition: args.condition,
          price_min: args.price_min,
          price_max: args.price_max,
          sort: args.sort,
          highlight_ids: items.map((item) => item.listing_id).filter(Boolean)
        });
        return ok(ctx.requestId, { items, next_cursor: (result.data as any)?.next_cursor || null, ui: "updated" });
      }
      return result as StableToolResult<any>;
    }
  },
  {
    name: "search_deals",
    description: "Search the public deal feed and update the deals grid the human is looking at.",
    scope: "read",
    requiresConfirmation: false,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    inputJsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        q: { type: "string", maxLength: 80 },
        sort: { type: "string", enum: ["new", "temp", "trend"] },
        status: { type: "string", enum: ["NEW", "ACTIVE", "EXPIRED"] },
        limit: { type: "integer", minimum: 1, maximum: 5 }
      }
    },
    zodSchema: z
      .object({
        q: z.string().max(80).optional(),
        sort: z.enum(["new", "temp", "trend"]).optional(),
        status: z.enum(["NEW", "ACTIVE", "EXPIRED"]).optional(),
        limit: z.number().int().min(1).max(5).optional()
      })
      .strict(),
    outputHint: "Matching deals plus a UI update on the deals grid.",
    execute: async (args: any, ctx) => {
      const result = await callPublicWebmcp({
        method: "GET",
        path: "/v1/public/deals",
        query: {
          q: args.q,
          sort: args.sort || "new",
          status: args.status,
          limit: args.limit ?? 5
        },
        requestId: ctx.requestId,
        signal: ctx.signal
      });
      if (result.ok) {
        const items = summarizeDeals(result.data);
        applyDealsSearchUi({
          q: args.q,
          sort: args.sort,
          status: args.status,
          highlight_ids: items.map((item) => item.deal_id).filter(Boolean)
        });
        return ok(ctx.requestId, { items, next_cursor: (result.data as any)?.next_cursor || null, ui: "updated" });
      }
      return result as StableToolResult<any>;
    }
  }
];
