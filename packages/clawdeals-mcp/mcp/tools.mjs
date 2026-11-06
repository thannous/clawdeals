import crypto from "node:crypto";
import { z } from "zod";

import { callClawdeals } from "./clawdeals-api.mjs";

const uuid = z.string().uuid();
const dryRun = z.boolean().optional();
const marketCode = z.enum(["FR", "GB", "ES"]);
const MediaImageSchema = z
  .object({
    storage_key: z.string().min(1),
    mime: z.string().min(1),
    w: z.number().int().min(1).optional(),
    h: z.number().int().min(1).optional()
  })
  .strict();

function stableError({ requestId, code, message, details = {} }) {
  return {
    ok: false,
    error: {
      code,
      message,
      details: details && typeof details === "object" ? details : {}
    },
    meta: {
      request_id: requestId || crypto.randomUUID()
    }
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function omitKeys(obj, keys) {
  if (!isObject(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

function joinCsv(values) {
  if (!Array.isArray(values)) return undefined;
  const normalized = values.map((v) => String(v).trim()).filter(Boolean);
  return normalized.length ? normalized.join(",") : undefined;
}

const DealsListSchema = z
  .object({
    sort: z.enum(["new", "temp", "trend"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    q: z.string().min(1).max(80).optional(),
    tags: z.array(z.string()).max(20).optional(),
    min_temperature: z.number().int().min(0).max(100).optional(),
    status: z.array(z.enum(["NEW", "ACTIVE", "EXPIRED"])).max(3).optional(),
    dry_run: dryRun
  })
  .strict();

const DealsGetSchema = z
  .object({
    deal_id: uuid,
    dry_run: dryRun
  })
  .strict();

const DealsCreateSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    title: z.string().min(1).max(140),
    url: z.string().min(1),
    price: z.number().positive(),
    currency: z.string().min(3).max(3),
    market_code: marketCode.optional(),
    expires_at: z.string().datetime(),
    tags: z.array(z.string()).max(20).optional(),
    images: z.array(MediaImageSchema).max(8).nullable().optional(),
    cover_image_index: z.number().int().min(0).max(7).nullable().optional(),
    dry_run: dryRun
  })
  .strict();

const DealsUpdateSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    deal_id: uuid,
    title: z.string().min(1).max(140).optional(),
    price: z.number().positive().optional(),
    currency: z.string().min(3).max(3).optional(),
    market_code: marketCode.optional(),
    expires_at: z.string().datetime().optional(),
    tags: z.array(z.string()).max(20).optional(),
    images: z.array(MediaImageSchema).max(8).nullable().optional(),
    cover_image_index: z.number().int().min(0).max(7).nullable().optional(),
    dry_run: dryRun
  })
  .strict();

const DealsDeleteSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    deal_id: uuid,
    dry_run: dryRun
  })
  .strict();

const DealsVoteSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    deal_id: uuid,
    direction: z.enum(["up", "down"]),
    reason: z.string().min(1).max(400),
    dry_run: dryRun
  })
  .strict();

const WatchlistsCreateSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    name: z.string().min(1).max(80).optional(),
    active: z.boolean().optional(),
    market_code: marketCode.optional(),
    criteria: z
      .object({
        query: z.string().max(80).nullable().optional(),
        tags: z.array(z.string()).max(20).optional(),
        price_max: z.number().min(0).nullable().optional(),
        geo: z
          .object({
            lat: z.number().min(-90).max(90),
            lon: z.number().min(-180).max(180)
          })
          .strict()
          .nullable()
          .optional(),
        distance_km: z.number().int().min(0).max(1000).nullable().optional()
      })
      .strict(),
    dry_run: dryRun
  })
  .strict();

const WatchlistsListSchema = z
  .object({
    active: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    dry_run: dryRun
  })
  .strict();

const WatchlistsGetSchema = z
  .object({
    watchlist_id: uuid,
    dry_run: dryRun
  })
  .strict();

const WatchlistsGetMatchesSchema = z
  .object({
    watchlist_id: uuid,
    entity_type: z.enum(["deal", "listing"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    dry_run: dryRun
  })
  .strict();

const ListingsListSchema = z
  .object({
    category: z.string().optional(),
    condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]).optional(),
    price_min: z.number().int().min(0).optional(),
    price_max: z.number().int().min(0).optional(),
    sort: z.enum(["recent", "price_asc", "price_desc", "distance"]).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    q: z.string().optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    distance_km: z.number().min(0).optional(),
    dry_run: dryRun
  })
  .strict();

const ListingsGetSchema = z
  .object({
    listing_id: uuid,
    dry_run: dryRun
  })
  .strict();

const ListingPriceSchema = z
  .object({
    amount: z.number().int().min(0).max(2147483647),
    currency: z.string().min(3).max(3)
  })
  .strict();

const ListingsCreateSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    title: z.string().min(1).max(120),
    description: z.string().max(4000).nullable().optional(),
    category: z.string(),
    condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]),
    price: ListingPriceSchema,
    market_code: marketCode.optional(),
    publish: z.boolean(),
    deal_id: uuid.optional(),
    geo: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180)
      })
      .strict()
      .nullable()
      .optional(),
    images: z.array(MediaImageSchema).max(8).nullable().optional(),
    photos: z.array(MediaImageSchema).max(8).nullable().optional(),
    cover_image_index: z.number().int().min(0).max(7).nullable().optional(),
    dry_run: dryRun
  })
  .strict();

const ListingsUpdateSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    listing_id: uuid,
    title: z.string().min(1).max(120).optional(),
    description: z.string().max(4000).nullable().optional(),
    status: z.enum(["LIVE", "REMOVED"]).optional(),
    price: ListingPriceSchema.optional(),
    market_code: marketCode.optional(),
    images: z.array(MediaImageSchema).max(8).nullable().optional(),
    photos: z.array(MediaImageSchema).max(8).nullable().optional(),
    cover_image_index: z.number().int().min(0).max(7).nullable().optional(),
    dry_run: dryRun
  })
  .strict();

const OffersCreateSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    listing_id: uuid,
    thread_id: uuid.optional(),
    amount: z.number().int().min(0).max(2147483647),
    currency: z.string().min(3).max(3),
    expires_at: z.string().datetime(),
    dry_run: dryRun
  })
  .strict();

const OffersCounterSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    offer_id: uuid,
    amount: z.number().int().min(0).max(2147483647),
    currency: z.string().min(3).max(3),
    expires_at: z.string().datetime(),
    dry_run: dryRun
  })
  .strict();

const OffersActionSchema = z
  .object({
    idempotency_key: z.string().min(1).max(128),
    offer_id: uuid,
    dry_run: dryRun
  })
  .strict();

function dealFilters(input) {
  const query = {
    ...(input.sort ? { sort: input.sort } : {}),
    ...(input.limit != null ? { limit: input.limit } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    ...(input.q ? { q: input.q } : {}),
    ...(input.min_temperature != null ? { min_temperature: input.min_temperature } : {})
  };
  const tags = joinCsv(input.tags);
  if (tags) query.tags = tags;
  const status = joinCsv(input.status);
  if (status) query.status = status;
  return query;
}

function matchFilters(input) {
  return {
    entity_type: input.entity_type || "deal",
    ...(input.limit != null ? { limit: input.limit } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {})
  };
}

function restTool({ name, inputSchema, method, path, group, intro = "", queryExample = "", query, emptyBody = false }) {
  const isWrite = method !== "GET";
  return {
    name,
    description: `${intro}REST: ${method} ${path}${queryExample} (rate_limit_group=${group})`,
    inputSchema,
    isWrite,
    buildRequest(input) {
      // dry_run belongs to MCP; IDs in the URL and idempotency keys never enter the JSON body.
      const fields = omitKeys(input, ["dry_run"]);
      const urlPath = path.replace(/\{(\w+)\}/g, (_match, key) => {
        const value = fields[key];
        delete fields[key];
        return String(value);
      });
      if (!isWrite) {
        return { method, path: urlPath, query: query ? query(fields) : {}, body: undefined, idempotencyKey: null };
      }

      const { idempotency_key: idempotencyKey, ...body } = fields;
      return {
        method,
        path: urlPath,
        query: {},
        body: method === "DELETE" ? undefined : emptyBody ? {} : body,
        idempotencyKey
      };
    }
  };
}

export const TOOLS = [
  restTool({
    name: "clawdeals.deals.list",
    inputSchema: DealsListSchema,
    method: "GET",
    path: "/v1/deals",
    group: "deals.read",
    query: dealFilters
  }),
  restTool({
    name: "clawdeals.deals.get",
    inputSchema: DealsGetSchema,
    method: "GET",
    path: "/v1/deals/{deal_id}",
    group: "deals.read"
  }),
  restTool({
    name: "clawdeals.deals.create",
    inputSchema: DealsCreateSchema,
    method: "POST",
    path: "/v1/deals",
    group: "deals.create"
  }),
  restTool({
    name: "clawdeals.deals.update",
    inputSchema: DealsUpdateSchema,
    method: "PATCH",
    path: "/v1/deals/{deal_id}",
    group: "deals.update"
  }),
  restTool({
    name: "clawdeals.deals.delete",
    inputSchema: DealsDeleteSchema,
    method: "DELETE",
    path: "/v1/deals/{deal_id}",
    group: "deals.delete"
  }),
  restTool({
    name: "clawdeals.deals.vote",
    inputSchema: DealsVoteSchema,
    method: "POST",
    path: "/v1/deals/{deal_id}/vote",
    group: "deals.vote"
  }),
  restTool({
    name: "clawdeals.watchlists.create",
    inputSchema: WatchlistsCreateSchema,
    method: "POST",
    path: "/v1/watchlists",
    group: "watchlists.write"
  }),
  restTool({
    name: "clawdeals.watchlists.list",
    inputSchema: WatchlistsListSchema,
    method: "GET",
    path: "/v1/watchlists",
    group: "watchlists.read",
    query: (fields) => fields
  }),
  restTool({
    name: "clawdeals.watchlists.get",
    inputSchema: WatchlistsGetSchema,
    method: "GET",
    path: "/v1/watchlists/{watchlist_id}",
    group: "watchlists.read"
  }),
  restTool({
    name: "clawdeals.watchlists.get_matches",
    inputSchema: WatchlistsGetMatchesSchema,
    method: "GET",
    path: "/v1/watchlists/{watchlist_id}/matches",
    group: "watchlists.read",
    queryExample: "?entity_type=deal|listing",
    query: matchFilters
  }),
  restTool({
    name: "clawdeals.listings.list",
    inputSchema: ListingsListSchema,
    method: "GET",
    path: "/v1/listings",
    group: "listings.read",
    query: (fields) => fields
  }),
  restTool({
    name: "clawdeals.listings.get",
    inputSchema: ListingsGetSchema,
    method: "GET",
    path: "/v1/listings/{listing_id}",
    group: "listings.read"
  }),
  restTool({
    name: "clawdeals.listings.get_passport",
    inputSchema: ListingsGetSchema,
    method: "GET",
    path: "/v1/listings/{listing_id}/passport",
    group: "listings.read",
    intro: "Read smartphone declarations, supporting photos and missing-proof questions. Documented means seller evidence, never independent verification. "
  }),
  restTool({
    name: "clawdeals.listings.create",
    inputSchema: ListingsCreateSchema,
    method: "POST",
    path: "/v1/listings",
    group: "listings.create"
  }),
  restTool({
    name: "clawdeals.listings.update",
    inputSchema: ListingsUpdateSchema,
    method: "PATCH",
    path: "/v1/listings/{listing_id}",
    group: "listings.write"
  }),
  restTool({
    name: "clawdeals.offers.create",
    inputSchema: OffersCreateSchema,
    method: "POST",
    path: "/v1/listings/{listing_id}/offers",
    group: "offers.create"
  }),
  restTool({
    name: "clawdeals.offers.counter",
    inputSchema: OffersCounterSchema,
    method: "POST",
    path: "/v1/offers/{offer_id}/counter",
    group: "offers.create"
  }),
  ...["accept", "decline", "cancel"].map((action) => restTool({
    name: `clawdeals.offers.${action}`,
    inputSchema: OffersActionSchema,
    method: "POST",
    path: `/v1/offers/{offer_id}/${action}`,
    group: "offers.actions",
    emptyBody: true
  }))
];

export function getToolConfig(name) {
  return TOOLS.find((tool) => tool.name === name) || null;
}

export function buildRequest(toolName, input = {}) {
  const tool = getToolConfig(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);
  return tool.buildRequest(input);
}

export async function executeTool(toolName, input = {}, options = {}) {
  const requestId = options.requestId || crypto.randomUUID();
  const tool = getToolConfig(toolName);
  if (!tool) {
    return stableError({
      requestId,
      code: "NOT_FOUND",
      message: `Tool not found: ${toolName}`
    });
  }

  if (tool.isWrite && input && input.dry_run === true) {
    return stableError({
      requestId,
      code: "NOT_SUPPORTED",
      message: "dry_run is not supported for write tools"
    });
  }

  let req;
  try {
    req = tool.buildRequest(input);
  } catch (error) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message || "")
        : String(error || "");

    const isValidationError =
      (typeof z?.ZodError === "function" && error instanceof z.ZodError) ||
      message.startsWith("Input validation error:");

    return stableError({
      requestId,
      code: isValidationError ? "VALIDATION_ERROR" : "ERROR",
      message: message || (isValidationError ? "Invalid tool input" : "Tool execution error")
    });
  }

  return callClawdeals({
    ...req,
    requestId,
    env: options.env || process.env,
    fetchImpl: options.fetchImpl || fetch
  });
}
