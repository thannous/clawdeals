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

type ListingsDecisionContext = {
  preferredPriceMax?: number;
  hardBudgetMax?: number;
  requirements?: string[];
};

function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let bytes = 0;
  let output = "";

  for (const character of value) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > maxBytes) break;
    output += character;
    bytes += characterBytes;
  }

  return output;
}

const REQUIREMENT_RE = /^([a-z][a-z0-9_ -]*?)\s*(>=|<=|>|<|=|==)\s*(\d+(?:\.\d+)?)\s*%?$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks numeric requirements such as `battery_health >= 80%` against the seller's own text.
 * Seller text is untrusted, so meeting the threshold never *proves* anything (the requirement stays
 * `requirements_unverified`); only a claim that already falls short becomes a blocking issue.
 */
export function evaluateRequirementShortfalls(item: any, requirements: string[] = []): string[] {
  const haystack = `${typeof item?.title === "string" ? item.title : ""} ${typeof item?.description === "string" ? item.description : ""}`;
  if (!haystack.trim()) return [];
  const shortfalls: string[] = [];
  for (const requirement of requirements) {
    const match = REQUIREMENT_RE.exec(String(requirement || "").trim());
    if (!match) continue;
    const key = match[1].trim().toLowerCase().replace(/[\s-]+/g, "_");
    const operator = match[2];
    const threshold = Number(match[3]);
    if (!Number.isFinite(threshold)) continue;
    const words = key.split("_").filter(Boolean).map(escapeRegExp).join("[\\s_-]*");
    const valueMatch = new RegExp(`${words}[^0-9%]{0,16}?(\\d{1,3}(?:\\.\\d+)?)\\s*%?`, "i").exec(haystack);
    if (!valueMatch) continue;
    const claimed = Number(valueMatch[1]);
    if (!Number.isFinite(claimed)) continue;
    const meets =
      operator === ">=" ? claimed >= threshold
      : operator === ">" ? claimed > threshold
      : operator === "<=" ? claimed <= threshold
      : operator === "<" ? claimed < threshold
      : claimed === threshold;
    if (!meets) shortfalls.push(`${key}_${operator.startsWith("<") ? "above" : "below"}_requirement`);
  }
  return shortfalls;
}

function summarizeListings(payload: any, context: ListingsDecisionContext = {}) {
  const items = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : [];
  return items
    .map((item: any) => {
      const amount = typeof item?.price?.amount === "number" ? item.price.amount : null;
      const sellerVerified = item?.seller?.verified === true;
      const issues: string[] = [];
      let eligible = true;
      let score = 100;

      for (const shortfall of evaluateRequirementShortfalls(item, context.requirements)) {
        eligible = false;
        score -= 30;
        issues.push(shortfall);
      }

      if (typeof context.hardBudgetMax === "number" && amount !== null && amount > context.hardBudgetMax) {
        eligible = false;
        score -= 50;
        issues.push("over_hard_budget");
      } else if (
        typeof context.preferredPriceMax === "number" &&
        amount !== null &&
        amount > context.preferredPriceMax
      ) {
        score -= 10;
        issues.push("over_preferred_price");
      }

      if (!sellerVerified) score -= 10;
      if (context.requirements?.length) {
        score -= 5;
        issues.push("requirements_unverified");
      }

      return {
        listing_id: String(item.listing_id || ""),
        title: typeof item.title === "string" ? truncateUtf8(item.title, 40) : undefined,
        price: item.price,
        distance_km: typeof item.distance_km === "number" ? item.distance_km : null,
        seller_verified: sellerVerified,
        policy_fit: { eligible, issues },
        score
      };
    })
    .sort((a: any, b: any) => b.score - a.score || a.listing_id.localeCompare(b.listing_id))
    .slice(0, 5)
    .map(({ score: _score, ...item }: any, index: number) => ({
      rank: index + 1,
      ...item
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
        sort: { type: "string", enum: ["recent", "price_asc", "price_desc", "distance"] },
        latitude: { type: "number", minimum: -90, maximum: 90 },
        longitude: { type: "number", minimum: -180, maximum: 180 },
        radius_km: { type: "integer", minimum: 1, maximum: 300 },
        preferred_price_max: { type: "number", exclusiveMinimum: 0 },
        hard_budget_max: { type: "number", exclusiveMinimum: 0 },
        requirements: {
          type: "array",
          maxItems: 10,
          items: { type: "string", minLength: 1, maxLength: 120 }
        },
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
        sort: z.enum(["recent", "price_asc", "price_desc", "distance"]).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        radius_km: z.number().int().min(1).max(300).optional(),
        preferred_price_max: z.number().positive().optional(),
        hard_budget_max: z.number().positive().optional(),
        requirements: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
        limit: z.number().int().min(1).max(5).optional()
      })
      .strict()
      .superRefine((args, ctx) => {
        const geoValues = [args.latitude, args.longitude, args.radius_km];
        const geoCount = geoValues.filter((value) => value !== undefined).length;
        if (geoCount !== 0 && geoCount !== 3) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "latitude, longitude, and radius_km must be provided together" });
        }
        if (
          args.preferred_price_max !== undefined &&
          args.hard_budget_max !== undefined &&
          args.preferred_price_max > args.hard_budget_max
        ) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "preferred_price_max must not exceed hard_budget_max" });
        }
      }),
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
          sort: args.latitude !== undefined ? "distance" : args.sort || "recent",
          lat: args.latitude,
          lng: args.longitude,
          distance_km: args.radius_km,
          limit: args.limit ?? 5
        },
        requestId: ctx.requestId,
        signal: ctx.signal
      });
      if (result.ok) {
        const items = summarizeListings(result.data, {
          preferredPriceMax: args.preferred_price_max,
          hardBudgetMax: args.hard_budget_max,
          requirements: args.requirements
        });
        // Without mission constraints every listing is trivially "eligible"; only surface verdicts under a policy.
        const underMissionPolicy =
          args.preferred_price_max !== undefined ||
          args.hard_budget_max !== undefined ||
          (Array.isArray(args.requirements) && args.requirements.length > 0);
        applyListingsSearchUi({
          q: args.q,
          category: args.category,
          condition: args.condition,
          price_min: args.price_min,
          price_max: args.price_max,
          sort: args.sort,
          highlight_ids: items.map((item) => item.listing_id).filter(Boolean),
          ...(underMissionPolicy
            ? {
                policy_fit_by_id: Object.fromEntries(
                  items.filter((item) => item.listing_id).map((item) => [item.listing_id, item.policy_fit])
                )
              }
            : {})
        });
        return ok(ctx.requestId, { items });
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
