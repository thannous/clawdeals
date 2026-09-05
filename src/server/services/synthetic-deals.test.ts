import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));
import { getSupabaseServiceClient } from "../db/supabase";
import { listDeals } from "./deals-list";
import { getPublicDeal } from "./public-deals";
import { createDeal } from "./deals";
import { isSyntheticDealSource, assertPublishableDealSource } from "../utils/synthetic-deal";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("synthetic merchant offers", () => {
  it.each(["clawdeals-demo", "clawdeals_demo", "sandbox-seed", "CLAWDEALS%2DDEMO"])("recognizes %s", (marker) => {
    expect(isSyntheticDealSource(`https://merchant.example/product?tag=${marker}`)).toBe(true);
    expect(isSyntheticDealSource("https://merchant.example/real-product")).toBe(false);
  });

  it("rejects publication before any production database write, while allowing sandbox fixtures", async () => {
    vi.stubEnv("CLAWDEALS_ENV", "production");
    await expect(createDeal({ sourceUrl: "https://merchant.example/clawdeals-demo" } as any)).rejects.toMatchObject({ status: 400 });
    expect(getSupabaseServiceClient).not.toHaveBeenCalled();
    vi.stubEnv("CLAWDEALS_ENV", "sandbox");
    expect(() => assertPublishableDealSource("https://merchant.example/sandbox-seed")).not.toThrow();
  });

  it.each(["new", "temp", "trend"])("refills %s pages without skipping real offers", async (sort) => {
    const rows = ["clawdeals-demo", "sandbox-seed", "real-one", "real-two", "real-three"].map((slug, i) => ({
      deal_id: String(i), source_url: `https://merchant.example/${slug}`, status: "ACTIVE",
      created_at: "2026-09-05T00:00:00Z", temperature: 10, trend_score: 10
    }));
    const client = {
      rpc: vi.fn(async (_name, args) => {
        const start = args.p_cursor_deal_id == null ? 0 : Number(args.p_cursor_deal_id) + 1;
        return { data: rows.slice(start, start + args.p_limit), error: null };
      }),
      from: vi.fn(() => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }))
    };
    vi.mocked(getSupabaseServiceClient).mockReturnValue(client as any);
    const first = await listDeals({ sort, limit: 2 });
    expect(first.items.map((row) => row.deal_id)).toEqual(["2", "3"]);
    const cursor = JSON.parse(Buffer.from(first.nextCursor!, "base64").toString());
    const second = await listDeals({ sort, limit: 2, cursor });
    expect(second.items.map((row) => row.deal_id)).toEqual(["4"]);
    expect(second.nextCursor).toBeNull();
  });

  it("does not expose a fixture through its public detail URL", async () => {
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({
      data: { status: "ACTIVE", source_url: "https://merchant.example/clawdeals_demo" }, error: null
    }) };
    vi.mocked(getSupabaseServiceClient).mockReturnValue({ from: () => chain } as any);
    expect(await getPublicDeal("fixture-id")).toBeNull();
  });
});
