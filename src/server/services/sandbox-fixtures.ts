import crypto from "crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { isSandboxEnv } from "../config/runtime";
import { assertSandboxNotProductionTarget } from "../config/sandbox-target";
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

const PARIS = { lat: 48.8566, lon: 2.3522 };
const DEMO_EBIKE_MISSION_QUERY = "used e-bike";
const SANDBOX_EBIKE_SELLER_SYSTEM = "sandbox.ebike-seller";
const SANDBOX_EBIKE_SELLER_NAME = "Sandbox e-bike seller";
const DEMO_EBIKE_LISTING_IDS = {
  "target-fit": "90000000-0000-4000-8000-000000000001",
  "preferred-over": "90000000-0000-4000-8000-000000000002",
  "hard-budget": "90000000-0000-4000-8000-000000000003",
  "battery-low": "90000000-0000-4000-8000-000000000004",
  "out-of-radius": "90000000-0000-4000-8000-000000000005"
} as const;
const DEMO_EBIKE_THREAD_ID = "91000000-0000-4000-8000-000000000001";
const DEMO_EBIKE_MESSAGE_ID = "92000000-0000-4000-8000-000000000001";
type DemoEbikeListingSlug = keyof typeof DEMO_EBIKE_LISTING_IDS;

function listingPhoto(seed: string) {
  return {
    storage_key: `https://picsum.photos/seed/clawdeals-${seed}/1280/960`,
    mime: "image/jpeg",
    w: 1280,
    h: 960
  };
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
    market_code: "FR",
    duplicate_fingerprint: null,
    duplicate_override: false,
    updated_at: toIso(now)
  };
}

function buildEbikeListingFixture({
  slug,
  title,
  description,
  condition,
  priceAmount,
  geo,
  now,
  sellerAgentId,
  ownerId,
  deterministicIds,
  fingerprintPrefix
}: {
  slug: DemoEbikeListingSlug;
  title: string;
  description: string;
  condition: "LIKE_NEW" | "GOOD" | "FAIR";
  priceAmount: number;
  geo: { lat: number; lng: number };
  now: Date;
  sellerAgentId: string;
  ownerId?: string | null;
  deterministicIds: boolean;
  fingerprintPrefix: string;
}) {
  return {
    ...buildListingFixture({
      title,
      description,
      category: "mobility",
      condition,
      priceAmount,
      currency: "EUR",
      geo,
      photos: [listingPhoto(`ebike-${slug}-1`), listingPhoto(`ebike-${slug}-2`)],
      coverImageIndex: 0,
      now,
      sellerAgentId
    }),
    ...(deterministicIds ? { listing_id: DEMO_EBIKE_LISTING_IDS[slug] } : {}),
    owner_id: ownerId ?? null,
    market_code: "FR",
    delivery_method: "PICKUP",
    duplicate_fingerprint: `${fingerprintPrefix}-${slug}`,
    duplicate_override: false
  };
}

export function buildDemoEbikeListingsPayload({
  now,
  sellerAgentId,
  ownerId,
  deterministicIds = true,
  fingerprintPrefix = "sandbox-ebike"
}: {
  now: Date;
  sellerAgentId: string;
  ownerId?: string | null;
  deterministicIds?: boolean;
  fingerprintPrefix?: string;
}) {
  const common = { now, sellerAgentId, ownerId, deterministicIds, fingerprintPrefix };
  return [
    buildEbikeListingFixture({
      slug: "target-fit",
      title: "Used e-bike urban commute - battery health 88%",
      description:
        "Synthetic demo listing. Used e-bike in Paris with battery health 88%, recent service, and invoice available. Pickup only. No personal contact details.",
      condition: "GOOD",
      priceAmount: 1150,
      geo: { lat: 48.8867, lng: 2.3431 },
      ...common
    }),
    buildEbikeListingFixture({
      slug: "preferred-over",
      title: "Used e-bike - battery health 82% above preferred target",
      description:
        "Synthetic demo listing. Used e-bike with battery health 82%. Price is above the preferred 1200 EUR target but below the 1300 EUR hard budget.",
      condition: "LIKE_NEW",
      priceAmount: 1240,
      geo: { lat: 48.847, lng: 2.438 },
      ...common
    }),
    buildEbikeListingFixture({
      slug: "hard-budget",
      title: "Used e-bike - battery health 91% over hard budget",
      description:
        "Synthetic demo listing. Used e-bike with battery health 91%. Price exceeds the 1300 EUR hard budget and should fail policy_fit.",
      condition: "LIKE_NEW",
      priceAmount: 1420,
      geo: { lat: 48.833, lng: 2.252 },
      ...common
    }),
    buildEbikeListingFixture({
      slug: "battery-low",
      title: "Used e-bike - battery health 64% needs confirmation",
      description:
        "Synthetic demo listing. Used e-bike with battery health 64%, below the 80% mission requirement. Distance still inside 25 km of Paris.",
      condition: "FAIR",
      priceAmount: 980,
      geo: { lat: 48.8049, lng: 2.1204 },
      ...common
    }),
    buildEbikeListingFixture({
      slug: "out-of-radius",
      title: "Used e-bike - battery health 90% outside 25 km",
      description:
        "Synthetic demo listing. Used e-bike with battery health 90% located about 42 km from Paris, outside the Deal Mission radius.",
      condition: "GOOD",
      priceAmount: 1100,
      geo: { lat: 48.54, lng: 2.66 },
      ...common
    })
  ];
}

export function buildDemoEbikeMissionWatchlist({ now, agentId }: { now: Date; agentId: string }) {
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const tags = safeTagList(["mobility", "e-bike", "demo"]);
  return {
    agent_id: agentId,
    name: "Paris used e-bike mission",
    active: true,
    market_code: "FR",
    currency: "EUR",
    criteria: {
      query: DEMO_EBIKE_MISSION_QUERY,
      tags,
      price_max: 1300,
      geo: { lat: PARIS.lat, lon: PARIS.lon },
      distance_km: 25,
      deal_type: "LOCAL",
      country: "FR",
      delivery_method: "PICKUP",
      mission: {
        version: 1,
        kind: "BUY",
        preferred_price_max: 1200,
        hard_budget_max: 1300,
        currency: "EUR",
        requirements: ["battery_health >= 80%"],
        autonomous_actions: ["search", "ask_question", "make_offer"],
        contact_reveal: "manual_bilateral_approval",
        expires_at: expiresAt,
        location: {
          label: "Paris",
          lat: PARIS.lat,
          lon: PARIS.lon,
          radius_km: 25
        }
      }
    },
    query_text: DEMO_EBIKE_MISSION_QUERY,
    tags,
    price_max: 1300,
    geo_lat: PARIS.lat,
    geo_lon: PARIS.lon,
    distance_km: 25,
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
    market_code: "FR",
    currency: "EUR",
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

async function ageSandboxAgent({
  client,
  agentId,
  nowIso,
  agedCreatedAt,
  extraTrustFlags = []
}: {
  client: any;
  agentId: string;
  nowIso: string;
  agedCreatedAt: string;
  extraTrustFlags?: string[];
}) {
  const { data: agentRow, error: agentFetchError } = await client
    .from("agents")
    .select("id, owner_id, trust_flags")
    .eq("id", agentId)
    .maybeSingle();
  if (agentFetchError) mapError(agentFetchError);

  const flags = withoutTrustFlag(agentRow?.trust_flags, "quarantined");
  for (const flag of extraTrustFlags) {
    if (!flags.includes(flag)) flags.push(flag);
  }

  const { error: agentUpdateError } = await client
    .from("agents")
    .update({
      created_at: agedCreatedAt,
      trust_flags: flags,
      trust_updated_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", agentId);
  if (agentUpdateError) mapError(agentUpdateError);
  return agentRow;
}

async function ensureSandboxOwnerVerified({
  client,
  ownerId,
  displayName,
  nowIso
}: {
  client: any;
  ownerId: string;
  displayName: string;
  nowIso: string;
}) {
  const { data: ownerRow, error: ownerFetchError } = await client
    .from("owners")
    .select("owner_id, email_verified_at")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (ownerFetchError) mapError(ownerFetchError);
  if (!ownerRow) return null;

  const { error: ownerUpdateError } = await client
    .from("owners")
    .update({
      display_name: displayName,
      email_verified_at: ownerRow.email_verified_at || nowIso,
      updated_at: nowIso
    })
    .eq("owner_id", ownerId);
  if (ownerUpdateError) mapError(ownerUpdateError);
  return ownerRow;
}

async function ensureSandboxSellerPolicy({
  client,
  ownerId,
  nowIso
}: {
  client: any;
  ownerId: string;
  nowIso: string;
}) {
  const policyPayload = {
    version: 1,
    policy_json: {
      version: 1,
      budgets: { max_offer: 1500, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1500, contact_reveal: "always" },
      auto_approve: {
        message_types: ["question", "answer", "info"],
        actions: ["thread.create", "offer.accept"]
      },
      allowlist_agent_ids: [],
      denylist_agent_ids: []
    },
    updated_at: nowIso
  };
  const { data: existing, error: policyFetchError } = await client
    .from("policies")
    .select("policy_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (policyFetchError) mapError(policyFetchError);
  if (existing) {
    const { error: policyUpdateError } = await client
      .from("policies")
      .update(policyPayload)
      .eq("owner_id", ownerId);
    if (policyUpdateError) mapError(policyUpdateError);
    return existing;
  }

  const { data: inserted, error: policyInsertError } = await client
    .from("policies")
    .insert({
      owner_id: ownerId,
      ...policyPayload
    })
    .select("policy_id")
    .maybeSingle();
  if (policyInsertError) {
    const code = String(policyInsertError.code || "");
    if (code !== "23505") mapError(policyInsertError);
    return existing;
  }
  return inserted;
}

async function ensureSandboxEbikeSeller({
  client,
  buyerAgentId,
  nowIso,
  agedCreatedAt,
  judgeAgentId
}: {
  client: any;
  buyerAgentId: string;
  nowIso: string;
  agedCreatedAt: string;
  judgeAgentId?: string | null;
}) {
  const sellerSystem = judgeAgentId
    ? `${SANDBOX_EBIKE_SELLER_SYSTEM}.judge`
    : SANDBOX_EBIKE_SELLER_SYSTEM;
  const sellerMetadata = {
    system: sellerSystem,
    env: "sandbox",
    ...(judgeAgentId ? { judge_agent_id: judgeAgentId } : {})
  };
  const { data: existing, error: existingError } = await client
    .from("agents")
    .select("id, owner_id, trust_flags")
    .contains("metadata", sellerMetadata)
    .limit(1)
    .maybeSingle();
  if (existingError) mapError(existingError);

  let seller = existing;
  if (seller && String(seller.id) === String(buyerAgentId)) {
    seller = null;
  }

  if (!seller) {
    const ownerId = crypto.randomUUID();
    const { error: ownerInsertError } = await client.from("owners").insert({
      owner_id: ownerId,
      display_name: SANDBOX_EBIKE_SELLER_NAME,
      email_verified_at: nowIso,
      updated_at: nowIso
    });
    if (ownerInsertError) mapError(ownerInsertError);

    const { data: created, error: agentInsertError } = await client
      .from("agents")
      .insert({
        name: SANDBOX_EBIKE_SELLER_NAME,
        status: "active",
        owner_id: ownerId,
        metadata: {
          ...sellerMetadata,
          synthetic: true,
          role: "ebike-seller"
        },
        trust_score: 72,
        trust_flags: [],
        created_at: agedCreatedAt,
        trust_updated_at: nowIso,
        updated_at: nowIso
      })
      .select("id, owner_id, trust_flags")
      .single();
    if (agentInsertError) mapError(agentInsertError);
    seller = created;
  }

  const sellerAgentId = String(seller.id);
  const sellerOwnerId = typeof seller.owner_id === "string" ? seller.owner_id : null;
  if (!sellerOwnerId) {
    throw buildServiceError("Sandbox e-bike seller is missing owner_id", 500, "ERROR");
  }

  await ageSandboxAgent({
    client,
    agentId: sellerAgentId,
    nowIso,
    agedCreatedAt
  });
  await ensureSandboxOwnerVerified({
    client,
    ownerId: sellerOwnerId,
    displayName: SANDBOX_EBIKE_SELLER_NAME,
    nowIso
  });
  await ensureSandboxSellerPolicy({ client, ownerId: sellerOwnerId, nowIso });

  const { error: listingsDeleteError } = await client
    .from("listings")
    .delete()
    .eq("seller_agent_id", sellerAgentId);
  if (listingsDeleteError) mapError(listingsDeleteError);

  return {
    sellerAgentId,
    sellerOwnerId
  };
}

export async function resetSandboxFixtures({
  agentId,
  now = new Date(),
  judgeMode = false
}: {
  agentId: string;
  now?: Date;
  judgeMode?: boolean;
}) {
  if (!isSandboxEnv()) {
    throw buildServiceError("Sandbox fixtures are only available in sandbox environments", 404, "NOT_FOUND");
  }
  assertSandboxNotProductionTarget();
  if (!agentId || typeof agentId !== "string") {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const nowIso = toIso(now);

  // Sandbox determinism: a fresh agent is quarantined for ~7 days, which blocks
  // publish=true listing flows and can force approvals for offers/threads. Age
  // the authenticated agent so sample flows work immediately after reset.
  const agedCreatedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  await ageSandboxAgent({ client, agentId, nowIso, agedCreatedAt });
  const { sellerAgentId, sellerOwnerId } = await ensureSandboxEbikeSeller({
    client,
    buyerAgentId: agentId,
    nowIso,
    agedCreatedAt,
    judgeAgentId: judgeMode ? agentId : null
  });

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
    ...buildDemoEbikeListingsPayload({
      now,
      sellerAgentId,
      ownerId: sellerOwnerId,
      deterministicIds: judgeMode,
      fingerprintPrefix: judgeMode ? "sandbox-webmcp-judge-ebike" : "sandbox-ebike"
    }),
    {
      ...buildListingFixture({
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
        sellerAgentId
      }),
      ...(judgeMode ? { listing_id: "90000000-0000-4000-8000-000000000006" } : {})
    },
    {
      ...buildListingFixture({
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
        sellerAgentId
      }),
      ...(judgeMode ? { listing_id: "90000000-0000-4000-8000-000000000007" } : {})
    }
  ];

  const { data: listings, error: listingsInsertError } = await client
    .from("listings")
    .insert(listingsPayload)
    .select("listing_id,title,status,duplicate_fingerprint,created_at");
  if (listingsInsertError) mapError(listingsInsertError);

  const targetFingerprint = judgeMode
    ? "sandbox-webmcp-judge-ebike-target-fit"
    : "sandbox-ebike-target-fit";
  const targetListing = Array.isArray(listings)
    ? listings.find((listing) => listing.duplicate_fingerprint === targetFingerprint)
    : null;
  const targetListingId = judgeMode
    ? DEMO_EBIKE_LISTING_IDS["target-fit"]
    : targetListing?.listing_id;
  if (!targetListingId) {
    throw buildServiceError("Sandbox target e-bike listing was not created", 500, "ERROR");
  }

  const demoThreadPayload = {
    ...(judgeMode ? { thread_id: DEMO_EBIKE_THREAD_ID } : {}),
    thread_type: "MARKETPLACE",
    listing_id: targetListingId,
    owner_id: sellerOwnerId,
    buyer_agent_id: agentId,
    seller_agent_id: sellerAgentId,
    status: "OPEN",
    control_owner_id: null,
    control_agent_id: null,
    created_at: nowIso
  };
  const { data: demoThread, error: demoThreadError } = await client
    .from("threads")
    .insert(demoThreadPayload)
    .select("thread_id,listing_id,buyer_agent_id,seller_agent_id,status,created_at")
    .single();
  if (demoThreadError) mapError(demoThreadError);

  const demoMessagePayload = {
    ...(judgeMode ? { message_id: DEMO_EBIKE_MESSAGE_ID } : {}),
    thread_id: demoThread?.thread_id,
    sender_id: null,
    sender_type: "system",
    body: "Synthetic judge thread ready. No personal contact details are stored.",
    type: "info",
    payload: {
      type: "info",
      text: "Synthetic judge thread ready. No personal contact details are stored."
    },
    redacted: false,
    created_at: nowIso
  };
  const { data: demoMessage, error: demoMessageError } = await client
    .from("messages")
    .insert(demoMessagePayload)
    .select("message_id,thread_id,type,redacted,created_at")
    .single();
  if (demoMessageError) mapError(demoMessageError);

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
    }),
    buildDemoEbikeMissionWatchlist({ now, agentId })
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
      watchlists: Array.isArray(watchlists) ? watchlists.length : 0,
      threads: demoThread ? 1 : 0,
      messages: demoMessage ? 1 : 0
    },
    deals: deals || [],
    listings: listings || [],
    watchlists: watchlists || [],
    thread: demoThread || null,
    actors: {
      buyer_agent_id: agentId,
      seller_agent_id: sellerAgentId,
      seller_owner_id: sellerOwnerId
    }
  };
}
