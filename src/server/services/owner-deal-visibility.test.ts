import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));
import { getSupabaseServiceClient } from "../db/supabase";
import { listDealsByOwner } from "./deals-list";
import { getPublicDeal } from "./public-deals";

// Browser fixtures cannot catch a wrong server visibility decision. Exercise
// both real services against the same small database response fixture.
const rows = [
  { deal_id: "hidden", status: "ACTIVE", source_url: "https://merchant.example/hidden" },
  { deal_id: "public", status: "NEW", source_url: "https://merchant.example/public" },
  { deal_id: "restored", status: "ACTIVE", source_url: "https://merchant.example/restored" },
  { deal_id: "expired", status: "EXPIRED", source_url: "https://merchant.example/expired" },
  { deal_id: "synthetic", status: "ACTIVE", source_url: "https://merchant.example/CLAWDEALS%2DDEMO" },
].map(row => ({ ...row, title: row.deal_id, created_at: "2026-10-15T10:00:00Z", creator_agent_id: "agent" }));

function databaseFixture(moderationError = false) {
  const state = [{ entity_id: "hidden", hidden: true }, { entity_id: "restored", hidden: false }];
  const lookups: string[][] = [];
  const from = vi.fn((table: string) => {
    const filters = new Map<string, unknown>();
    let ids: string[] = [];
    let size = rows.length;
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => { filters.set(key, value); return chain; }),
      in: vi.fn((key: string, value: string[]) => {
        if (table === "moderation_states" && key === "entity_id") { ids = value; lookups.push(value); }
        return chain;
      }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn((value: number) => { size = value; return chain; }),
      maybeSingle: async () => ({ data: table === "deals"
        ? rows.find(row => row.deal_id === filters.get("deal_id"))
        : state.find(row => row.entity_id === filters.get("entity_id")), error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (table === "agents") return resolve({ data: [{ id: "agent" }], error: null });
        if (table === "deals") return resolve({ data: rows.slice(0, size), error: null });
        expect(table).toBe("moderation_states");
        expect(filters.get("entity_type")).toBe("deal");
        expect(filters.get("hidden")).toBe(true);
        return resolve(moderationError
          ? { data: null, error: { message: "moderation unavailable" } }
          : { data: state.filter(row => row.hidden && ids.includes(row.entity_id)), error: null });
      },
    };
    return chain;
  });
  vi.mocked(getSupabaseServiceClient).mockReturnValue({ from } as any);
  return { lookups };
}

afterEach(() => vi.clearAllMocks());

describe("owner deal public availability", () => {
  it("matches public detail visibility without dropping hidden or synthetic history", async () => {
    const { lookups } = databaseFixture();
    const result = await listDealsByOwner({ ownerId: "owner" });
    expect(result.items.map(row => row.deal_id)).toEqual(rows.map(row => row.deal_id));
    expect(result.items.map(row => row.public_available)).toEqual([false, true, true, true, false]);
    expect(lookups).toEqual([rows.map(row => row.deal_id)]);
    for (const row of result.items) {
      expect(row.public_available).toBe((await getPublicDeal(row.deal_id)) !== null);
      expect(row).not.toHaveProperty("source_url");
      expect(row).not.toHaveProperty("hidden");
    }
  });

  it("keeps the owner cursor and only checks moderation for the returned page", async () => {
    const { lookups } = databaseFixture();
    const result = await listDealsByOwner({ ownerId: "owner", limit: 2 });
    expect(result.items.map(row => row.deal_id)).toEqual(["hidden", "public"]);
    expect(lookups).toEqual([["hidden", "public"]]);
    expect(JSON.parse(Buffer.from(result.nextCursor!, "base64").toString())).toMatchObject({ deal_id: "public" });
  });

  it("does not claim public availability when moderation cannot be read", async () => {
    databaseFixture(true);
    await expect(listDealsByOwner({ ownerId: "owner" })).rejects.toThrow();
  });
});
