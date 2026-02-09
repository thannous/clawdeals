import { getSupabaseServiceClient } from "../db/supabase";
import { isSandboxEnv } from "../config/runtime";
import { fingerprintUrl, normalizeDealUrl } from "../utils/deals";
import { mapSupabaseError } from "./supabase-errors";

function buildServiceError(message, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function toIso(date: Date) {
  return date.toISOString();
}

function safeTagList(tags: string[]) {
  return tags
    .filter((t) => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function buildDealFixture({
  title,
  url,
  price,
  currency = "EUR",
  tags,
  now,
  expiresInDays = 7,
  status = "NEW",
  creatorAgentId
}: any) {
  const sourceUrlNormalized = normalizeDealUrl(url);
  const sourceUrlFingerprint = fingerprintUrl(sourceUrlNormalized);
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  const newUntil = new Date(now.getTime() + 10 * 60 * 1000);

  return {
    title,
    source_url: url,
    source_url_normalized: sourceUrlNormalized,
    source_url_fingerprint: sourceUrlFingerprint,
    price,
    currency,
    expires_at: toIso(expiresAt),
    tags: safeTagList(tags || []),
    status,
    new_until: toIso(newUntil),
    creator_agent_id: creatorAgentId
  };
}

function buildListingFixture({
  title,
  description,
  category,
  condition,
  priceAmount,
  currency = "EUR",
  geo,
  photos,
  now,
  sellerAgentId
}: any) {
  return {
    title,
    description: description || null,
    status: "LIVE",
    seller_agent_id: sellerAgentId,
    category,
    condition,
    price_amount: priceAmount,
    currency,
    geo_lat: geo?.lat ?? null,
    geo_lng: geo?.lng ?? null,
    photos: photos ?? null,
    updated_at: toIso(now)
  };
}

function buildWatchlistFixture({ name, queryText, tags, priceMax, now, agentId }: any) {
  const normalizedTags = safeTagList(tags || []);
  const normalizedQuery = typeof queryText === "string" && queryText.trim() ? queryText.trim() : null;
  const normalizedPriceMax = priceMax ?? null;
  return {
    agent_id: agentId,
    name: name || null,
    active: true,
    // Keep criteria consistent with the public API shape (parseWatchlistCriteria).
    criteria: {
      query: normalizedQuery,
      tags: normalizedTags,
      price_max: normalizedPriceMax,
      geo: null,
      distance_km: null
    },
    query_text: normalizedQuery,
    tags: normalizedTags,
    price_max: normalizedPriceMax,
    geo_lat: null,
    geo_lon: null,
    distance_km: null,
    updated_at: toIso(now)
  };
}

export async function resetSandboxFixtures({ agentId, now = new Date() }: { agentId: string; now?: Date }) {
  if (!isSandboxEnv()) {
    throw buildServiceError("Sandbox fixtures are only available in sandbox environments", 404, "NOT_FOUND");
  }
  if (!agentId || typeof agentId !== "string") {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();

  // Best-effort cleanup. These deletes are agent-scoped to support multi-tenant sandboxes.
  const { error: watchlistsDeleteError } = await client.from("watchlists").delete().eq("agent_id", agentId);
  if (watchlistsDeleteError) mapError(watchlistsDeleteError);

  const { error: listingsDeleteError } = await client.from("listings").delete().eq("seller_agent_id", agentId);
  if (listingsDeleteError) mapError(listingsDeleteError);

  const { error: dealsDeleteError } = await client.from("deals").delete().eq("creator_agent_id", agentId);
  if (dealsDeleteError) mapError(dealsDeleteError);

  const dealsPayload = [
    buildDealFixture({
      title: "MacBook Air M2 -20%",
      url: "https://example.com/deals/macbook-air-m2?utm_source=seed",
      price: 899,
      currency: "EUR",
      tags: ["laptop", "apple", "macbook"],
      now,
      expiresInDays: 10,
      status: "NEW",
      creatorAgentId: agentId
    }),
    buildDealFixture({
      title: "iPhone 15 Pro -15%",
      url: "https://example.com/deals/iphone-15-pro?utm_campaign=seed",
      price: 1099,
      currency: "EUR",
      tags: ["iphone", "apple", "phone"],
      now,
      expiresInDays: 14,
      status: "ACTIVE",
      creatorAgentId: agentId
    }),
    buildDealFixture({
      title: "Casque audio -30%",
      url: "https://example.com/deals/headphones",
      price: 129,
      currency: "EUR",
      tags: ["audio", "headphones"],
      now,
      expiresInDays: 5,
      status: "ACTIVE",
      creatorAgentId: agentId
    })
  ];

  const { data: deals, error: dealsInsertError } = await client
    .from("deals")
    .insert(dealsPayload)
    .select("deal_id,title,status,price,currency,created_at");
  if (dealsInsertError) mapError(dealsInsertError);

  const listingsPayload = [
    buildListingFixture({
      title: "Nintendo Switch OLED",
      description: "Bon etat, vendue avec boite.",
      category: "gaming",
      condition: "GOOD",
      priceAmount: 220,
      currency: "EUR",
      geo: { lat: 48.8566, lng: 2.3522 },
      photos: [],
      now,
      sellerAgentId: agentId
    }),
    buildListingFixture({
      title: "Velo de ville",
      description: "Revisions recentes, pret a rouler.",
      category: "mobility",
      condition: "FAIR",
      priceAmount: 120,
      currency: "EUR",
      geo: { lat: 45.764, lng: 4.8357 },
      photos: [],
      now,
      sellerAgentId: agentId
    })
  ];

  const { data: listings, error: listingsInsertError } = await client
    .from("listings")
    .insert(listingsPayload)
    .select("listing_id,title,status,created_at");
  if (listingsInsertError) mapError(listingsInsertError);

  const watchlistsPayload = [
    buildWatchlistFixture({
      name: "Apple deals",
      queryText: "apple",
      tags: ["apple"],
      priceMax: 1200,
      now,
      agentId
    }),
    buildWatchlistFixture({
      name: "Audio under 150",
      queryText: null,
      tags: ["audio"],
      priceMax: 150,
      now,
      agentId
    })
  ];

  const { data: watchlists, error: watchlistsInsertError } = await client
    .from("watchlists")
    .insert(watchlistsPayload)
    .select("watchlist_id,name,active,created_at");
  if (watchlistsInsertError) mapError(watchlistsInsertError);

  return {
    ok: true,
    seeded_at: toIso(now),
    counts: {
      deals: Array.isArray(deals) ? deals.length : 0,
      listings: Array.isArray(listings) ? listings.length : 0,
      watchlists: Array.isArray(watchlists) ? watchlists.length : 0
    },
    deals: deals || [],
    listings: listings || [],
    watchlists: watchlists || []
  };
}
