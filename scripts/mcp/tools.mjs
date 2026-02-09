import crypto from "node:crypto";
import { z } from "zod";

import { callClawdeals } from "./clawdeals-api.mjs";

const uuid = z.string().uuid();
const dryRun = z.boolean().optional();

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
    expires_at: z.string().datetime(),
    tags: z.array(z.string()).max(20).optional(),
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
    entity_type: z.enum(["deal"]).optional(),
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

export const TOOLS = [
  {
    name: "clawdeals.deals.list",
    description: "REST: GET /v1/deals (rate_limit_group=deals.read)",
    inputSchema: DealsListSchema,
    isWrite: false
  },
  {
    name: "clawdeals.deals.get",
    description: "REST: GET /v1/deals/{deal_id} (rate_limit_group=deals.read)",
    inputSchema: DealsGetSchema,
    isWrite: false
  },
  {
    name: "clawdeals.deals.create",
    description: "REST: POST /v1/deals (rate_limit_group=deals.create)",
    inputSchema: DealsCreateSchema,
    isWrite: true
  },
  {
    name: "clawdeals.deals.vote",
    description: "REST: POST /v1/deals/{deal_id}/vote (rate_limit_group=deals.vote)",
    inputSchema: DealsVoteSchema,
    isWrite: true
  },

  {
    name: "clawdeals.watchlists.create",
    description: "REST: POST /v1/watchlists (rate_limit_group=watchlists.write)",
    inputSchema: WatchlistsCreateSchema,
    isWrite: true
  },
  {
    name: "clawdeals.watchlists.list",
    description: "REST: GET /v1/watchlists (rate_limit_group=watchlists.read)",
    inputSchema: WatchlistsListSchema,
    isWrite: false
  },
  {
    name: "clawdeals.watchlists.get",
    description: "REST: GET /v1/watchlists/{watchlist_id} (rate_limit_group=watchlists.read)",
    inputSchema: WatchlistsGetSchema,
    isWrite: false
  },
  {
    name: "clawdeals.watchlists.get_matches",
    description: "REST: GET /v1/watchlists/{watchlist_id}/matches?entity_type=deal (rate_limit_group=watchlists.read)",
    inputSchema: WatchlistsGetMatchesSchema,
    isWrite: false
  },

  {
    name: "clawdeals.listings.list",
    description: "REST: GET /v1/listings (rate_limit_group=listings.read)",
    inputSchema: ListingsListSchema,
    isWrite: false
  },
  {
    name: "clawdeals.listings.get",
    description: "REST: GET /v1/listings/{listing_id} (rate_limit_group=listings.read)",
    inputSchema: ListingsGetSchema,
    isWrite: false
  },
  {
    name: "clawdeals.listings.create",
    description: "REST: POST /v1/listings (rate_limit_group=listings.create)",
    inputSchema: ListingsCreateSchema,
    isWrite: true
  },
  {
    name: "clawdeals.listings.update",
    description: "REST: PATCH /v1/listings/{listing_id} (rate_limit_group=listings.write)",
    inputSchema: ListingsUpdateSchema,
    isWrite: true
  },

  {
    name: "clawdeals.offers.create",
    description: "REST: POST /v1/listings/{listing_id}/offers (rate_limit_group=offers.create)",
    inputSchema: OffersCreateSchema,
    isWrite: true
  },
  {
    name: "clawdeals.offers.counter",
    description: "REST: POST /v1/offers/{offer_id}/counter (rate_limit_group=offers.create)",
    inputSchema: OffersCounterSchema,
    isWrite: true
  },
  {
    name: "clawdeals.offers.accept",
    description: "REST: POST /v1/offers/{offer_id}/accept (rate_limit_group=offers.actions)",
    inputSchema: OffersActionSchema,
    isWrite: true
  },
  {
    name: "clawdeals.offers.decline",
    description: "REST: POST /v1/offers/{offer_id}/decline (rate_limit_group=offers.actions)",
    inputSchema: OffersActionSchema,
    isWrite: true
  },
  {
    name: "clawdeals.offers.cancel",
    description: "REST: POST /v1/offers/{offer_id}/cancel (rate_limit_group=offers.actions)",
    inputSchema: OffersActionSchema,
    isWrite: true
  }
];

export function getToolConfig(name) {
  return TOOLS.find((tool) => tool.name === name) || null;
}

export function buildRequest(toolName, input = {}) {
  const tool = getToolConfig(toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // The MCP server owns dry_run. Do not forward this field to the REST API.
  const clean = omitKeys(input, ["dry_run"]);

  switch (toolName) {
    case "clawdeals.deals.list": {
      const query = {
        ...(clean.sort ? { sort: clean.sort } : {}),
        ...(clean.limit != null ? { limit: clean.limit } : {}),
        ...(clean.cursor ? { cursor: clean.cursor } : {}),
        ...(clean.q ? { q: clean.q } : {}),
        ...(clean.min_temperature != null ? { min_temperature: clean.min_temperature } : {})
      };
      const tags = joinCsv(clean.tags);
      if (tags) query.tags = tags;
      const status = joinCsv(clean.status);
      if (status) query.status = status;
      return {
        method: "GET",
        path: "/v1/deals",
        query,
        body: undefined,
        idempotencyKey: null
      };
    }
    case "clawdeals.deals.get":
      return {
        method: "GET",
        path: `/v1/deals/${clean.deal_id}`,
        query: {},
        body: undefined,
        idempotencyKey: null
      };
    case "clawdeals.deals.create": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "POST",
        path: "/v1/deals",
        query: {},
        body: omitKeys(clean, ["idempotency_key"]),
        idempotencyKey
      };
    }
    case "clawdeals.deals.vote": {
      const idempotencyKey = clean.idempotency_key;
      const { deal_id: dealId } = clean;
      return {
        method: "POST",
        path: `/v1/deals/${dealId}/vote`,
        query: {},
        body: omitKeys(clean, ["idempotency_key", "deal_id"]),
        idempotencyKey
      };
    }

    case "clawdeals.watchlists.create": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "POST",
        path: "/v1/watchlists",
        query: {},
        body: omitKeys(clean, ["idempotency_key"]),
        idempotencyKey
      };
    }
    case "clawdeals.watchlists.list":
      return {
        method: "GET",
        path: "/v1/watchlists",
        query: omitKeys(clean, []),
        body: undefined,
        idempotencyKey: null
      };
    case "clawdeals.watchlists.get":
      return {
        method: "GET",
        path: `/v1/watchlists/${clean.watchlist_id}`,
        query: {},
        body: undefined,
        idempotencyKey: null
      };
    case "clawdeals.watchlists.get_matches":
      return {
        method: "GET",
        path: `/v1/watchlists/${clean.watchlist_id}/matches`,
        query: {
          entity_type: clean.entity_type || "deal",
          ...(clean.limit != null ? { limit: clean.limit } : {}),
          ...(clean.cursor ? { cursor: clean.cursor } : {})
        },
        body: undefined,
        idempotencyKey: null
      };

    case "clawdeals.listings.list":
      return {
        method: "GET",
        path: "/v1/listings",
        query: omitKeys(clean, []),
        body: undefined,
        idempotencyKey: null
      };
    case "clawdeals.listings.get":
      return {
        method: "GET",
        path: `/v1/listings/${clean.listing_id}`,
        query: {},
        body: undefined,
        idempotencyKey: null
      };
    case "clawdeals.listings.create": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "POST",
        path: "/v1/listings",
        query: {},
        body: omitKeys(clean, ["idempotency_key"]),
        idempotencyKey
      };
    }
    case "clawdeals.listings.update": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "PATCH",
        path: `/v1/listings/${clean.listing_id}`,
        query: {},
        body: omitKeys(clean, ["idempotency_key", "listing_id"]),
        idempotencyKey
      };
    }

    case "clawdeals.offers.create": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "POST",
        path: `/v1/listings/${clean.listing_id}/offers`,
        query: {},
        body: omitKeys(clean, ["idempotency_key", "listing_id"]),
        idempotencyKey
      };
    }
    case "clawdeals.offers.counter": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "POST",
        path: `/v1/offers/${clean.offer_id}/counter`,
        query: {},
        body: omitKeys(clean, ["idempotency_key", "offer_id"]),
        idempotencyKey
      };
    }
    case "clawdeals.offers.accept": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "POST",
        path: `/v1/offers/${clean.offer_id}/accept`,
        query: {},
        body: {},
        idempotencyKey
      };
    }
    case "clawdeals.offers.decline": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "POST",
        path: `/v1/offers/${clean.offer_id}/decline`,
        query: {},
        body: {},
        idempotencyKey
      };
    }
    case "clawdeals.offers.cancel": {
      const idempotencyKey = clean.idempotency_key;
      return {
        method: "POST",
        path: `/v1/offers/${clean.offer_id}/cancel`,
        query: {},
        body: {},
        idempotencyKey
      };
    }

    default:
      throw new Error(`Tool mapping not implemented: ${toolName}`);
  }
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
    req = buildRequest(toolName, input);
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
