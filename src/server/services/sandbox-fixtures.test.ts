import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: vi.fn()
}));

import { getSupabaseServiceClient } from "../db/supabase";
import {
  buildDemoEbikeListingsPayload,
  buildDemoEbikeMissionWatchlist,
  resetSandboxFixtures
} from "./sandbox-fixtures";

function createThenableChain({ value }: { value: any }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn((resolve) => resolve(value))
  };
  return chain;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function createSandboxClient({
  buyerAgentId,
  sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  sellerOwnerId = "22222222-2222-4222-8222-222222222222",
  reuseSeller = true
}: {
  buyerAgentId: string;
  sellerAgentId?: string;
  sellerOwnerId?: string;
  reuseSeller?: boolean;
}) {
  const buyerOwnerId = "11111111-1111-4111-8111-111111111111";
  const inserts: Record<string, any[]> = {
    agents: [],
    owners: [],
    policies: [],
    listings: [],
    deals: [],
    watchlists: [],
    threads: [],
    messages: []
  };
  const updates: Record<string, any[]> = {
    agents: [],
    owners: [],
    policies: []
  };
  const deletes: Record<string, any[]> = {
    listings: [],
    watchlists: [],
    deals: []
  };
  const containsCalls: any[] = [];

  function tableChain(table: string) {
    const state: any = { filters: {}, contains: null, op: null, payload: null };
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((column: string, value: any) => {
        state.filters[column] = value;
        return chain;
      }),
      contains: vi.fn((column: string, value: any) => {
        state.contains = { column, value };
        containsCalls.push({ table, column, value });
        return chain;
      }),
      limit: vi.fn().mockReturnThis(),
      insert: vi.fn((payload: any) => {
        state.op = "insert";
        state.payload = payload;
        inserts[table] = inserts[table] || [];
        inserts[table].push(payload);
        return chain;
      }),
      update: vi.fn((payload: any) => {
        state.op = "update";
        state.payload = payload;
        return chain;
      }),
      delete: vi.fn(() => {
        state.op = "delete";
        return chain;
      }),
      maybeSingle: vi.fn(async () => {
        if (state.op === "update") {
          updates[table] = updates[table] || [];
          updates[table].push({ payload: state.payload, filters: { ...state.filters } });
        }
        if (state.op === "delete") {
          deletes[table] = deletes[table] || [];
          deletes[table].push({ filters: { ...state.filters } });
        }
        if (table === "agents" && String(state.contains?.value?.system || "").startsWith("sandbox.ebike-seller")) {
          if (!reuseSeller) return { data: null, error: null };
          return {
            data: { id: sellerAgentId, owner_id: sellerOwnerId, trust_flags: ["quarantined"] },
            error: null
          };
        }
        if (table === "agents" && state.filters.id === buyerAgentId) {
          return {
            data: {
              id: buyerAgentId,
              owner_id: buyerOwnerId,
              trust_flags: ["unverified_owner", "quarantined"]
            },
            error: null
          };
        }
        if (table === "agents" && state.filters.id === sellerAgentId) {
          return {
            data: { id: sellerAgentId, owner_id: sellerOwnerId, trust_flags: ["quarantined"] },
            error: null
          };
        }
        if (table === "owners" && state.filters.owner_id === sellerOwnerId) {
          return { data: { owner_id: sellerOwnerId, email_verified_at: null }, error: null };
        }
        if (table === "policies" && state.filters.owner_id === sellerOwnerId) {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      }),
      single: vi.fn(async () => {
        if (table === "agents" && state.op === "insert") {
          const payload = Array.isArray(state.payload) ? state.payload[0] : state.payload;
          return {
            data: {
              id: sellerAgentId,
              owner_id: payload?.owner_id || sellerOwnerId,
              trust_flags: payload?.trust_flags || []
            },
            error: null
          };
        }
        if (table === "policies" && state.op === "insert") {
          return { data: { policy_id: "policy-1" }, error: null };
        }
        if (table === "threads" && state.op === "insert") {
          return { data: Array.isArray(state.payload) ? state.payload[0] : state.payload, error: null };
        }
        if (table === "messages" && state.op === "insert") {
          return { data: Array.isArray(state.payload) ? state.payload[0] : state.payload, error: null };
        }
        return { data: null, error: null };
      }),
      then: vi.fn((resolve) => {
        if (state.op === "update") {
          updates[table] = updates[table] || [];
          updates[table].push({ payload: state.payload, filters: { ...state.filters } });
        }
        if (state.op === "delete") {
          deletes[table] = deletes[table] || [];
          deletes[table].push({ filters: { ...state.filters } });
        }
        if (state.op === "insert") {
          const rows = Array.isArray(state.payload) ? state.payload : [state.payload];
          return resolve({
            data:
              table === "listings"
                ? rows.map((row: any, index: number) => ({
                    ...row,
                    listing_id:
                      row.listing_id || `99000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
                  }))
                : rows,
            error: null
          });
        }
        return resolve({ data: [], error: null });
      })
    };
    return chain;
  }

  const client: any = {
    from: vi.fn((table: string) => tableChain(table))
  };

  return {
    client,
    inserts,
    updates,
    deletes,
    containsCalls,
    sellerAgentId,
    sellerOwnerId,
    buyerOwnerId
  };
}

describe("resetSandboxFixtures", () => {
  const prevEnv = process.env.CLAWDEALS_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLAWDEALS_ENV = "sandbox";
  });

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env.CLAWDEALS_ENV;
    } else {
      process.env.CLAWDEALS_ENV = prevEnv;
    }
  });

  it("ages the authenticated agent out of quarantine", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const agentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const sandbox = createSandboxClient({ buyerAgentId: agentId });
    vi.mocked(getSupabaseServiceClient).mockReturnValue(sandbox.client);

    await resetSandboxFixtures({ agentId, now });

    const expectedCreatedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const expectedNowIso = now.toISOString();
    expect(sandbox.updates.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filters: { id: agentId },
          payload: {
            created_at: expectedCreatedAt,
            trust_flags: ["unverified_owner"],
            trust_updated_at: expectedNowIso,
            updated_at: expectedNowIso
          }
        })
      ])
    );
  });

  it("seeds deals and listings with media payloads", async () => {
    const now = new Date("2026-02-09T00:00:00.000Z");
    const agentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const sandbox = createSandboxClient({ buyerAgentId: agentId });
    vi.mocked(getSupabaseServiceClient).mockReturnValue(sandbox.client);

    await resetSandboxFixtures({ agentId, now });

    const dealsPayload = sandbox.inserts.deals[0];
    expect(Array.isArray(dealsPayload)).toBe(true);
    expect(dealsPayload.length).toBeGreaterThan(0);
    for (const item of dealsPayload) {
      expect(Array.isArray(item.images)).toBe(true);
      expect(item.images.length).toBeGreaterThan(0);
      expect(Number.isInteger(item.cover_image_index)).toBe(true);
    }

    const listingsPayload = sandbox.inserts.listings[0];
    expect(Array.isArray(listingsPayload)).toBe(true);
    expect(listingsPayload.length).toBeGreaterThan(0);
    for (const item of listingsPayload) {
      expect(Array.isArray(item.photos)).toBe(true);
      expect(item.photos.length).toBeGreaterThan(0);
      expect(Number.isInteger(item.cover_image_index)).toBe(true);
      expect(item.market_code).toBe("FR");
      expect(item.duplicate_override).toBe(false);
    }
  });

  it("seeds e-bike listings on a distinct sandbox seller, never the buyer mission agent", async () => {
    const now = new Date("2026-08-26T10:00:00.000Z");
    const agentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const sandbox = createSandboxClient({ buyerAgentId: agentId });
    vi.mocked(getSupabaseServiceClient).mockReturnValue(sandbox.client);

    const result = await resetSandboxFixtures({ agentId, now, judgeMode: true });

    expect(result.actors.buyer_agent_id).toBe(agentId);
    expect(result.actors.seller_agent_id).toBe(sandbox.sellerAgentId);
    expect(result.actors.seller_agent_id).not.toBe(agentId);
    expect(result.actors.seller_owner_id).toBe(sandbox.sellerOwnerId);

    expect(sandbox.containsCalls).toEqual(
      expect.arrayContaining([
        {
          table: "agents",
          column: "metadata",
          value: {
            system: "sandbox.ebike-seller.judge",
            env: "sandbox",
            judge_agent_id: agentId
          }
        }
      ])
    );
    expect(sandbox.updates.owners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filters: { owner_id: sandbox.sellerOwnerId },
          payload: {
            display_name: "Sandbox e-bike seller",
            email_verified_at: now.toISOString(),
            updated_at: now.toISOString()
          }
        })
      ])
    );
    expect(sandbox.inserts.policies[0]).toEqual(
      expect.objectContaining({
        owner_id: sandbox.sellerOwnerId,
        version: 1,
        policy_json: expect.objectContaining({
          budgets: { max_offer: 1500, currency: "EUR" },
          approval_thresholds: { offer_amount_gt: 1500, contact_reveal: "always" },
          auto_approve: {
            message_types: ["question", "answer", "info"],
            actions: ["thread.create", "offer.accept"]
          }
        })
      })
    );

    const listingsPayload = sandbox.inserts.listings[0];
    const ebikeListings = listingsPayload.filter((item: any) =>
      String(item.duplicate_fingerprint || "").startsWith("sandbox-webmcp-judge-ebike-")
    );
    expect(ebikeListings).toHaveLength(5);
    expect(ebikeListings.every((item: any) => item.seller_agent_id === sandbox.sellerAgentId)).toBe(true);
    expect(ebikeListings.every((item: any) => item.seller_agent_id !== agentId)).toBe(true);
    expect(ebikeListings.every((item: any) => item.owner_id === sandbox.sellerOwnerId)).toBe(true);
    expect(ebikeListings.every((item: any) => /used e-bike/i.test(item.title))).toBe(true);
    expect(JSON.stringify(ebikeListings)).not.toMatch(/@|\+33|phone/i);
    expect(ebikeListings.map((item: any) => item.listing_id)).toEqual([
      "90000000-0000-4000-8000-000000000001",
      "90000000-0000-4000-8000-000000000002",
      "90000000-0000-4000-8000-000000000003",
      "90000000-0000-4000-8000-000000000004",
      "90000000-0000-4000-8000-000000000005"
    ]);

    expect(sandbox.inserts.threads[0]).toMatchObject({
      thread_id: "91000000-0000-4000-8000-000000000001",
      listing_id: "90000000-0000-4000-8000-000000000001",
      buyer_agent_id: agentId,
      seller_agent_id: sandbox.sellerAgentId,
      status: "OPEN"
    });
    expect(sandbox.inserts.messages[0]).toMatchObject({
      message_id: "92000000-0000-4000-8000-000000000001",
      thread_id: "91000000-0000-4000-8000-000000000001",
      sender_type: "system",
      redacted: false
    });
    expect(JSON.stringify(sandbox.inserts.threads[0])).not.toMatch(/@|\+33|phone/i);
    expect(JSON.stringify(sandbox.inserts.messages[0])).not.toMatch(/@|\+33|phone/i);
    expect(result.counts).toMatchObject({ threads: 1, messages: 1 });
    expect(result.thread?.thread_id).toBe("91000000-0000-4000-8000-000000000001");

    const paris = { lat: 48.8566, lng: 2.3522 };
    const bySlug = Object.fromEntries(
      ebikeListings.map((item: any) => [String(item.duplicate_fingerprint).replace("sandbox-webmcp-judge-ebike-", ""), item])
    );
    expect(haversineKm(paris.lat, paris.lng, bySlug["target-fit"].geo_lat, bySlug["target-fit"].geo_lng)).toBeLessThan(25);
    expect(haversineKm(paris.lat, paris.lng, bySlug["out-of-radius"].geo_lat, bySlug["out-of-radius"].geo_lng)).toBeGreaterThan(25);
    expect(bySlug["target-fit"].price_amount).toBeLessThanOrEqual(1200);
    expect(bySlug["preferred-over"].price_amount).toBeGreaterThan(1200);
    expect(bySlug["preferred-over"].price_amount).toBeLessThanOrEqual(1300);
    expect(bySlug["hard-budget"].price_amount).toBeGreaterThan(1300);

    const watchlistsPayload = sandbox.inserts.watchlists[0];
    const mission = watchlistsPayload.find((item: any) => item.name === "Paris used e-bike mission");
    expect(watchlistsPayload.every((item: any) => item.market_code === "FR")).toBe(true);
    expect(watchlistsPayload.every((item: any) => item.currency === "EUR")).toBe(true);
    expect(mission.agent_id).toBe(agentId);
    expect(mission.agent_id).not.toBe(sandbox.sellerAgentId);
    expect(mission.criteria.mission).toMatchObject({
      preferred_price_max: 1200,
      hard_budget_max: 1300,
      requirements: ["battery_health >= 80%"]
    });
  });

  it("reuses the tagged sandbox seller instead of creating production actors", async () => {
    const now = new Date("2026-08-26T10:00:00.000Z");
    const agentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const sandbox = createSandboxClient({ buyerAgentId: agentId, reuseSeller: true });
    vi.mocked(getSupabaseServiceClient).mockReturnValue(sandbox.client);

    const first = await resetSandboxFixtures({ agentId, now });
    expect(sandbox.inserts.agents).toHaveLength(0);
    expect(first.actors.seller_agent_id).not.toBe(first.actors.buyer_agent_id);
    expect(sandbox.containsCalls[0].value).toEqual({
      system: "sandbox.ebike-seller",
      env: "sandbox"
    });
  });
});

describe("demo e-bike fixtures", () => {
  it("are deterministic and cover distance, trust, and policy_fit candidates", () => {
    const now = new Date("2026-08-26T10:00:00.000Z");
    const buyerAgentId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const sellerAgentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const first = buildDemoEbikeListingsPayload({ now, sellerAgentId, ownerId: "owner-seller" });
    const second = buildDemoEbikeListingsPayload({ now, sellerAgentId, ownerId: "owner-seller" });
    expect(first).toEqual(second);
    expect(first.every((item) => item.seller_agent_id === sellerAgentId)).toBe(true);
    expect(first.every((item) => item.seller_agent_id !== buyerAgentId)).toBe(true);
    expect(first.map((item) => item.duplicate_fingerprint)).toEqual([
      "sandbox-ebike-target-fit",
      "sandbox-ebike-preferred-over",
      "sandbox-ebike-hard-budget",
      "sandbox-ebike-battery-low",
      "sandbox-ebike-out-of-radius"
    ]);

    const mission = buildDemoEbikeMissionWatchlist({ now, agentId: buyerAgentId });
    expect(mission.agent_id).toBe(buyerAgentId);
    expect(mission.agent_id).not.toBe(sellerAgentId);
  });
});
