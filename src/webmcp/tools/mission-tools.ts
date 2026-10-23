import { z } from "zod";
import { SMARTPHONE_CHECK_IDS } from "../../lib/smartphone-passport";
import { normalizeSmartphoneMissionCriteria } from "../../lib/smartphone-mission";

import { getStoredApiKey } from "../../ui/developer/storage";
import { callClawdealsWebmcp } from "../http";
import { applyBuyMissionUi, type BuyMissionView } from "../ui-bridge";
import type { StableToolResult } from "../types";
import type { ToolDef } from "./defs";

const MARKET_CURRENCY = {
  FR: "EUR",
  ES: "EUR",
  GB: "GBP"
} as const;

const autonomousAction = z.enum(["search", "ask_question", "make_offer"]);

export const smartphoneMissionZodSchema = z.object({
  version: z.literal(1),
  model: z.string().trim().min(1).max(120).nullable(),
  battery_health_min: z.number().int().min(0).max(100).nullable(),
  required_checks: z.array(z.enum(SMARTPHONE_CHECK_IDS)).max(5)
}).strict().refine(value => {
  try { normalizeSmartphoneMissionCriteria(value); return true; } catch { return false; }
}, "At least one valid smartphone requirement is required").transform(value => normalizeSmartphoneMissionCriteria(value));

export const buyMissionZodSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    query: z.string().trim().min(1).max(80),
    market_code: z.enum(["FR", "GB", "ES"]),
    location_label: z.string().trim().max(80).optional(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radius_km: z.number().int().min(1).max(300),
    preferred_price_max: z.number().positive().optional(),
    hard_budget_max: z.number().positive(),
    requirements: z.array(z.string().trim().min(1).max(120)).max(10),
    smartphone: smartphoneMissionZodSchema.optional(),
    autonomous_actions: z.array(autonomousAction).min(1).max(3),
    contact_reveal: z.literal("manual_bilateral_approval"),
    expires_at: z.string().datetime({ offset: true })
  })
  .strict()
  .superRefine((args, ctx) => {
    if (
      args.preferred_price_max !== undefined &&
      args.preferred_price_max > args.hard_budget_max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferred_price_max"],
        message: "preferred_price_max must not exceed hard_budget_max"
      });
    }
    if (!args.autonomous_actions.includes("search")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["autonomous_actions"],
        message: "autonomous_actions must include search"
      });
    }
    const expiresMs = new Date(args.expires_at).getTime();
    const nowMs = Date.now();
    if (expiresMs <= nowMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expires_at"],
        message: "expires_at must be in the future"
      });
    } else if (expiresMs > nowMs + 90 * 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expires_at"],
        message: "expires_at must be within 90 days"
      });
    }
  });

// Validate fields used by the success view. WatchlistV1 has no owner-only
// status field; an idempotent success may also have an expiry in the past.
const missionResponseSchema = z.object({
  watchlist_id: z.string().uuid(),
  criteria: z.object({
    query: z.string().trim().min(1).max(80),
    mission: z.object({
      version: z.literal(1), kind: z.literal("BUY"),
      preferred_price_max: z.number().positive().nullable(),
      hard_budget_max: z.number().positive(),
      currency: z.enum(["EUR", "GBP"]),
      requirements: z.array(z.string().trim().min(1).max(120)).max(10),
      smartphone: smartphoneMissionZodSchema.optional(),
      autonomous_actions: z.array(autonomousAction).min(1).max(3)
        .refine(actions => actions.includes("search") && new Set(actions).size === actions.length),
      contact_reveal: z.literal("manual_bilateral_approval"),
      expires_at: z.string().datetime({ offset: true }),
      location: z.object({
        label: z.string().max(80).nullable(),
        lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180),
        radius_km: z.number().int().min(1).max(300)
      })
    }).refine(mission => mission.preferred_price_max === null || mission.preferred_price_max <= mission.hard_budget_max)
  })
});

export const buyMissionInputJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "query",
    "market_code",
    "latitude",
    "longitude",
    "radius_km",
    "hard_budget_max",
    "requirements",
    "autonomous_actions",
    "contact_reveal",
    "expires_at"
  ],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 80 },
    query: { type: "string", minLength: 1, maxLength: 80 },
    market_code: { type: "string", enum: ["FR", "GB", "ES"] },
    location_label: { type: "string", maxLength: 80 },
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
    radius_km: { type: "integer", minimum: 1, maximum: 300 },
    preferred_price_max: { type: "number", exclusiveMinimum: 0, description: "Preferred price in major units of the market currency (EUR or GBP), e.g. 75.50." },
    hard_budget_max: { type: "number", exclusiveMinimum: 0, description: "Absolute budget in major units of the market currency (EUR or GBP), e.g. 100 for 100 EUR." },
    requirements: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 120 }
    },
    smartphone: {
      type: "object", additionalProperties: false,
      required: ["version", "model", "battery_health_min", "required_checks"],
      description: "Optional smartphone passport criteria. At least one criterion is required. Unknown seller information never qualifies.",
      properties: {
        version: { type: "integer", const: 1 },
        model: { type: ["string", "null"], minLength: 1, maxLength: 120 },
        battery_health_min: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        required_checks: { type: "array", maxItems: 5, uniqueItems: true, items: { type: "string", enum: [...SMARTPHONE_CHECK_IDS] } }
      }
    },
    autonomous_actions: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: { type: "string", enum: ["search", "ask_question", "make_offer"] }
    },
    contact_reveal: { type: "string", enum: ["manual_bilateral_approval"] },
    expires_at: { type: "string", format: "date-time" }
  }
};

function unknownMissionOutcome(requestId: string): StableToolResult<never> {
  return {
    ok: false,
    error: {
      code: "OUTCOME_UNKNOWN",
      message: "Mission creation returned an invalid response, so its outcome is unknown",
      details: { safe_to_retry: false }
    },
    meta: { request_id: requestId }
  };
}

export const missionTools: ToolDef[] = [
  {
    name: "create_buy_mission",
    description:
      "Create a monitored buying mission with a hard budget, location radius, optional smartphone passport requirements, autonomy limits, bilateral contact consent, and expiration.",
    scope: "write",
    requiresConfirmation: true,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    inputJsonSchema: buyMissionInputJsonSchema,
    zodSchema: buyMissionZodSchema,
    outputHint: "Created an active buy mission and displayed its enforced limits.",
    execute: async (args: any, ctx) => {
      const currency = MARKET_CURRENCY[args.market_code as keyof typeof MARKET_CURRENCY];
      const result = await callClawdealsWebmcp({
        method: "POST",
        path: "/v1/watchlists",
        body: {
          name: args.name || `Buy: ${args.query}`.slice(0, 80),
          active: true,
          market_code: args.market_code,
          criteria: {
            query: args.query,
            geo: { lat: args.latitude, lon: args.longitude },
            distance_km: args.radius_km,
            mission: {
              version: 1,
              kind: "BUY",
              preferred_price_max: args.preferred_price_max ?? null,
              hard_budget_max: args.hard_budget_max,
              currency,
              requirements: args.requirements,
              ...(args.smartphone ? { smartphone: normalizeSmartphoneMissionCriteria(args.smartphone) } : {}),
              autonomous_actions: args.autonomous_actions,
              contact_reveal: args.contact_reveal,
              expires_at: args.expires_at,
              location: {
                label: args.location_label || null,
                lat: args.latitude,
                lon: args.longitude,
                radius_km: args.radius_km
              }
            }
          }
        },
        requestId: ctx.requestId,
        idempotencyKey: ctx.idempotencyKey,
        signal: ctx.signal,
        apiKey: ctx.apiKey
      });
      if (!result.ok) return result;

      const parsed = missionResponseSchema.safeParse(result.data);
      if (!parsed.success) return unknownMissionOutcome(result.meta.request_id || ctx.requestId);
      const { watchlist_id: missionId, criteria } = parsed.data;
      const mission = criteria.mission;
      const requestedSmartphone = args.smartphone ? normalizeSmartphoneMissionCriteria(args.smartphone) : null;
      const receivedSmartphone = mission.smartphone ? normalizeSmartphoneMissionCriteria(mission.smartphone) : null;
      if (JSON.stringify(requestedSmartphone) !== JSON.stringify(receivedSmartphone)) {
        return unknownMissionOutcome(result.meta.request_id || ctx.requestId);
      }
      if (mission.currency !== currency) return unknownMissionOutcome(result.meta.request_id || ctx.requestId);
      const view: BuyMissionView = {
        ...mission,
        preferred_price_max: mission.preferred_price_max ?? null,
        location: { ...mission.location, label: mission.location.label ?? null },
        mission_id: missionId,
        status: "ACTIVE",
        query: criteria.query
      };
      // An old agent's late response must not repopulate the current agent's UI.
      if (ctx.apiKey === undefined || getStoredApiKey() === ctx.apiKey) applyBuyMissionUi(view);

      return {
        ok: true,
        data: { mission: view },
        meta: { request_id: result.meta.request_id || ctx.requestId }
      };
    }
  }
];
