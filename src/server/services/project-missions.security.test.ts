import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));
vi.mock("./agents", () => ({ createAgentWithOwnerLimit: vi.fn(), getAgentById: vi.fn(), getAgentIdByOwnerId: vi.fn(), getOwnerAgentLimit: () => 1 }));
vi.mock("./listings", () => ({ listListings: vi.fn() }));

import { getSupabaseServiceClient } from "../db/supabase";
import { getAgentById, getAgentIdByOwnerId } from "./agents";
import { listListings } from "./listings";
import { createOwnerProjectMission, getOwnerProjectMission, mutateOwnerProjectMission } from "./project-missions";
import { projectContactSchema, requireProjectOwner } from "../http/project-missions";
import type { ProjectBrief } from "../../shared/project-missions";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1);
const otherOwner = id(2);
const buyer = id(3);
const missionId = id(4);
const creationKey = id(5);
const sellerOwner = id(6);
const seller = id(7);
const brief: ProjectBrief = { version: 1, use_case: "home_office", description: "Bureau domicile", budget_cents: 50_000, market_code: "FR", currency: "EUR", location: { lat: 48.85, lon: 2.35, radius_km: 25, label: "Paris" }, desk_max_width_cm: 140, desk_max_depth_cm: 80, laptop_connector: "HDMI", pickup_by: "2027-10-25", optional_slots: [] };
let tables: Record<string, any[]>;
let searchPages: Record<string, any[]>;

// Exercise real service orchestration with only the datastore/catalogue transport
// replaced. Browser fixtures cannot expose overlapping search pages, oversized
// search unions, or owner filtering in the server's separate read queries.
class Query {
  filters: ((row: any) => boolean)[] = [];
  payload: any = null;
  maximum = Infinity;
  constructor(private table: string) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.filters.push(row => row[key] === value); return this; }
  in(key: string, values: unknown[]) { this.filters.push(row => values.includes(row[key])); return this; }
  order() { return this; }
  limit(maximum: number) { this.maximum = maximum; return this; }
  insert(payload: any) { this.payload = payload; return this; }
  execute(single = false) {
    if (this.payload) {
      const row = { id: missionId, version: 1, status: "DRAFT", selected_configuration_id: null, confirmed_version: null, confirmed_at: null, contacts: [], facts: {}, created_at: "2026-10-23T12:00:00.000Z", updated_at: "2026-10-23T12:00:00.000Z", ...structuredClone(this.payload) };
      tables[this.table].push(row);
      this.payload = null;
      return { data: single ? row : [row], error: null };
    }
    const rows = tables[this.table].filter(row => this.filters.every(filter => filter(row))).slice(0, this.maximum);
    return { data: single ? rows[0] || null : rows, error: null };
  }
  async maybeSingle() { return this.execute(true); }
  async single() { return this.execute(true); }
  then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve(this.execute()).then(resolve, reject); }
}

function listing(title: string, n: number, price = 100) {
  return { listing_id: id(n), seller_agent_id: seller, owner_id: sellerOwner, title, description: "Annonce de seconde main", category: "furniture", price_amount: price, currency: "EUR", market_code: "FR", status: "LIVE", updated_at: "2026-10-20T12:00:00.000Z", geo_lat: 48.85, geo_lng: 2.35, delivery_method: "PICKUP" };
}
function seedListings(rows = [listing("Bureau compact", 10), listing("Chaise de bureau", 11), listing("Écran HDMI", 12)]) {
  tables.listings = rows;
  // Real full-text searches can include every result on the first "bureau" page.
  searchPages = { bureau: rows.map(row => ({ listing_id: row.listing_id })) };
}

beforeEach(() => {
  vi.resetAllMocks();
  tables = { project_missions: [], listings: [], moderation_states: [], agents: [{ id: seller, owner_id: sellerOwner, suspended_at: null }] };
  searchPages = {};
  vi.mocked(getAgentIdByOwnerId).mockResolvedValue(buyer);
  vi.mocked(getAgentById).mockResolvedValue({ id: buyer, owner_id: owner, suspended_at: null });
  vi.mocked(listListings).mockImplementation(async ({ q }: any) => ({ items: searchPages[q] || [], nextCursor: null }));
  vi.mocked(getSupabaseServiceClient).mockReturnValue({
    from: (table: string) => new Query(table),
    rpc: async (_name: string, input: any) => {
      const row = tables.project_missions.find(item => item.id === input.p_mission_id && item.owner_id === input.p_owner_id);
      if (!row) return { data: { error: "NOT_FOUND" }, error: null };
      Object.assign(row, { version: row.version + 1, plan: input.p_plan, catalog_snapshots: input.p_snapshots, facts: input.p_facts, selected_configuration_id: null, confirmed_version: null, confirmed_at: null, status: "DRAFT" });
      return { data: { mission: structuredClone(row) }, error: null };
    }
  } as any);
});

describe("project mission service trust boundaries", () => {
  it("rejects an expired new project before provisioning an agent or querying the catalogue", async () => {
    seedListings();
    await expect(createOwnerProjectMission(owner, { brief: { ...brief, pickup_by: "2000-01-01" } }, creationKey)).rejects.toMatchObject({ status: 422, code: "PROJECT_DEADLINE_EXPIRED" });
    expect(getAgentIdByOwnerId).not.toHaveBeenCalled();
    expect(listListings).not.toHaveBeenCalled();
    expect(tables.project_missions).toEqual([]);
  });

  it("recovers a persisted creation after its deadline without creating a second project", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
      seedListings();
      const original = { ...brief, pickup_by: "2026-10-23" };
      const created = await createOwnerProjectMission(owner, { brief: original }, creationKey);
      vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
      vi.mocked(getAgentIdByOwnerId).mockClear();
      vi.mocked(listListings).mockClear();
      expect((await createOwnerProjectMission(owner, { brief: original }, creationKey)).id).toBe(created.id);
      await expect(createOwnerProjectMission(owner, { brief: original }, id(90))).rejects.toMatchObject({ status: 422, code: "PROJECT_DEADLINE_EXPIRED" });
      expect(getAgentIdByOwnerId).not.toHaveBeenCalled();
      expect(listListings).not.toHaveBeenCalled();
      expect(tables.project_missions).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it("assigns each equipment item once even when the first search matches every office description", async () => {
    seedListings([... [listing("Bureau compact", 10), listing("Chaise de bureau", 11), listing("Écran HDMI", 12)], listing("Support écran", 13)]);
    searchPages.chaise = [{ listing_id: id(11) }];
    searchPages["écran"] = [{ listing_id: id(12) }, { listing_id: id(13) }];
    const result = await createOwnerProjectMission(owner, { brief }, creationKey);
    expect(result.plan.configurations[0].items.map(item => [item.listing_id, item.slot])).toEqual([[id(10), "desk"], [id(11), "chair"], [id(12), "monitor"]]);
    expect(result.plan.alternatives.monitor).toHaveLength(1);
    expect(result.plan.configurations[0].ready_to_approve).toBe(false);
  });

  it("bounds a 300-result disjoint search union without losing the requested equipment roles", async () => {
    const searches = { bureau: "Bureau", desk: "Bureau", chaise: "Chaise", fauteuil: "Fauteuil", chair: "Chaise", "écran": "Écran", moniteur: "Moniteur", monitor: "Écran", lampe: "Lampe de bureau", clavier: "Clavier" };
    let counter = 100;
    for (const [query, title] of Object.entries(searches)) {
      const rows = Array.from({ length: 30 }, () => listing(`${title} ${counter}`, counter++, 10));
      tables.listings.push(...rows);
      searchPages[query] = rows.map(row => ({ listing_id: row.listing_id }));
    }
    const result = await createOwnerProjectMission(owner, { brief: { ...brief, optional_slots: ["lamp", "keyboard"] } }, creationKey);
    expect(result.plan.search_limited).toBe(true);
    expect(result.plan.configurations[0].items.map(item => item.slot)).toEqual(["desk", "chair", "monitor", "lamp", "keyboard"]);
    expect(Object.values(result.plan.alternatives).flat().length).toBeLessThanOrEqual(250);
  });

  it("rejects a different owner before exposing a saved brief or private facts", async () => {
    seedListings();
    await createOwnerProjectMission(owner, { brief }, creationKey);
    await expect(getOwnerProjectMission(otherOwner, missionId)).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(tables.project_missions[0].version).toBe(1);
  });

  it("does not accept client-injected catalogue facts or a pre-approved plan during creation", async () => {
    seedListings();
    await expect(createOwnerProjectMission(owner, { brief, plan: { ready_to_approve: true }, facts: { [id(10)]: { quoted_price_cents: 0 } } }, creationKey)).rejects.toThrow();
    expect(tables.project_missions).toEqual([]);
  });

  it("recalculates with a buyer-entered discussion price then drops it after a source change", async () => {
    seedListings([listing("Bureau compact", 10, 350), listing("Chaise de bureau", 11), listing("Écran HDMI", 12)]);
    const created = await createOwnerProjectMission(owner, { brief }, creationKey);
    expect(created.plan.configurations).toEqual([]);
    const quoted = await mutateOwnerProjectMission(owner, missionId, "facts", { expected_version: 1, listing_id: id(10), facts: { provenance: "user_confirmed", confirmed_at: "2026-10-23T12:00:00.000Z", quoted_price_cents: 18_000, delivery_fee_cents: 0, desk_width_cm: 120, desk_depth_cm: 60, pickup_available_by: "2026-10-24" } });
    expect(quoted.plan.configurations[0].total_known_cents).toBe(38_000);
    expect(quoted.plan.configurations[0].items[0].price_cents).toBe(35_000);
    tables.listings[0].description = "Dimensions et conditions de vente modifiées";
    tables.listings[0].updated_at = "2026-10-24T12:00:00.000Z";
    const refreshed = await getOwnerProjectMission(owner, missionId);
    expect(refreshed.plan.configurations).toEqual([]);
    expect(refreshed.plan.alternatives.desk[0].facts).toBeNull();
  });

  it("requires an owner session, same-origin request and exact expected owner for mutation", () => {
    const req = { method: "POST", headers: { host: "clawdeals.test", origin: "https://clawdeals.test", "x-forwarded-proto": "https", "content-type": "application/json", "idempotency-key": creationKey, "x-expected-owner-id": owner } };
    const ctx = { actor: { type: "owner" }, ownerId: owner, ownerSessionId: id(20) };
    expect(requireProjectOwner(req, ctx, true)).toBeNull();
    expect(requireProjectOwner(req, { ...ctx, ownerSessionId: null }, true)?.status).toBe(401);
    expect(requireProjectOwner({ ...req, headers: { ...req.headers, origin: "https://hostile.test" } }, ctx, true)?.status).toBe(403);
    expect(requireProjectOwner({ ...req, headers: { ...req.headers, "x-expected-owner-id": otherOwner } }, ctx, true)?.body).toMatchObject({ error: { code: "OWNER_SESSION_CHANGED" } });
    expect(projectContactSchema.safeParse({ expected_version: 1, configuration_id: "economy", confirmed_preview: false }).success).toBe(false);
  });
});
