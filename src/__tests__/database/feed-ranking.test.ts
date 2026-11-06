import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrations = new URL("../../../supabase/migrations/", import.meta.url);
const asOf = "2026-02-10T12:00:00Z";
const earlier = "2026-02-10T00:00:00Z";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// Run the current feed RPCs against PostgreSQL. Other statements in the same
// migrations install unrelated geographic functions that require PostGIS.
function rankingRpc(name: string) {
  const change = new RegExp(
    `^\\s*(create(?:\\s+or\\s+replace)?|drop)\\s+function\\s+(?:if\\s+exists\\s+)?(?:public\\.)?${name}\\s*\\(`, "gim"
  );
  for (const file of readdirSync(migrations).filter((entry) => entry.endsWith(".sql")).sort().reverse()) {
    const sql = readFileSync(new URL(file, migrations), "utf8");
    const last = [...sql.matchAll(change)].at(-1);
    if (!last) continue;
    if (last[1].toLowerCase() === "drop") break;
    const body = sql.slice(last.index).match(/^[\s\S]*?\bas\s+(\$\w*\$)[\s\S]*?\1[^;]*;/i);
    if (!body) throw new Error(`Cannot read the definition of ${name} in ${file}`);
    return body[0];
  }
  throw new Error(`No current ranking RPC: ${name}`);
}

describe("feed ranking and pagination on PostgreSQL", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create type report_entity_type as enum ('deal', 'listing');
      create type listing_status as enum ('LIVE', 'REMOVED');
      create type deal_status as enum ('ACTIVE', 'EXPIRED');
      create table moderation_states(entity_type report_entity_type, entity_id uuid, hidden boolean);
      create table agents(id uuid, trust_score integer, trust_flags jsonb);
      create table deals(
        deal_id uuid primary key, title text, source_url text, source_url_fingerprint text,
        price numeric, currency char(3), expires_at timestamptz, tags text[], status deal_status default 'ACTIVE',
        temperature integer, votes_up integer, votes_down integer, deal_type text, country char(2),
        merchant_name text, merchant_domain text, created_at timestamptz, active_at timestamptz, search_tsv tsvector
      );
      create table listings(
        listing_id uuid primary key, title text, category text, condition text, price_amount integer,
        currency char(3), status listing_status default 'LIVE', seller_agent_id uuid, delivery_method text,
        created_at timestamptz, search_tsv tsvector
      );
    `);
    await db.exec(rankingRpc("list_deals_trend_v0"));
    await db.exec(rankingRpc("list_listings_rank_v1"));
  }, 30_000);

  afterAll(async () => { await db?.close(); });

  it("orders active deals by recency and temperature, penalizes duplicate URLs and paginates ties", async () => {
    const deals = [
      [1, "unique-1", 80, earlier, asOf],
      [2, "unique-2", 80, asOf, asOf],
      [3, "same-url", 80, asOf, "2026-02-11T12:00:00Z"],
      [4, "same-url", 80, earlier, asOf],
      [5, "unique-5", 80, earlier, null],
      [6, "unique-6", 10, asOf, asOf],
      [7, "hidden", 100, asOf, asOf]
    ] as const;
    for (const [n, fingerprint, temperature, createdAt, activeAt] of deals) {
      await db.query("insert into deals(deal_id, source_url_fingerprint, temperature, created_at, active_at) values($1,$2,$3,$4,$5)",
        [id(n), fingerprint, temperature, createdAt, activeAt]);
    }
    await db.query("insert into moderation_states values('deal',$1,true)", [id(7)]);

    type DealRow = { deal_id: string; trend_score: number; rank_score: number; created_at: Date; active_at: Date | null };
    const page = (hidden = false, limit = 30, cursor?: DealRow) =>
      db.query<DealRow>(`
        select deal_id, trend_score::double precision, rank_score::double precision, created_at, active_at
        from list_deals_trend_v0(
          p_as_of => $1, p_include_hidden => $2, p_limit => $3, p_cursor_trend_score => $4,
          p_cursor_active_at => $5, p_cursor_created_at => $6, p_cursor_deal_id => $7
        )`, [asOf, hidden, limit, cursor?.trend_score ?? null, cursor?.active_at ?? null,
          cursor?.created_at ?? null, cursor?.deal_id ?? null]);
    const first = (await page(false, 1)).rows[0];
    expect(first).toMatchObject({ deal_id: id(3), trend_score: 180, rank_score: 180 });
    const next = (await page(false, 30, first)).rows;
    expect(next.map(({ deal_id, trend_score }) => [deal_id, trend_score])).toEqual([
      [id(2), 180], [id(1), 180], [id(4), 165], [id(5), 130], [id(6), 110]
    ]);
    expect((await page(true)).rows.at(-1)).toMatchObject({ deal_id: id(7), trend_score: -9800 });
  });

  it("ranks listings with seller trust and price fit, excludes hidden listings and resumes a score tie", async () => {
    for (const [n, trust, flags] of [[1, 50, []], [2, 80, []], [3, 90, ["restricted"]]] as const) {
      await db.query("insert into agents values($1,$2,$3)", [id(n), trust, JSON.stringify(flags)]);
    }
    const listings = [
      [1, 100, 1, asOf], [2, 100, 1, asOf], [3, 50, 1, asOf],
      [4, 100, 2, asOf], [5, 100, 3, asOf], [6, 100, 2, asOf], [7, 100, null, "2026-02-09T12:00:00Z"]
    ] as const;
    for (const [n, price, agent, createdAt] of listings) {
      await db.query("insert into listings(listing_id, price_amount, seller_agent_id, created_at) values($1,$2,$3,$4)",
        [id(n), price, agent ? id(agent) : null, createdAt]);
    }
    await db.query("insert into moderation_states values('listing',$1,true)", [id(6)]);
    type ListingRow = { listing_id: string; score: number; created_at: Date };
    const page = (options: { min?: number; max?: number; hidden?: boolean; limit?: number; cursor?: ListingRow } = {}) =>
      db.query<ListingRow>(`
        select listing_id, rank_score::double precision as score, created_at from list_listings_rank_v1(
          p_as_of => $1, p_status => 'LIVE', p_price_min => $2, p_price_max => $3, p_include_hidden => $4,
          p_limit => $5, p_cursor_rank_score => $6, p_cursor_created_at => $7, p_cursor_listing_id => $8
        )`, [asOf, options.min ?? null, options.max ?? null, options.hidden ?? false, options.limit ?? 50,
          options.cursor?.score ?? null, options.cursor?.created_at ?? null, options.cursor?.listing_id ?? null]);
    const range = { min: 50, max: 150 };
    const first = (await page({ ...range, limit: 2 })).rows;
    expect(first.map(({ listing_id, score }) => [listing_id, score])).toEqual([[id(4), 130], [id(2), 120]]);
    const next = (await page({ ...range, cursor: first[1] })).rows;
    expect(next.map(({ listing_id, score }) => [listing_id, score])).toEqual([
      [id(1), 120], [id(3), 110], [id(5), 60], [id(7), 60]
    ]);
    expect((await page()).rows[0]).toMatchObject({ listing_id: id(4), score: 120 });
    expect((await page({ ...range, hidden: true })).rows.at(-1)).toMatchObject({ listing_id: id(6), score: -9870 });
  });
});
