import { z } from "zod";

export const PROJECT_SLOTS = ["desk", "chair", "monitor", "lamp", "keyboard"] as const;
export const REQUIRED_PROJECT_SLOTS = ["desk", "chair", "monitor"] as const;
export const PROJECT_CONNECTORS = ["HDMI", "DISPLAYPORT", "USB_C", "VGA"] as const;
export type ProjectSlot = (typeof PROJECT_SLOTS)[number];
export type ProjectConnector = (typeof PROJECT_CONNECTORS)[number];
export type ProjectVariant = "economy" | "comfort" | "weekend";

export interface ProjectBrief {
  version: 1;
  use_case: "home_office";
  description: string;
  budget_cents: number;
  market_code: "FR";
  currency: "EUR";
  location: { lat: number; lon: number; radius_km: number; label: string | null };
  desk_max_width_cm: number;
  desk_max_depth_cm: number;
  laptop_connector: ProjectConnector;
  /** Requested collection deadline for the collection configuration. */
  pickup_by: string;
  optional_slots: ("lamp" | "keyboard")[];
}

/** Facts explicitly entered by the buyer, never presented as seller verification. */
export interface ProjectFacts {
  provenance: "user_confirmed";
  confirmed_at: string;
  delivery_fee_cents: number | null;
  /** Price entered by the buyer after discussions; never an accepted offer. */
  quoted_price_cents?: number | null;
  desk_width_cm?: number | null;
  desk_depth_cm?: number | null;
  connectors?: ProjectConnector[];
  /** Required for USB-C: video operation with the intended computer and cable was checked by the buyer. */
  video_verified?: boolean;
  pickup_available_by?: string | null;
  comfort_score?: number;
}

export interface ProjectCandidate {
  listing_id: string;
  seller_agent_id: string;
  title: string;
  slot: ProjectSlot;
  price_cents: number;
  market_code: string;
  currency: string;
  status: string;
  updated_at: string;
  distance_km: number | null;
  delivery_method: "PICKUP" | "SHIPPING" | "BOTH" | null;
  facts: ProjectFacts | null;
}

export interface ProjectCheck {
  code: "fees" | "desk_dimensions" | "monitor_connector" | "pickup_date" | "delivery_method";
  status: "confirmed" | "unknown";
  listing_id: string;
  message: string;
}

export interface ProjectSellerGroup {
  seller_agent_id: string;
  listing_ids: string[];
  questions: string[];
  /** A non-binding draft. Sending still requires explicit owner confirmation. */
  draft_message: string;
  /** Server-computed redaction marker for the exact reviewed message. */
  redacted?: boolean;
}

export interface ProjectConfiguration {
  id: string;
  variant: ProjectVariant;
  items: ProjectCandidate[];
  total_known_cents: number;
  unknown_fee_count: number;
  remaining_cents: number;
  ready_to_approve: boolean;
  checks: ProjectCheck[];
  seller_groups: ProjectSellerGroup[];
}

export interface ProjectPlan {
  /** Exact canonical snapshot, not a short hash. Compare for equality on the server. */
  fingerprint: string;
  /** The requested collection day has passed in Europe/Paris. */
  pickup_expired: boolean;
  configurations: ProjectConfiguration[];
  alternatives: Record<ProjectSlot, ProjectCandidate[]>;
  missing_slots: ProjectSlot[];
  excluded: { listing_id: string; slot: ProjectSlot; reason: string }[];
  /** Live items excluded by editable buyer facts, retained only for correction. */
  corrections: ProjectCandidate[];
  search_limited: boolean;
}

export const projectDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Expected a real calendar date");
const cents = z.number().int().min(0).max(100_000_000);
const dimension = z.number().positive().max(1000);

export const projectBriefSchema: z.ZodType<ProjectBrief> = z.object({
  version: z.literal(1),
  use_case: z.literal("home_office"),
  description: z.string().trim().min(1).max(1000),
  budget_cents: cents.refine(value => value > 0, "Budget must be positive"),
  market_code: z.literal("FR"),
  currency: z.literal("EUR"),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    radius_km: z.number().int().min(1).max(300),
    label: z.string().trim().max(80).nullable()
  }).strict(),
  desk_max_width_cm: dimension,
  desk_max_depth_cm: dimension,
  laptop_connector: z.enum(PROJECT_CONNECTORS),
  pickup_by: projectDateSchema,
  optional_slots: z.array(z.enum(["lamp", "keyboard"])).max(2)
    .refine(slots => new Set(slots).size === slots.length, "Optional slots must be unique")
}).strict() as z.ZodType<ProjectBrief>;

export const projectFactsSchema: z.ZodType<ProjectFacts> = z.object({
  provenance: z.literal("user_confirmed"),
  confirmed_at: z.string().datetime({ offset: true }),
  delivery_fee_cents: cents.nullable(),
  quoted_price_cents: cents.nullable().optional(),
  desk_width_cm: dimension.nullable().optional(),
  desk_depth_cm: dimension.nullable().optional(),
  connectors: z.array(z.enum(PROJECT_CONNECTORS)).max(PROJECT_CONNECTORS.length)
    .refine(values => new Set(values).size === values.length, "Connectors must be unique").optional(),
  video_verified: z.boolean().optional(),
  pickup_available_by: projectDateSchema.nullable().optional(),
  comfort_score: z.number().int().min(0).max(5).optional()
}).strict() as z.ZodType<ProjectFacts>;

export const projectCandidateSchema: z.ZodType<ProjectCandidate> = z.object({
  listing_id: z.string().uuid(),
  seller_agent_id: z.string().uuid(),
  title: z.string().min(1).max(2000),
  slot: z.enum(PROJECT_SLOTS),
  price_cents: cents,
  market_code: z.string().max(10),
  currency: z.string().max(10),
  status: z.string().max(30),
  updated_at: z.string().datetime({ offset: true }),
  distance_km: z.number().min(0).max(50000).nullable(),
  delivery_method: z.enum(["PICKUP", "SHIPPING", "BOTH"]).nullable(),
  facts: projectFactsSchema.nullable()
}).strict() as z.ZodType<ProjectCandidate>;

export function requiredProjectSlots(brief: ProjectBrief): ProjectSlot[] {
  return [...REQUIRED_PROJECT_SLOTS, ...PROJECT_SLOTS.filter(slot => brief.optional_slots.includes(slot as "lamp" | "keyboard"))];
}
