import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../../supabase/migrations/20261107000000_listing_geo_privacy_v1.sql", import.meta.url), "utf8");

describe("public listing geo SQL", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    // PGlite does not include PostGIS. These local functions preserve the SQL
    // contract and approximate metre distances for the near-equator fixtures.
    await db.exec(`
      create schema extensions;
      create type listing_status as enum ('LIVE', 'DRAFT');
      create type report_entity_type as enum ('listing', 'deal');
      create domain geography as point;
      create function st_makepoint(double precision, double precision) returns point language sql immutable as 'select point($1,$2)';
      create function st_setsrid(point, integer) returns point language sql immutable as 'select $1';
      create function st_distance(geography, geography) returns double precision language sql immutable as
        'select sqrt((($1[0] - $2[0]) * 111320)^2 + (($1[1] - $2[1]) * 111320)^2)';
      create function st_dwithin(geography, geography, double precision) returns boolean language sql immutable as
        'select st_distance($1,$2) <= $3';
      create table listings (
        listing_id uuid primary key, title text, category text, condition text,
        price_amount int, currency char(3), status listing_status,
        seller_agent_id uuid, delivery_method text, created_at timestamptz,
        geo_lat double precision, geo_lng double precision, geo_point geography,
        search_tsv tsvector
      );
      create table moderation_states(entity_type report_entity_type, entity_id uuid, hidden boolean);
    `);
    await db.exec(migration);
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("uses rounded coordinates for distance, radius membership and cursor ordering", async () => {
    await db.exec(`
      insert into listings(listing_id,title,category,condition,price_amount,currency,status,created_at,geo_lat,geo_lng,geo_point,search_tsv)
      values
        ('00000000-0000-4000-8000-000000000001','inside','other','USED',1,'EUR','LIVE',now(),0,0.0049,point(0.0049,0),'inside'::tsvector),
        ('00000000-0000-4000-8000-000000000002','outside','other','USED',1,'EUR','LIVE',now(),0,0.0051,point(0.0051,0),'outside'::tsvector),
        ('00000000-0000-4000-8000-000000000003','hidden','other','USED',1,'EUR','LIVE',now(),0,0.001,point(0.001,0),'hidden'::tsvector);
      insert into moderation_states values('listing','00000000-0000-4000-8000-000000000003',true);
    `);
    const result = await db.query<{ title: string; distance_m: number }>(`
      select title,distance_m from list_listings_geo_v1(
        p_lat => 0::double precision, p_lng => 0::double precision,
        p_distance_km => 1
      )`);
    expect(result.rows).toEqual([{ title: "inside", distance_m: 0 }]);

    const all = await db.query<{ title: string; distance_m: number }>(`
      select title,distance_m from list_listings_geo_v1(
        p_lat => 0::double precision, p_lng => 0::double precision
      )`);
    expect(all.rows.map((row) => row.title)).toEqual(["inside", "outside"]);
    expect(all.rows[1].distance_m).toBeGreaterThan(1000);
  });
});
