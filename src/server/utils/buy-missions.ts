export const BUY_MISSION_AUTONOMOUS_ACTIONS = ["search", "ask_question", "make_offer"] as const;
export const BUY_MISSION_CONTACT_REVEAL = "manual_bilateral_approval" as const;

export type BuyMissionAutonomousAction = (typeof BUY_MISSION_AUTONOMOUS_ACTIONS)[number];

export type NormalizedBuyMission = {
  version: 1;
  kind: "BUY";
  preferred_price_max: number | null;
  hard_budget_max: number;
  currency: "EUR" | "GBP";
  requirements: string[];
  autonomous_actions: BuyMissionAutonomousAction[];
  contact_reveal: typeof BUY_MISSION_CONTACT_REVEAL;
  expires_at: string;
  location: {
    label: string | null;
    lat: number;
    lon: number;
    radius_km: number;
  };
};

function fail(message: string): never {
  throw new Error(`criteria.mission.${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMoney(value: unknown, field: string, { required }: { required: boolean }): number | null {
  if (value === undefined || value === null) {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000) {
    fail(`${field} must be a positive number`);
  }
  if (Math.round(value * 100) !== value * 100) {
    fail(`${field} must have at most two decimal places`);
  }
  return value;
}

function normalizeRequirements(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) {
    fail("requirements must be an array with at most 10 items");
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") fail("requirements items must be strings");
    const item = raw.trim();
    if (!item || item.length > 120) fail("requirements items must be 1..120 characters");
    const key = item.toLocaleLowerCase("en");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeActions(value: unknown): BuyMissionAutonomousAction[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail("autonomous_actions must be a non-empty array");
  }
  const allowed = new Set<string>(BUY_MISSION_AUTONOMOUS_ACTIONS);
  const actions = [...new Set(value.map((item) => String(item).trim()))];
  if (actions.some((action) => !allowed.has(action))) {
    fail(`autonomous_actions must only contain ${BUY_MISSION_AUTONOMOUS_ACTIONS.join(", ")}`);
  }
  if (!actions.includes("search")) fail("autonomous_actions must include search");
  return actions as BuyMissionAutonomousAction[];
}

function normalizeLocation(value: unknown): NormalizedBuyMission["location"] {
  if (!isRecord(value)) fail("location is required");
  const lat = value.lat;
  const lon = value.lon;
  const radiusKm = value.radius_km;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    fail("location.lat must be between -90 and 90");
  }
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    fail("location.lon must be between -180 and 180");
  }
  if (!Number.isInteger(radiusKm) || (radiusKm as number) < 1 || (radiusKm as number) > 300) {
    fail("location.radius_km must be an integer between 1 and 300");
  }

  let label: string | null = null;
  if (value.label !== undefined && value.label !== null) {
    if (typeof value.label !== "string") fail("location.label must be a string");
    const trimmed = value.label.trim();
    if (trimmed.length > 80) fail("location.label must be at most 80 characters");
    label = trimmed || null;
  }

  return { label, lat, lon, radius_km: radiusKm as number };
}

export function normalizeBuyMission(
  raw: unknown,
  { now = new Date() }: { now?: Date } = {}
): NormalizedBuyMission {
  if (!isRecord(raw)) fail("must be an object");
  if (raw.version !== undefined && raw.version !== 1) fail("version must be 1");
  if (raw.kind !== undefined && String(raw.kind).toUpperCase() !== "BUY") fail("kind must be BUY");

  const preferredPriceMax = normalizeMoney(raw.preferred_price_max, "preferred_price_max", {
    required: false
  });
  const hardBudgetMax = normalizeMoney(raw.hard_budget_max, "hard_budget_max", {
    required: true
  }) as number;
  if (preferredPriceMax !== null && preferredPriceMax > hardBudgetMax) {
    fail("preferred_price_max must not exceed hard_budget_max");
  }

  const currency = String(raw.currency || "").trim().toUpperCase();
  if (currency !== "EUR" && currency !== "GBP") fail("currency must be EUR or GBP");

  if (raw.contact_reveal !== BUY_MISSION_CONTACT_REVEAL) {
    fail(`contact_reveal must be ${BUY_MISSION_CONTACT_REVEAL}`);
  }

  if (typeof raw.expires_at !== "string" || !raw.expires_at.trim()) fail("expires_at is required");
  const expiresAt = new Date(raw.expires_at);
  if (!Number.isFinite(expiresAt.getTime())) fail("expires_at must be a valid ISO date");
  const nowMs = now.getTime();
  const maxMs = nowMs + 90 * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() <= nowMs) fail("expires_at must be in the future");
  if (expiresAt.getTime() > maxMs) fail("expires_at must be within 90 days");

  return {
    version: 1,
    kind: "BUY",
    preferred_price_max: preferredPriceMax,
    hard_budget_max: hardBudgetMax,
    currency,
    requirements: normalizeRequirements(raw.requirements),
    autonomous_actions: normalizeActions(raw.autonomous_actions),
    contact_reveal: BUY_MISSION_CONTACT_REVEAL,
    expires_at: expiresAt.toISOString(),
    location: normalizeLocation(raw.location)
  };
}
