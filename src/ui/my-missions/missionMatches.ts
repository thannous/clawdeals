import { z } from "zod";
import { SMARTPHONE_CHECK_IDS } from "../../lib/smartphone-passport";
import type { SmartphoneMissionEvaluation, SmartphoneMissionReason } from "../../lib/smartphone-mission";
import { MissionRequestError } from "./missionClient";

const reason = z.object({
  code: z.enum(["passport_missing", "model_matches", "model_mismatch", "model_unknown", "battery_meets_minimum", "battery_below_minimum", "battery_unknown", "check_ok", "check_issue", "check_unknown"]),
  check_id: z.enum(SMARTPHONE_CHECK_IDS).optional(), expected: z.union([z.string().max(120), z.number()]).optional(),
  actual: z.union([z.string().max(120), z.number()]).optional()
}).refine(value => {
  if (value.code.startsWith("check_")) return Boolean(value.check_id) && value.expected === "ok" && (value.code === "check_unknown" ? value.actual === undefined : value.actual === (value.code === "check_ok" ? "ok" : "issue"));
  if (value.check_id) return false;
  if (value.code === "passport_missing") return value.expected === undefined && value.actual === undefined;
  if (value.code.startsWith("model_")) return typeof value.expected === "string" && Boolean(value.expected.trim()) && (value.code === "model_unknown" ? value.actual === undefined : typeof value.actual === "string" && Boolean(value.actual.trim()));
  const percentage = (input: unknown) => typeof input === "number" && Number.isInteger(input) && input >= 0 && input <= 100;
  return percentage(value.expected) && (value.code === "battery_unknown" ? value.actual === undefined : percentage(value.actual));
});
const unknownCodes = new Set(["passport_missing", "model_unknown", "battery_unknown", "check_unknown"]);
const mismatchCodes = new Set(["model_mismatch", "battery_below_minimum", "check_issue"]);
const evaluation = z.object({ status: z.enum(["compatible", "unknown"]), reasons: z.array(reason).min(1).max(7) }).refine(value =>
  !value.reasons.some(reason => mismatchCodes.has(reason.code)) &&
  (value.status === "unknown") === value.reasons.some(reason => unknownCodes.has(reason.code))
);
const listing = z.object({
  listing_id: z.string().uuid(), title: z.string().min(1).max(1000), category: z.string(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"]),
  description: z.string().nullable().optional(), created_at: z.string().datetime({ offset: true }).optional(),
  price: z.object({ amount: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER), currency: z.string().regex(/^[A-Z]{3}$/) }),
  seller: z.object({ display_name: z.string().nullable().optional(), avatar_url: z.string().nullable().optional(), verified: z.boolean().optional() }).passthrough().nullable().optional()
}).passthrough();
const match = listing.extend({ smartphone_compatibility: evaluation.optional() });
const alert = z.object({
  listing_id: z.string().uuid(), matched_at: z.string().datetime({ offset: true }), listing,
  reason: z.object({ smartphone: evaluation, change: z.enum(["first_match", "price_changed", "passport_updated", "criteria_changed"]),
    previous_price: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), current_price: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(), passport_revision: z.number().int().positive().optional()
  })
}).refine(value => value.listing_id === value.listing.listing_id && value.reason.smartphone.status === "compatible");
const response = z.object({
  items: z.array(match).max(100), next_cursor: z.string().nullable(), status: z.enum(["ACTIVE", "EXPIRED", "PAUSED"]),
  alerts: z.array(alert).max(100).optional()
}).refine(value => new Set(value.items.map(item => item.listing_id)).size === value.items.length && new Set(value.alerts?.map(item => item.listing_id)).size === (value.alerts?.length || 0));
export type MissionMatches = z.infer<typeof response>;
export function confirmedMissionMatches(value: unknown): MissionMatches {
  const parsed = response.safeParse(value);
  if (!parsed.success) throw new MissionRequestError(502, "SERVER_CONTRACT_ERROR");
  return parsed.data;
}
export function confirmedSmartphoneMissionMatches(value: unknown): MissionMatches {
  const parsed = confirmedMissionMatches(value);
  if (parsed.items.some(item => !item.smartphone_compatibility) || !parsed.alerts) throw new MissionRequestError(502, "SERVER_CONTRACT_ERROR");
  return parsed;
}
export function splitSmartphoneReasons(evaluation: SmartphoneMissionEvaluation): { known: SmartphoneMissionReason[]; unknown: SmartphoneMissionReason[] } {
  return { known: evaluation.reasons.filter(reason => !unknownCodes.has(reason.code)), unknown: evaluation.reasons.filter(reason => unknownCodes.has(reason.code)) };
}
