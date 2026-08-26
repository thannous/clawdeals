import { z } from "zod";

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
    preferred_price_max: { type: "number", exclusiveMinimum: 0 },
    hard_budget_max: { type: "number", exclusiveMinimum: 0 },
    requirements: {
      type: "array",
      maxItems: 10,
      items: { type: "string", minLength: 1, maxLength: 120 }
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

function contractError(requestId: string): StableToolResult<never> {
  return {
    ok: false,
    error: {
      code: "SERVER_CONTRACT_ERROR",
      message: "Mission creation returned an invalid response",
      details: {}
    },
    meta: { request_id: requestId }
  };
}

export const missionTools: ToolDef[] = [
  {
    name: "create_buy_mission",
    description:
      "Create a monitored buying mission with a hard budget, location radius, autonomy limits, bilateral contact consent, and expiration.",
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
        signal: ctx.signal
      });
      if (!result.ok) return result;

      const data = result.data as any;
      const mission = data?.criteria?.mission;
      if (!data?.watchlist_id || !mission) return contractError(ctx.requestId);

      const view: BuyMissionView = {
        mission_id: String(data.watchlist_id),
        status: "ACTIVE",
        query: String(data.criteria.query),
        preferred_price_max:
          typeof mission.preferred_price_max === "number" ? mission.preferred_price_max : null,
        hard_budget_max: Number(mission.hard_budget_max),
        currency: String(mission.currency),
        requirements: Array.isArray(mission.requirements) ? mission.requirements.map(String) : [],
        autonomous_actions: Array.isArray(mission.autonomous_actions)
          ? mission.autonomous_actions.map(String)
          : [],
        contact_reveal: "manual_bilateral_approval",
        expires_at: String(mission.expires_at),
        location: {
          label: mission.location?.label ? String(mission.location.label) : null,
          lat: Number(mission.location?.lat),
          lon: Number(mission.location?.lon),
          radius_km: Number(mission.location?.radius_km)
        }
      };
      applyBuyMissionUi(view);

      return {
        ok: true,
        data: { mission: view },
        meta: { request_id: result.meta.request_id || ctx.requestId }
      };
    }
  }
];
