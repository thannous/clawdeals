import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createNeonDataClient } from "./neon-client";
// Fresh PostgreSQL evidence for the reconstructed compiler, not historical QA.
describe("Neon compiler PostgreSQL contracts", () => {
  let db: PGlite;
  let client: ReturnType<typeof createNeonDataClient>;
  beforeAll(async () => {
    db = new PGlite();
    client = createNeonDataClient(async (sql, params) => (await db.query(sql, params)).rows);
    await db.exec(`
      create table owners(owner_id text primary key,email_verified_at timestamptz,phone_verified_at timestamptz,secret text,suspended_at timestamptz);
      create table agents(id text primary key,owner_id text references owners,suspended_at timestamptz,secret text);
      create table api_keys(api_key_id text primary key,agent_id text references agents);
      create table agent_installations(installation_id text primary key,agent_id text references agents,owner_id text references owners);
      create table watchlists(watchlist_id text primary key,agent_id text references agents,title text,tags text[],metadata jsonb,amount integer default 7,created_at timestamptz default now());
      create function adapter_json(p_data jsonb) returns jsonb language sql as $$select p_data$$;
      create function adapter_null(p_data jsonb) returns boolean language sql as $$select p_data is null$$;
      create function adapter_rows(p_min integer default 0) returns setof watchlists language sql as $$select * from watchlists where amount>=p_min$$;
      create function adapter_scalar_set(p_data text[]) returns setof text language sql as $$select unnest(p_data)$$;
      create function adapter_composite(p_id text) returns watchlists language sql as $$select * from watchlists where watchlist_id=p_id$$;
      create function adapter_write() returns setof watchlists language sql as $$update watchlists set amount=amount+1 returning *$$;
      create function adapter_ambiguous(p_data text) returns text language sql as $$select p_data$$;
      create function adapter_ambiguous(p_data int) returns int language sql as $$select p_data$$;
    `);
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`truncate watchlists,api_keys,agent_installations,agents,owners;
      insert into owners values('owner',null,null,'owner-private',null),('other',null,null,'other-private',null);
      insert into agents values('a','owner',null,'agent-private'),('b','other',null,'other-private');
      insert into watchlists(watchlist_id,agent_id,title,amount,tags,metadata) values
        ('one','a','O''Reilly',1,ARRAY['x','y'],'{"mission":{"kind":"BUY"}}'),
        ('two','a','a,b',2,ARRAY['y'],'{}'),('three','b','Third',3,null,null);
      insert into api_keys values('key','a'),('orphan',null);
      insert into agent_installations values('install','a','owner');`);
  });
  it("preserves JSON/arrays/defaults and parameterizes hostile values", async () => {
    const result = await client.from("watchlists").insert({ watchlist_id: "new", title: "');drop table agents;--", tags: ["a,b"], metadata: [{ nested: true }] }).select().single();
    expect(result).toMatchObject({ error: null, data: { amount: 7, tags: ["a,b"], metadata: [{ nested: true }] } });
    expect(await client.from("watchlists").select().eq("title", "x' OR true --")).toMatchObject({ error: null, data: [] });
  });
  it("enforces inner owner joins without leaking related private fields", async () => {
    const result = await client.from("watchlists").select("*,agents!inner(owner_id,suspended_at)").eq("agents.owner_id", "owner").is("agents.suspended_at", null).order("amount", { ascending: false });
    expect(result.error).toBeNull();
    expect(result.data.map((row: any) => row.watchlist_id)).toEqual(["two", "one"]);
    expect(result.data[0].agents).toEqual({ owner_id: "owner", suspended_at: null });
  });
  it("supports whitespace left-joined auth relationships and null related rows", async () => {
    const result = await client.from("api_keys").select("api_key_id, agents ( owner_id, suspended_at )").order("api_key_id");
    expect(result).toMatchObject({ error: null, data: [{ api_key_id: "key", agents: { owner_id: "owner", suspended_at: null } }, { api_key_id: "orphan", agents: null }] });
    expect(await client.from("agents").select("id,owners(email_verified_at,phone_verified_at)").eq("id", "a").single()).toMatchObject({ error: null, data: { owners: { email_verified_at: null, phone_verified_at: null } } });
    expect(await client.from("agent_installations").select("installation_id,agents(owner_id),owners(owner_id,suspended_at)").single()).toMatchObject({ error: null, data: { agents: { owner_id: "owner" }, owners: { owner_id: "owner", suspended_at: null } } });
  });
  it("counts before an empty page and supports count-only mutation responses", async () => {
    expect(await client.from("watchlists").select("watchlist_id", { count: "exact" }).range(20, 21)).toMatchObject({ error: null, data: [], count: 3 });
    expect(await client.from("watchlists").update({ amount: 9 }).eq("agent_id", "a").select("*", { count: "exact", head: true })).toMatchObject({ error: null, data: null, count: 2 });
  });
  it("rolls back writes and writing RPCs when single cardinality fails", async () => {
    expect((await client.from("watchlists").update({ amount: 99 }).select().single()).error?.code).toBe("PGRST116");
    expect((await client.rpc("adapter_write").single()).error?.code).toBe("PGRST116");
    expect((await db.query("select amount from watchlists order by amount")).rows).toEqual([{ amount: 1 }, { amount: 2 }, { amount: 3 }]);
    expect(await client.from("watchlists").select().eq("watchlist_id", "absent").maybeSingle()).toMatchObject({ data: null, error: null });
  });
  it("keeps OR groups, quoted commas, JSON paths and array filters intact", async () => {
    expect(await client.from("watchlists").select("watchlist_id").or('title.eq."a,b",and(amount.gt.2,watchlist_id.eq.three)').order("amount")).toMatchObject({ error: null, data: [{ watchlist_id: "two" }, { watchlist_id: "three" }] });
    expect(await client.from("watchlists").select("watchlist_id").eq("metadata->mission->>kind", "BUY").contains("tags", ["x"]).overlaps("tags", ["y"])).toMatchObject({ error: null, data: [{ watchlist_id: "one" }] });
    expect(await client.from("watchlists").select().in("watchlist_id", [])).toMatchObject({ error: null, data: [] });
  });
  it("preserves scalar JSON, SQL NULL, scalar sets, composite and table RPC results", async () => {
    expect(await client.rpc("adapter_json", { p_data: [{ x: 1 }] })).toMatchObject({ error: null, data: [{ x: 1 }] });
    expect(await client.rpc("adapter_null", { p_data: null })).toMatchObject({ error: null, data: true });
    expect(await client.rpc("adapter_scalar_set", { p_data: ["a,b", "x"] })).toMatchObject({ error: null, data: ["a,b", "x"] });
    expect(await client.rpc("adapter_composite", { p_id: "one" }).single()).toMatchObject({ error: null, data: { watchlist_id: "one" } });
    expect((await client.rpc("adapter_rows", { p_min: 2 })).data).toHaveLength(2);
  });
  it("distinguishes missing and ambiguous RPCs and keeps database error codes", async () => {
    expect((await client.rpc("adapter_missing")).error.code).toBe("PGRST202");
    expect((await client.rpc("adapter_ambiguous", { p_data: "1" })).error.code).toBe("PGRST203");
    expect((await client.from("watchlists").insert({ watchlist_id: "one" })).error.code).toBe("23505");
  });
  it("implements conflict targets and fail-closed unsupported/aborted operations", async () => {
    expect(await client.from("watchlists").upsert({ watchlist_id: "one", amount: 10 }).select().single()).toMatchObject({ error: null, data: { amount: 10 } });
    expect(await client.from("watchlists").upsert({ watchlist_id: "one", amount: 99 }, { ignoreDuplicates: true }).select().maybeSingle()).toMatchObject({ error: null, data: null });
    expect((await client.from("watchlists").delete().eq("id;delete", 1)).error).not.toBeNull();
    expect((await client.from("watchlists").select("*,owners!inner(secret)")).error).not.toBeNull();
    const controller = new AbortController(); controller.abort();
    expect((await client.from("watchlists").delete().abortSignal(controller.signal)).error).not.toBeNull();
    expect((await db.query("select count(*)::int as n from watchlists")).rows).toEqual([{ n: 3 }]);
  });
});
