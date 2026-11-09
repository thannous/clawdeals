import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createNeonDataClient } from "./neon-client";

describe("source-shaped deals without optional media columns", () => {
  let db: PGlite;
  let client: ReturnType<typeof createNeonDataClient>;
  beforeAll(async () => {
    db = new PGlite();
    client = createNeonDataClient(async (sql, params) => (await db.query(sql, params)).rows);
    // Minimal synthetic fixture of the relevant reviewed production shape:
    // neither images nor cover_image_index exists. Not a full source import.
    await db.exec("create table deals(deal_id text primary key,title text not null,status text not null default 'NEW')");
  }, 30000);
  beforeEach(async () => { await db.exec("truncate deals; insert into deals values('existing','Original','NEW')"); });
  afterAll(async () => { await db?.close(); });
  const isMissingMedia = (error: any) => typeof error?.message === "string" &&
    (error.message.includes("images") || error.message.includes("cover_image_index")) &&
    (error.message.includes("does not exist") || error.message.toLowerCase().includes("schema cache"));

  it("normalizes only the exact composite-column 42703 error and preserves details", async () => {
    for (const input of [
      { code: "42703", message: 'column "images" not found in data type deals', expected: 'column "images" does not exist in data type deals' },
      { code: "42501", message: 'column "images" not found in data type deals' },
      { code: "42703", message: 'prefix column "images" not found in data type deals' },
      { code: "42703", message: 'column "images" does not exist' },
      { code: "42703", message: 'column "images" not found in data type deals\nadditional detail' }
    ]) {
      const failing = createNeonDataClient(async () => { throw { code: input.code, message: input.message, detail: "original detail", hint: "original hint" }; });
      const result = await failing.from("deals").select("title");
      expect(result.error).toEqual({ code: input.code, message: input.expected || input.message, details: "original detail", hint: "original hint" });
    }
  });
  it.each(["images", "cover_image_index"])("SELECT missing %s fails with the existing fallback-compatible error", async (field) => {
    const result = await client.from("deals").select(`deal_id,title,${field}`).eq("deal_id", "existing").maybeSingle();
    expect(result.error).toMatchObject({ code: "42703" });
    expect(isMissingMedia(result.error), result.error?.message).toBe(true);
    expect(result.data).toBeNull();
    expect(await client.from("deals").select("deal_id,title").eq("deal_id", "existing").maybeSingle())
      .toMatchObject({ error: null, data: { deal_id: "existing", title: "Original" } });
  });
  it.each([null, [{ url: "https://example.invalid/media.jpg" }]])("INSERT rejects absent media keys even when value is %j", async (images) => {
    const result = await client.from("deals").insert({ deal_id: "new", title: "New", images, cover_image_index: images ? 0 : null }).select().single();
    expect(result.error).toMatchObject({ code: "42703" });
    expect(isMissingMedia(result.error), result.error?.message).toBe(true);
    expect((await db.query("select count(*)::int as n from deals where deal_id='new'")).rows).toEqual([{ n: 0 }]);
    // The real service retries only the no-requested-media case; requested media
    // maps this same error to FEATURE_UNAVAILABLE instead of discarding fields.
    if (images === null) expect(await client.from("deals").insert({ deal_id: "new", title: "New" }).select().single())
      .toMatchObject({ error: null, data: { deal_id: "new", title: "New" } });
  });
  it("UPDATE requested media fails atomically rather than partially changing title", async () => {
    const result = await client.from("deals").update({ title: "Changed", images: [{ url: "https://example.invalid/media.jpg" }] })
      .eq("deal_id", "existing").select("deal_id,title").maybeSingle();
    expect(result.error).toMatchObject({ code: "42703" });
    expect(isMissingMedia(result.error), result.error?.message).toBe(true);
    expect((await db.query("select title from deals")).rows).toEqual([{ title: "Original" }]);
  });
  it("non-media UPDATE with missing return projection rolls back before safe fallback", async () => {
    const result = await client.from("deals").update({ title: "Changed" }).eq("deal_id", "existing")
      .select("deal_id,title,images,cover_image_index").maybeSingle();
    expect(result.error).toMatchObject({ code: "42703" });
    expect(isMissingMedia(result.error), result.error?.message).toBe(true);
    expect((await db.query("select title from deals")).rows).toEqual([{ title: "Original" }]);
    expect(await client.from("deals").update({ title: "Changed" }).eq("deal_id", "existing").select("deal_id,title").maybeSingle())
      .toMatchObject({ error: null, data: { deal_id: "existing", title: "Changed" } });
  });
});
