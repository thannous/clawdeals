import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("migration DDL preserves source link and allows both identities for one owner, with subject uniqueness", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create table owners(owner_id uuid primary key)");
    const original = await readFile("supabase/migrations/20260212090000_ti_340_owner_auth_links_v0.sql", "utf8");
    await db.exec(original.replace('create extension if not exists "pgcrypto";', ""));
    const owner = "11111111-1111-4111-8111-111111111111";
    const subject = "22222222-2222-4222-8222-222222222222";
    await db.query("insert into owners values ($1)", [owner]);
    await db.query("insert into owner_auth_links(owner_id,supabase_user_id) values($1,$2)", [owner, subject]);
    await db.exec(await readFile("supabase/migrations/20260807120103_generic_auth_identities.sql", "utf8"));
    const before = (await db.query("select * from owner_auth_links where supabase_user_id=$1", [subject])).rows;
    await db.query("insert into owner_auth_links(owner_id,auth_provider,auth_subject) values($1,'neon','fixture-neon')", [owner]);
    expect((await db.query("select * from owner_auth_links where supabase_user_id=$1", [subject])).rows).toEqual(before);
    expect((await db.query("select * from owner_auth_links where owner_id=$1", [owner])).rows).toHaveLength(2);
    await expect(db.query("insert into owner_auth_links(owner_id,auth_provider,auth_subject) values($1,'neon','fixture-neon')", [owner])).rejects.toMatchObject({ code: "23505" });
  } finally { await db.close(); }
});
