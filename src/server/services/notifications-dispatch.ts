import { getSupabaseServiceClient } from "../db/supabase";
import { safeAuditLog } from "../audit/singleton";
import { isQuietNow, getLocalMinuteOfDay } from "../utils/quiet-hours";
import { mapSupabaseError } from "./supabase-errors";
import { sendTelegramMessage } from "../channels/telegram/client";
import { getNotificationPreferences, NOTIFICATION_EVENT_TYPES } from "./notification-preferences";

const DEFAULT_MAX_ITEMS_PER_DIGEST = 10;
const DEFAULT_MAX_ITEMS_PER_OWNER = 50;
const DEFAULT_LIMIT_OWNERS = 200;

function buildServiceError(message: string, status = 500, code = "ERROR") {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function toPositiveInt(value: any, fallback: number) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function resolveAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.SITE_URL ||
    "https://app.clawdeals.com"
  );
}

function joinUrl(base: string, path: string) {
  const b = String(base || "").replace(/\/+$/, "");
  const p = String(path || "").replace(/^\/+/, "");
  return `${b}/${p}`;
}

function resolveTimeZone(value: any) {
  const tz = typeof value === "string" ? value.trim() : "";
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

function getLocalDateKey({ now, timezone }: { now: Date; timezone: string }) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

function isSameLocalHour({ a, b, timezone }: { a: Date; b: Date; timezone: string }) {
  const ah = Math.floor(getLocalMinuteOfDay({ now: a, timezone }) / 60);
  const bh = Math.floor(getLocalMinuteOfDay({ now: b, timezone }) / 60);
  return getLocalDateKey({ now: a, timezone }) === getLocalDateKey({ now: b, timezone }) && ah === bh;
}

function isSameLocalDate({ a, b, timezone }: { a: Date; b: Date; timezone: string }) {
  return getLocalDateKey({ now: a, timezone }) === getLocalDateKey({ now: b, timezone });
}

function normalizeEventTypes(value: any) {
  const allowed = new Set(NOTIFICATION_EVENT_TYPES);
  const arr = Array.isArray(value) ? value : [];
  const normalized = arr
    .filter((v) => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .filter((t) => allowed.has(t as any));
  return Array.from(new Set(normalized));
}

function getStrongFilters(filters: any) {
  const strong = filters && typeof filters === "object" && !Array.isArray(filters) ? (filters as any).strong : null;
  const maxPriceEur = strong && typeof strong === "object" ? (strong as any).max_price_eur : null;
  const minTrust = strong && typeof strong === "object" ? (strong as any).min_seller_trust_score : null;
  const hasMaxPrice = typeof maxPriceEur === "number" && Number.isFinite(maxPriceEur) && maxPriceEur >= 0;
  const hasMinTrust = Number.isInteger(minTrust) && minTrust >= 0 && minTrust <= 100;
  return {
    enabled: hasMaxPrice || hasMinTrust,
    maxPriceEur: hasMaxPrice ? maxPriceEur : null,
    minSellerTrustScore: hasMinTrust ? minTrust : null
  };
}

async function auditEvent({
  name,
  ownerId,
  payload,
  now,
  outcome = "SUCCESS"
}: {
  name: string;
  ownerId: string | null;
  payload: any;
  now: Date;
  outcome?: string;
}) {
  await safeAuditLog({
    occurredAt: now.toISOString(),
    actor: { type: "system", id: "notifications-dispatch" },
    auth: { owner_id: ownerId || null },
    request: { id: null, ip: null, userAgent: null, method: "CRON", path: "/api/internal/cron/notifications-dispatch", query: null },
    action: { route_group: "internal.cron.notifications-dispatch", method: "CRON", path: "/api/internal/cron/notifications-dispatch", event: name },
    security: {},
    policy: {},
    payload: payload || {},
    rateLimit: null,
    idempotency: null,
    outcome
  });
}

async function findActiveTelegramIdentity({ client, ownerId }: { client: any; ownerId: string }) {
  const { data, error } = await client
    .from("channel_identities")
    .select("channel_identity_id,channel_context_id")
    .eq("owner_id", ownerId)
    .eq("channel_type", "telegram")
    .eq("state", "ACTIVE")
    .order("approved_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return data || null;
}

async function updateOutboxRows({
  client,
  outboxIds,
  patch
}: {
  client: any;
  outboxIds: string[];
  patch: any;
}) {
  const ids = Array.isArray(outboxIds) ? outboxIds.filter(Boolean) : [];
  if (ids.length === 0) return { ok: true, updated: 0 };

  const uniqueIds = Array.from(new Set(ids));
  const { error } = await client.from("notification_outbox").update(patch).in("notification_outbox_id", uniqueIds);
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return { ok: true, updated: uniqueIds.length };
}

async function incrementOutboxAttempts({
  client,
  outboxIds,
  lastError
}: {
  client: any;
  outboxIds: string[];
  lastError: string | null;
}) {
  const ids = Array.isArray(outboxIds) ? outboxIds.filter(Boolean) : [];
  if (ids.length === 0) return { ok: true, updated: 0 };

  const uniqueIds = Array.from(new Set(ids));
  const { data, error } = await client.rpc("notification_outbox_increment_attempts_v1", {
    p_outbox_ids: uniqueIds,
    p_last_error: lastError
  });
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  return { ok: true, updated: typeof data === "number" ? data : uniqueIds.length };
}

async function updatePreferencesTimestamps({
  client,
  ownerId,
  patch
}: {
  client: any;
  ownerId: string;
  patch: any;
}) {
  // Use upsert so digest gating keeps working even if the owner doesn't yet have a row.
  const payload = { owner_id: ownerId, ...(patch || {}) };
  const { error } = await client
    .from("notification_preferences")
    .upsert(payload, { onConflict: "owner_id" });
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
}

async function fetchDealsById({ client, ids }: { client: any; ids: string[] }) {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await client.from("deals").select("deal_id,title,price,currency").in("deal_id", unique);
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  const map = new Map<string, any>();
  for (const row of Array.isArray(data) ? data : []) {
    if (row?.deal_id) map.set(row.deal_id, row);
  }
  return map;
}

async function fetchListingsById({ client, ids }: { client: any; ids: string[] }) {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await client
    .from("listings")
    .select("listing_id,title,price_amount,currency,seller_agent_id")
    .in("listing_id", unique);
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  const map = new Map<string, any>();
  for (const row of Array.isArray(data) ? data : []) {
    if (row?.listing_id) map.set(row.listing_id, row);
  }
  return map;
}

async function fetchAgentsById({ client, ids }: { client: any; ids: string[] }) {
  const unique = Array.from(new Set((ids || []).filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await client.from("agents").select("id,trust_score").in("id", unique);
  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }
  const map = new Map<string, any>();
  for (const row of Array.isArray(data) ? data : []) {
    if (row?.id) map.set(row.id, row);
  }
  return map;
}

function formatPriceEur({ price, currency }: { price: any; currency: any }) {
  const c = typeof currency === "string" ? currency.trim().toUpperCase() : "";
  if (c !== "EUR") return null;
  const n = Number(price);
  if (!Number.isFinite(n)) return null;
  return n;
}

function matchesStrongFilter({
  item,
  deal,
  listing,
  seller,
  strong
}: {
  item: any;
  deal: any | null;
  listing: any | null;
  seller: any | null;
  strong: { enabled: boolean; maxPriceEur: number | null; minSellerTrustScore: number | null };
}) {
  if (!strong.enabled) return true;

  const maxPriceEur = strong.maxPriceEur;
  const minTrust = strong.minSellerTrustScore;

  let priceOk = false;
  if (maxPriceEur != null) {
    if (item.entity_type === "deal" && deal) {
      const eur = formatPriceEur({ price: deal.price, currency: deal.currency });
      if (eur != null && eur <= maxPriceEur) priceOk = true;
    } else if (item.entity_type === "listing" && listing) {
      const eur = formatPriceEur({ price: listing.price_amount, currency: listing.currency });
      if (eur != null && eur <= maxPriceEur) priceOk = true;
    }
  }

  let trustOk = false;
  if (minTrust != null && item.entity_type === "listing" && seller) {
    const trust = Number.isFinite(Number(seller.trust_score)) ? Number(seller.trust_score) : 0;
    if (trust >= minTrust) trustOk = true;
  }

  return priceOk || trustOk;
}

function buildDigestMessage({
  items,
  dealsById,
  listingsById
}: {
  items: any[];
  dealsById: Map<string, any>;
  listingsById: Map<string, any>;
}) {
  const base = resolveAppBaseUrl();
  const lines = ["Digest: watchlist matches", ""];
  const keyboard: any[] = [];

  for (const item of items) {
    if (item.entity_type === "deal") {
      const deal = dealsById.get(item.entity_id) || null;
      const title = deal?.title ? String(deal.title).slice(0, 80) : item.entity_id;
      const price = deal ? `${deal.price} ${deal.currency}` : "";
      lines.push(`- Deal: ${title}${price ? ` (${price})` : ""}`);
      keyboard.push([{ text: "Voir", url: joinUrl(base, `/deals/${item.entity_id}`) }]);
    } else if (item.entity_type === "listing") {
      const listing = listingsById.get(item.entity_id) || null;
      const title = listing?.title ? String(listing.title).slice(0, 80) : item.entity_id;
      const price = listing ? `${listing.price_amount} ${listing.currency}` : "";
      lines.push(`- Listing: ${title}${price ? ` (${price})` : ""}`);
      keyboard.push([{ text: "Voir", url: joinUrl(base, `/console/listings/${item.entity_id}`) }]);
    }
  }

  return {
    text: lines.join("\n").slice(0, 3500),
    replyMarkup: { inline_keyboard: keyboard }
  };
}

export async function runNotificationsDispatch({
  now = new Date(),
  limitOwners = DEFAULT_LIMIT_OWNERS,
  maxItemsPerOwner = DEFAULT_MAX_ITEMS_PER_OWNER,
  maxItemsPerDigest = DEFAULT_MAX_ITEMS_PER_DIGEST,
  dryRun = false,
  client,
  sendTelegram = sendTelegramMessage
}: any = {}) {
  const supabase = client || getSupabaseServiceClient();

  const cappedOwners = Math.max(1, Math.min(1000, toPositiveInt(limitOwners, DEFAULT_LIMIT_OWNERS)));
  const cappedPerOwner = Math.max(1, Math.min(500, toPositiveInt(maxItemsPerOwner, DEFAULT_MAX_ITEMS_PER_OWNER)));
  const cappedPerDigest = Math.max(1, Math.min(50, toPositiveInt(maxItemsPerDigest, DEFAULT_MAX_ITEMS_PER_DIGEST)));

  const fetchLimit = Math.min(20000, cappedOwners * cappedPerOwner * 2);
  const { data, error } = await supabase
    .from("notification_outbox")
    .select("notification_outbox_id,owner_id,channel_type,event_type,entity_type,entity_id,payload,occurred_at,status,attempt_count")
    .eq("status", "PENDING")
    .order("occurred_at", { ascending: true })
    .order("notification_outbox_id", { ascending: true })
    .limit(fetchLimit);

  if (error) {
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  const rows = Array.isArray(data) ? data : [];
  if (rows.length === 0) {
    return { ok: true, owners_processed: 0, sent: 0, skipped: 0, delivered: 0, suppressed: 0 };
  }

  const byOwner = new Map<string, any[]>();
  for (const row of rows) {
    const ownerId = row?.owner_id;
    if (!ownerId) continue;
    const list = byOwner.get(ownerId) || [];
    if (list.length >= cappedPerOwner) continue;
    list.push(row);
    byOwner.set(ownerId, list);
    if (byOwner.size >= cappedOwners) break;
  }

  let ownersProcessed = 0;
  let sent = 0;
  let skipped = 0;
  let delivered = 0;
  let suppressed = 0;

  for (const [ownerId, ownerRows] of byOwner.entries()) {
    ownersProcessed += 1;

    const prefs = (await getNotificationPreferences(ownerId)) || {
      owner_id: ownerId,
      channel_type: "telegram",
      mode: "DIGEST_HOURLY",
      timezone: "UTC",
      quiet_enabled: false,
      quiet_start_min: null,
      quiet_end_min: null,
      event_types: ["watchlist_match"],
      filters: {},
      daily_digest_hour: 9,
      last_hourly_digest_at: null,
      last_daily_digest_at: null
    };

    const tz = resolveTimeZone(prefs.timezone);
    const eventTypes = normalizeEventTypes(prefs.event_types);
    const mode = typeof prefs.mode === "string" ? String(prefs.mode).toUpperCase() : "DIGEST_HOURLY";

    if (mode === "SILENT") {
      await auditEvent({ name: "notifications.skipped", ownerId, payload: { reason: "disabled", mode }, now, outcome: "BLOCKED" });
      await updateOutboxRows({
        client: supabase,
        outboxIds: ownerRows.map((r) => r.notification_outbox_id),
        patch: { status: "SUPPRESSED", delivered_at: now.toISOString(), last_error: "disabled" }
      });
      suppressed += ownerRows.length;
      skipped += 1;
      continue;
    }

    const identity = await findActiveTelegramIdentity({ client: supabase, ownerId });
    const chatId = identity?.channel_context_id ? String(identity.channel_context_id) : null;
    if (!chatId) {
      await auditEvent({ name: "notifications.skipped", ownerId, payload: { reason: "missing_channel", mode }, now, outcome: "BLOCKED" });
      await incrementOutboxAttempts({
        client: supabase,
        outboxIds: ownerRows.map((r) => r.notification_outbox_id),
        lastError: "missing_channel"
      });
      skipped += 1;
      continue;
    }

    const quiet = isQuietNow({
      now,
      timezone: tz,
      quietEnabled: Boolean(prefs.quiet_enabled),
      startMin: prefs.quiet_start_min ?? null,
      endMin: prefs.quiet_end_min ?? null
    });
    if (quiet) {
      await auditEvent({ name: "notifications.skipped", ownerId, payload: { reason: "quiet_hours", mode }, now, outcome: "BLOCKED" });
      skipped += 1;
      continue;
    }

    const strong = getStrongFilters(prefs.filters);

    const dealIds = ownerRows.filter((r) => r.entity_type === "deal").map((r) => r.entity_id);
    const listingIds = ownerRows.filter((r) => r.entity_type === "listing").map((r) => r.entity_id);
    const [dealsById, listingsById] = await Promise.all([
      fetchDealsById({ client: supabase, ids: dealIds }),
      fetchListingsById({ client: supabase, ids: listingIds })
    ]);
    const sellerAgentIds = Array.from(listingsById.values())
      .map((l) => l?.seller_agent_id)
      .filter(Boolean);
    const sellersById = await fetchAgentsById({ client: supabase, ids: sellerAgentIds });

    const eligible = ownerRows.filter((r) => eventTypes.includes(String(r.event_type || "").toLowerCase()));
    const strongEligible: any[] = [];
    const suppressedByFilter: any[] = [];

    for (const item of eligible) {
      const deal = item.entity_type === "deal" ? dealsById.get(item.entity_id) || null : null;
      const listing = item.entity_type === "listing" ? listingsById.get(item.entity_id) || null : null;
      const seller = listing?.seller_agent_id ? sellersById.get(listing.seller_agent_id) || null : null;
      if (matchesStrongFilter({ item, deal, listing, seller, strong })) {
        strongEligible.push(item);
      } else if (strong.enabled) {
        suppressedByFilter.push(item);
      } else {
        strongEligible.push(item);
      }
    }

    if (suppressedByFilter.length > 0) {
      await updateOutboxRows({
        client: supabase,
        outboxIds: suppressedByFilter.map((r) => r.notification_outbox_id),
        patch: { status: "SUPPRESSED", delivered_at: now.toISOString(), last_error: "suppressed_filter" }
      });
      suppressed += suppressedByFilter.length;
    }

    if (strongEligible.length === 0) continue;

    if (mode === "REALTIME") {
      let ownerDelivered = 0;
      for (const item of strongEligible.slice(0, cappedPerOwner)) {
        const msg = buildDigestMessage({ items: [item], dealsById, listingsById });
        const ok = dryRun ? { ok: true } : await sendTelegram({ chatId, text: msg.text, replyMarkup: msg.replyMarkup });
        if (!ok?.ok) {
          await auditEvent({
            name: "notifications.skipped",
            ownerId,
            payload: { reason: "send_failed", status: ok?.status || null },
            now,
            outcome: "FAILURE"
          });
          await incrementOutboxAttempts({
            client: supabase,
            outboxIds: [item.notification_outbox_id],
            lastError: ok?.error || "send_failed"
          });
          skipped += 1;
          continue;
        }

        await updateOutboxRows({
          client: supabase,
          outboxIds: [item.notification_outbox_id],
          patch: { status: "DELIVERED", delivered_at: now.toISOString(), last_error: null }
        });

        delivered += 1;
        ownerDelivered += 1;
        sent += 1;
      }

      await auditEvent({
        name: "notifications.sent",
        ownerId,
        payload: { event_type: "watchlist_match", count: ownerDelivered, dry_run: Boolean(dryRun), mode },
        now
      });
      continue;
    }

    if (mode === "DIGEST_HOURLY") {
      const last = prefs.last_hourly_digest_at ? new Date(prefs.last_hourly_digest_at) : null;
      if (last && Number.isFinite(last.getTime()) && isSameLocalHour({ a: last, b: now, timezone: tz })) {
        continue;
      }
    } else if (mode === "DIGEST_DAILY") {
      const last = prefs.last_daily_digest_at ? new Date(prefs.last_daily_digest_at) : null;
      if (last && Number.isFinite(last.getTime()) && isSameLocalDate({ a: last, b: now, timezone: tz })) {
        continue;
      }
      const localHour = Math.floor(getLocalMinuteOfDay({ now, timezone: tz }) / 60);
      const digestHour = Number.isInteger(prefs.daily_digest_hour) ? prefs.daily_digest_hour : 9;
      if (localHour < digestHour) continue;
    } else {
      throw buildServiceError(`Invalid notification mode: ${mode}`, 500, "INVALID_MODE");
    }

    const digestItems = strongEligible.slice(0, cappedPerDigest);
    const msg = buildDigestMessage({ items: digestItems, dealsById, listingsById });
    const ok = dryRun ? { ok: true } : await sendTelegram({ chatId, text: msg.text, replyMarkup: msg.replyMarkup });

    if (!ok?.ok) {
      await auditEvent({
        name: "notifications.skipped",
        ownerId,
        payload: { reason: "send_failed", status: ok?.status || null },
        now,
        outcome: "FAILURE"
      });
      await incrementOutboxAttempts({
        client: supabase,
        outboxIds: digestItems.map((r) => r.notification_outbox_id),
        lastError: ok?.error || "send_failed"
      });
      skipped += 1;
      continue;
    }

    await updateOutboxRows({
      client: supabase,
      outboxIds: digestItems.map((r) => r.notification_outbox_id),
      patch: { status: "DELIVERED", delivered_at: now.toISOString(), last_error: null }
    });
    delivered += digestItems.length;
    sent += 1;

    if (mode === "DIGEST_HOURLY") {
      await updatePreferencesTimestamps({ client: supabase, ownerId, patch: { last_hourly_digest_at: now.toISOString(), updated_at: now.toISOString() } });
    } else if (mode === "DIGEST_DAILY") {
      await updatePreferencesTimestamps({ client: supabase, ownerId, patch: { last_daily_digest_at: now.toISOString(), updated_at: now.toISOString() } });
    }

    await auditEvent({
      name: "notifications.sent",
      ownerId,
      payload: { event_type: "watchlist_match", count: digestItems.length, dry_run: Boolean(dryRun), mode },
      now
    });
  }

  return { ok: true, owners_processed: ownersProcessed, sent, skipped, delivered, suppressed };
}
