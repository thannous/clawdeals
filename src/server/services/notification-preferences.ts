import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { ensureOwnerExists } from "./owners";

export const NOTIFICATION_EVENT_TYPES = [
  "watchlist_match",
  "offer_received",
  "approval_required",
  "transaction_updates"
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_MODES = ["REALTIME", "DIGEST_HOURLY", "DIGEST_DAILY", "SILENT"] as const;
export type NotificationMode = (typeof NOTIFICATION_MODES)[number];

function buildServiceError(message: string, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isPlainObject(value: any) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateTimeZone(value: any): string {
  const tz = typeof value === "string" ? value.trim() : "";
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    throw buildServiceError("Invalid timezone", 400, "VALIDATION_ERROR");
  }
}

function clampInt(value: any, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < min || i > max) return null;
  return i;
}

function normalizeMode(value: any): NotificationMode {
  const raw = typeof value === "string" ? value.trim().toUpperCase() : "";
  if ((NOTIFICATION_MODES as readonly string[]).includes(raw)) return raw as NotificationMode;
  throw buildServiceError("Invalid notification mode", 400, "VALIDATION_ERROR");
}

function normalizeEventTypes(value: any): NotificationEventType[] {
  const arr = Array.isArray(value) ? value : [];
  const normalized = arr
    .filter((v) => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set(NOTIFICATION_EVENT_TYPES);
  const filtered = normalized.filter((t) => allowed.has(t as any)) as NotificationEventType[];
  return Array.from(new Set(filtered));
}

function normalizeFilters(value: any) {
  if (!isPlainObject(value)) return {};
  const strong = isPlainObject((value as any).strong) ? (value as any).strong : {};
  const maxPriceEur = (strong as any).max_price_eur;
  const minTrust = (strong as any).min_seller_trust_score;
  const normalizedStrong: any = {};
  if (maxPriceEur === null) normalizedStrong.max_price_eur = null;
  else if (maxPriceEur !== undefined) {
    const n = Number(maxPriceEur);
    if (!Number.isFinite(n) || n < 0) {
      throw buildServiceError("filters.strong.max_price_eur must be a non-negative number", 400, "VALIDATION_ERROR");
    }
    normalizedStrong.max_price_eur = n;
  }
  if (minTrust === null) normalizedStrong.min_seller_trust_score = null;
  else if (minTrust !== undefined) {
    const n = clampInt(minTrust, 0, 100);
    if (n === null) {
      throw buildServiceError("filters.strong.min_seller_trust_score must be an int 0..100", 400, "VALIDATION_ERROR");
    }
    normalizedStrong.min_seller_trust_score = n;
  }

  return Object.keys(normalizedStrong).length ? { strong: normalizedStrong } : {};
}

export async function getNotificationPreferences(ownerId: string) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("notification_preferences").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

export async function getOrCreateNotificationPreferences({
  ownerId,
  channelIdentityId,
  now = new Date()
}: {
  ownerId: string;
  channelIdentityId?: string | null;
  now?: Date;
}) {
  const existing = await getNotificationPreferences(ownerId);
  if (existing) return existing;

  await ensureOwnerExists(ownerId);
  const client = getSupabaseServiceClient();
  const payload: any = {
    owner_id: ownerId,
    channel_type: "telegram",
    channel_identity_id: channelIdentityId ?? null,
    updated_at: now.toISOString()
  };

  const { data, error } = await client.from("notification_preferences").insert(payload).select("*").single();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data;
}

export async function updateNotificationPreferences({
  ownerId,
  patch,
  now = new Date()
}: {
  ownerId: string;
  patch: any;
  now?: Date;
}) {
  if (!ownerId) throw buildServiceError("ownerId is required", 400, "VALIDATION_ERROR");
  if (!patch || typeof patch !== "object") throw buildServiceError("patch is required", 400, "VALIDATION_ERROR");

  const updates: any = { updated_at: now.toISOString() };

  if ("channel_identity_id" in patch) {
    const v = (patch as any).channel_identity_id;
    updates.channel_identity_id = v ? String(v) : null;
  }

  if ("mode" in patch) {
    updates.mode = normalizeMode((patch as any).mode);
  }

  if ("timezone" in patch) {
    updates.timezone = validateTimeZone((patch as any).timezone);
  }

  if ("quiet_enabled" in patch) {
    updates.quiet_enabled = Boolean((patch as any).quiet_enabled);
  }

  if ("quiet_start_min" in patch) {
    const v = (patch as any).quiet_start_min;
    updates.quiet_start_min = v === null ? null : clampInt(v, 0, 1439);
    if (v !== null && updates.quiet_start_min == null) {
      throw buildServiceError("quiet_start_min must be an int 0..1439 or null", 400, "VALIDATION_ERROR");
    }
  }

  if ("quiet_end_min" in patch) {
    const v = (patch as any).quiet_end_min;
    updates.quiet_end_min = v === null ? null : clampInt(v, 0, 1439);
    if (v !== null && updates.quiet_end_min == null) {
      throw buildServiceError("quiet_end_min must be an int 0..1439 or null", 400, "VALIDATION_ERROR");
    }
  }

  if ("daily_digest_hour" in patch) {
    const v = clampInt((patch as any).daily_digest_hour, 0, 23);
    if (v == null) throw buildServiceError("daily_digest_hour must be an int 0..23", 400, "VALIDATION_ERROR");
    updates.daily_digest_hour = v;
  }

  if ("event_types" in patch) {
    updates.event_types = normalizeEventTypes((patch as any).event_types);
  }

  if ("filters" in patch) {
    updates.filters = normalizeFilters((patch as any).filters);
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("notification_preferences")
    .update(updates)
    .eq("owner_id", ownerId)
    .select("*")
    .maybeSingle();

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  if (!data) {
    throw buildServiceError("Notification preferences not found", 404, "NOT_FOUND");
  }

  return data;
}

