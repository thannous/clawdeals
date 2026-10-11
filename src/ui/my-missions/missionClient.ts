import type { BuyMissionInput } from "../webmcp/BuyMissionPanel";
import type { BuyMissionView } from "../../webmcp/ui-bridge";

export type OwnerMission = {
  watchlist_id: string;
  name: string;
  active: boolean;
  market_code: "FR" | "GB" | "ES";
  currency: string;
  created_at: string;
  criteria: {
    query: string;
    notification_mode?: string;
    mission: Omit<BuyMissionView, "mission_id" | "status" | "query">;
  };
};

export function missionView(item: OwnerMission): BuyMissionView {
  return { ...item.criteria.mission, mission_id: item.watchlist_id, status: "ACTIVE", query: item.criteria.query };
}

export function missionStatus(item: OwnerMission) {
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
