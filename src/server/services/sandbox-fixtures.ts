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

function withoutTrustFlag(flags: any, flag: string) {
  const list = Array.isArray(flags) ? flags : [];
  return list.filter((entry) => typeof entry === "string" && entry !== flag);
}

function buildDealFixture({
  title,
  url,
  price,
  currency = "EUR",
  tags,
  images,
  coverImageIndex,
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
    images: Array.isArray(images) ? images : null,
    cover_image_index: Number.isInteger(coverImageIndex) ? coverImageIndex : null,
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
  coverImageIndex,
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
    cover_image_index: Number.isInteger(coverImageIndex) ? coverImageIndex : null,
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
  const nowIso = toIso(now);

  // Sandbox determinism: a fresh agent is quarantined for ~7 days, which blocks
  // publish=true listing flows and can force approvals for offers/threads. Age
  // the authenticated agent so sample flows work immediately after reset.
  const agedCreatedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const { data: agentRow, error: agentFetchError } = await client
    .from("agents")
    .select("trust_flags")
    .eq("id", agentId)
    .maybeSingle();
  if (agentFetchError) mapError(agentFetchError);

  const updatedTrustFlags = withoutTrustFlag(agentRow?.trust_flags, "quarantined");
  const { error: agentUpdateError } = await client
    .from("agents")
    .update({
      created_at: agedCreatedAt,
      trust_flags: updatedTrustFlags,
      trust_updated_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", agentId);
  if (agentUpdateError) mapError(agentUpdateError);

  // Best-effort cleanup. These deletes are agent-scoped to support multi-tenant sandboxes.
  const { error: watchlistsDeleteError } = await client.from("watchlists").delete().eq("agent_id", agentId);
  if (watchlistsDeleteError) mapError(watchlistsDeleteError);

  const { error: listingsDeleteError } = await client.from("listings").delete().eq("seller_agent_id", agentId);
  if (listingsDeleteError) mapError(listingsDeleteError);

  const { error: dealsDeleteError } = await client.from("deals").delete().eq("creator_agent_id", agentId);
  if (dealsDeleteError) mapError(dealsDeleteError);

  const dealsPayload = [
    buildDealFixture({
      title: "ThinkPad X1 Carbon reconditionne -22%",
      url: "https://www.backmarket.fr/fr-fr/p/lenovo-thinkpad-x1-carbon-sandbox-seed",
      price: 1299,
      currency: "EUR",
      tags: ["laptop", "dev", "thinkpad", "refurb"],
      images: [
        {
          storage_key: "https://picsum.photos/seed/clawdeals-thinkpad-1/1280/960",
          mime: "image/jpeg",
          w: 1280,
          h: 960
        },
        {
          storage_key: "https://picsum.photos/seed/clawdeals-thinkpad-2/1280/960",
          mime: "image/jpeg",
          w: 1280,
          h: 960
        }
      ],
      coverImageIndex: 0,
      now,
      expiresInDays: 4,
      status: "NEW",
      creatorAgentId: agentId
    }),
    buildDealFixture({
      title: "RTX 4070 SUPER bundle gaming",
      url: "https://www.materiel.net/produit/202402010001.html?utm_campaign=sandbox_seed",
      price: 649,
      currency: "EUR",
      tags: ["gpu", "gaming", "nvidia", "pc"],
      images: [
        {
          storage_key: "https://picsum.photos/seed/clawdeals-rtx-1/1280/960",
          mime: "image/jpeg",
          w: 1280,
          h: 960
        },
        {
          storage_key: "https://picsum.photos/seed/clawdeals-rtx-2/1280/960",
          mime: "image/jpeg",
          w: 1280,
          h: 960
        }
      ],
      coverImageIndex: 1,
      now,
      expiresInDays: 8,
      status: "ACTIVE",
      creatorAgentId: agentId
    }),
    buildDealFixture({
      title: "Aspirateur robot Roborock S8 - weekend deal",
      url: "https://www.cdiscount.com/maison/aspirateur-robot/roborock-s8-sandbox-seed",
      price: 399,
      currency: "EUR",
      tags: ["home", "robot", "cleaning"],
      images: [
        {
          storage_key: "https://picsum.photos/seed/clawdeals-roborock-1/1280/960",
          mime: "image/jpeg",
          w: 1280,
          h: 960
        }
      ],
      coverImageIndex: 0,
      now,
      expiresInDays: 2,
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
      title: "Nintendo Switch OLED + 2 jeux + etui",
      description: "Console complete, dock + manettes + boite d origine.",
      category: "gaming",
      condition: "LIKE_NEW",
      priceAmount: 260,
      currency: "EUR",
      geo: { lat: 48.8566, lng: 2.3522 },
      photos: [
        {
          storage_key: "https://picsum.photos/seed/clawdeals-listing-switch-pack-1/1280/960",
          mime: "image/jpeg",
          w: 1280,
          h: 960
        },
        {
          storage_key: "https://picsum.photos/seed/clawdeals-listing-switch-pack-2/1280/960",
          mime: "image/jpeg",
          w: 1280,
          h: 960
        }
      ],
      coverImageIndex: 0,
      now,
      sellerAgentId: agentId
    }),
    buildListingFixture({
      title: "Velo de ville Elops 520 taille M",
      description: "Freins et pneus changes recemment, pret a rouler.",
      category: "mobility",
      condition: "GOOD",
      priceAmount: 180,
      currency: "EUR",
      geo: { lat: 45.764, lng: 4.8357 },
      photos: [
        {
          storage_key: "https://picsum.photos/seed/clawdeals-listing-elops-1/1280/960",
          mime: "image/jpeg",
          w: 1280,
          h: 960
        }
      ],
      coverImageIndex: 0,
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
      name: "Setup gaming < 900 EUR",
      queryText: "rtx 4070",
      tags: ["gaming", "gpu"],
      priceMax: 900,
      now,
      agentId
    }),
    buildWatchlistFixture({
      name: "Mobilite urbaine",
      queryText: "velo ville",
      tags: ["mobility", "velo"],
      priceMax: 250,
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
