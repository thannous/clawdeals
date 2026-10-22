import { z } from "zod";
import { normalizeSmartphoneMissionCriteria, type SmartphoneMissionCriteria } from "../../lib/smartphone-mission";
import type { BuyMissionInput } from "../webmcp/BuyMissionPanel";
import type { BuyMissionView } from "../../webmcp/ui-bridge";

export type OwnerMission = {
  watchlist_id: string;
  name: string | null;
  active: boolean;
  status?: "ACTIVE" | "EXPIRED" | "PAUSED";
  market_code: "FR" | "GB" | "ES";
  currency: string;
  created_at: string;
  criteria: {
    query: string;
    notification_mode?: string;
    mission: Omit<BuyMissionView, "mission_id" | "status" | "query">;
  };
};

const money = z.number().positive().max(1_000_000_000);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const radius = z.number().int().min(1).max(300);
const smartphoneCriteria = z.custom<SmartphoneMissionCriteria>(value => {
  try { normalizeSmartphoneMissionCriteria(value); return true; } catch { return false; }
});
const ownerMissionResponse = z.object({
  watchlist_id: z.string().uuid(),
  name: z.string().max(80).nullable(),
  active: z.boolean(),
  status: z.enum(["ACTIVE", "EXPIRED", "PAUSED"]),
  market_code: z.enum(["FR", "GB", "ES"]),
  currency: z.enum(["EUR", "GBP"]),
  created_at: z.string().datetime({ offset: true }),
  criteria: z.object({
    query: z.string().trim().min(1).max(80),
    geo: z.object({ lat: latitude, lon: longitude }),
    distance_km: radius,
    mission: z.object({
      version: z.literal(1), kind: z.literal("BUY"),
      preferred_price_max: money.nullable(), hard_budget_max: money,
      currency: z.enum(["EUR", "GBP"]),
      smartphone: smartphoneCriteria.optional(),
      requirements: z.array(z.string().trim().min(1).max(120)).max(10),
      autonomous_actions: z.array(z.enum(["search", "ask_question", "make_offer"])).min(1).max(3)
        .refine(actions => actions.includes("search") && new Set(actions).size === actions.length),
      contact_reveal: z.literal("manual_bilateral_approval"),
      // A successful idempotent replay may legitimately be expired by now.
      expires_at: z.string().datetime({ offset: true }),
      location: z.object({ label: z.string().max(80).nullable(), lat: latitude, lon: longitude, radius_km: radius })
    })
  })
}).refine(item => {
  const { mission, geo, distance_km: distance } = item.criteria;
  return item.currency === (item.market_code === "GB" ? "GBP" : "EUR") && mission.currency === item.currency &&
    (mission.preferred_price_max === null || mission.preferred_price_max <= mission.hard_budget_max) &&
    geo.lat === mission.location.lat && geo.lon === mission.location.lon && distance === mission.location.radius_km;
});

export function confirmedOwnerMission(value: unknown, expected?: BuyMissionInput): OwnerMission {
  // Do not discard a durable creation attempt until every field consumed by
  // the success view and destination page satisfies the response contract.
  if (!ownerMissionResponse.safeParse(value).success) throw new MissionRequestError(502, "SERVER_CONTRACT_ERROR");
  const confirmed = value as OwnerMission;
  if (expected) {
    const requested = expected.smartphone ? normalizeSmartphoneMissionCriteria(expected.smartphone) : null;
    const received = confirmed.criteria.mission.smartphone ? normalizeSmartphoneMissionCriteria(confirmed.criteria.mission.smartphone) : null;
    if (JSON.stringify(requested) !== JSON.stringify(received)) throw new MissionRequestError(502, "SERVER_CONTRACT_ERROR");
  }
  return confirmed;
}

export function missionView(item: OwnerMission): BuyMissionView {
  return { ...item.criteria.mission, mission_id: item.watchlist_id, status: "ACTIVE", query: item.criteria.query };
}

export function missionStatus(item: OwnerMission) {
  // The server also knows whether the mission's agent is suspended.
  if (item.status) return item.status;
  if (!item.active) return "PAUSED";
  return Date.parse(item.criteria.mission.expires_at) <= Date.now() ? "EXPIRED" : "ACTIVE";
}

export function missionPayload(args: BuyMissionInput) {
  return {
    name: args.query,
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
        currency: args.market_code === "GB" ? "GBP" : "EUR",
        requirements: args.requirements,
        ...(args.smartphone ? { smartphone: normalizeSmartphoneMissionCriteria(args.smartphone) } : {}),
        autonomous_actions: args.autonomous_actions,
        contact_reveal: args.contact_reveal,
        expires_at: args.expires_at,
        location: { label: args.location_label || null, lat: args.latitude, lon: args.longitude, radius_km: args.radius_km }
      }
    }
  };
}

export class MissionRequestError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function missionRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(30_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const response = await fetch(`/api/v1/owner/missions${path}`, { credentials: "include", cache: "no-store", ...init, signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new MissionRequestError(response.status, body?.error?.code || "REQUEST_FAILED");
  if (!body || typeof body !== "object") throw new MissionRequestError(502, "SERVER_CONTRACT_ERROR");
  return body as T;
}
