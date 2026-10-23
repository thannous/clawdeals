import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { composeProjectPlan, type ProjectBrief, type ProjectCandidate } from "../../shared/project-missions";

// PostgreSQL state/privilege/race contracts cannot be proven by browser mocks.
const migration = readFileSync(new URL("../../../supabase/migrations/20261023163719_project_office_missions_v1.sql", import.meta.url), "utf8");
const O = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const BUYER = "20000000-0000-4000-8000-000000000001";
const M = "30000000-0000-4000-8000-000000000001";
const sellerOwner = (index: number) => `10000000-0000-4000-8000-00000000001${index}`;
const sellerAgent = (index: number) => `20000000-0000-4000-8000-00000000001${index}`;
const listingId = (index: number) => `40000000-0000-4000-8000-00000000001${index}`;
const brief: ProjectBrief = { version: 1, use_case: "home_office", description: "Bureau privé", budget_cents: 50000, market_code: "FR", currency: "EUR", location: { lat: 48.85, lon: 2.35, radius_km: 20, label: "Paris" }, desk_max_width_cm: 140, desk_max_depth_cm: 80, laptop_connector: "HDMI", pickup_by: "2027-10-25", optional_slots: [] };

describe("project missions PostgreSQL consent and contact transactions", () => {
  let db: PGlite;
  let plan: ReturnType<typeof composeProjectPlan>;
  let snapshots: any[];
  let facts: Record<string, any>;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table owners(owner_id uuid primary key,suspended_at timestamptz);
      create table agents(id uuid primary key,owner_id uuid references owners,suspended_at timestamptz);
      create table listings(listing_id uuid primary key,seller_agent_id uuid references agents,owner_id text,title text,description text,category text,price_amount numeric,currency text,market_code text,status text,updated_at timestamptz,geo_lat numeric,geo_lng numeric,delivery_method text);
      create table moderation_states(entity_type text,entity_id uuid,hidden boolean,primary key(entity_type,entity_id));
      create table policies(owner_id uuid primary key references owners,version integer,policy_json jsonb);
      create table threads(thread_id uuid primary key default gen_random_uuid(),thread_type text,listing_id uuid references listings,owner_id text,buyer_agent_id uuid references agents,seller_agent_id uuid references agents,status text,control_owner_id uuid,control_agent_id uuid,unique(listing_id,buyer_agent_id));
      create table messages(message_id uuid primary key default gen_random_uuid(),thread_id uuid references threads,sender_id uuid,sender_type text,body text,type text,payload jsonb,redacted boolean,created_at timestamptz default now());
      grant select,insert,update,delete on all tables in schema public to service_role;
    `);
    await db.exec(migration);
  }, 30000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("reset role; truncate owners,agents,listings,moderation_states,policies,threads,messages,project_missions cascade");
    await db.query("insert into owners(owner_id) values($1),($2)", [O, OTHER]);
    await db.query("insert into agents(id,owner_id) values($1,$2)", [BUYER,O]);
    for (let index=0; index<3; index++) {
      await db.query("insert into owners(owner_id) values($1)", [sellerOwner(index)]);
      await db.query("insert into agents(id,owner_id) values($1,$2)", [sellerAgent(index),sellerOwner(index)]);
      await db.query("insert into listings values($1,$2,$3,$4,null,null,100,'EUR','FR','LIVE','2026-10-20T00:00:00Z',48.85,2.35,'PICKUP')", [listingId(index),sellerAgent(index),sellerOwner(index),["Bureau","Chaise","Écran"][index]]);
    }
    await seedMission(true);
    await db.exec("set role service_role");
  });
  async function seedMission(complete: boolean) {
    snapshots = (await db.query<any>("select to_jsonb(l) as item from listings l order by listing_id")).rows.map(row => row.item);
    const candidates: ProjectCandidate[] = snapshots.map((listing, index) => ({ listing_id: listing.listing_id, seller_agent_id: listing.seller_agent_id, title: listing.title, slot: (["desk","chair","monitor"] as const)[index], price_cents: 10000, market_code: "FR", currency: "EUR", status: "LIVE", updated_at: listing.updated_at, distance_km: 0, delivery_method: "PICKUP", facts: complete ? { provenance: "user_confirmed", confirmed_at: "2026-10-21T00:00:00Z", delivery_fee_cents: 0, desk_width_cm: 120, desk_depth_cm: 60, connectors: ["HDMI"], pickup_available_by: "2026-10-24" } : null }));
    plan = composeProjectPlan(brief,candidates);
    facts = Object.fromEntries(candidates.filter(item=>item.facts).map(item=>[item.listing_id,{ snapshot:snapshots.find(s=>s.listing_id===item.listing_id),facts:item.facts }]));
    await db.query("insert into project_missions(id,owner_id,agent_id,creation_key,brief,plan,facts,catalog_snapshots) values($1,$2,$3,$1,$4,$5,$6,$7) on conflict(id) do update set plan=excluded.plan,facts=excluded.facts,catalog_snapshots=excluded.catalog_snapshots", [M,O,BUYER,brief,plan,facts,JSON.stringify(snapshots)]);
  }
  async function mission() { return (await db.query<any>("select to_jsonb(m) as value from project_missions m where id=$1",[M])).rows[0].value; }
  async function apply(action: string, version: number, overrides: any = {}) {
    const config = plan.configurations[0];
    const policies = config.seller_groups.map(group => ({ owner_id: snapshots.find(item=>item.seller_agent_id===group.seller_agent_id).owner_id, snapshot: null }));
    const messages = config.seller_groups.map(group=>({ seller_agent_id: group.seller_agent_id,listing_ids:group.listing_ids,text:group.draft_message,content_key:createHash("sha256").update(JSON.stringify(group)).digest("hex") }));
    const args = [overrides.owner ?? O,M,version,action,overrides.plan ?? plan,JSON.stringify(overrides.snapshots ?? snapshots),overrides.facts ?? facts,config.id,JSON.stringify(overrides.policies ?? policies),JSON.stringify(messages)];
    return (await db.query<any>("select update_project_mission_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as value",args)).rows[0].value;
  }
  it("limits table and RPC access to service_role and prevents another owner reading through the RPC", async () => {
    expect((await apply("select",1,{ owner:OTHER })).error).toBe("NOT_FOUND");
    await db.exec("set role anon");
    await expect(db.query("select * from project_missions")).rejects.toThrow(/permission denied/);
    await expect(apply("select",1)).rejects.toThrow(/permission denied/);
    await db.exec("set role authenticated");
    await expect(db.query("select * from project_missions")).rejects.toThrow(/permission denied/);
  });
  it("only one of two competing selections can use a version, then confirms the exact complete all-in plan", async () => {
    const results = await Promise.all([apply("select",1),apply("select",1)]);
    expect(results.filter(result=>!result.error && result.mission?.status==="SELECTED")).toHaveLength(1);
    expect(results.filter(result=>result.error==="VERSION_CONFLICT")).toHaveLength(1);
    const confirmed = await apply("confirm",2);
    expect(confirmed.mission).toMatchObject({ status:"CONFIRMED",version:3,confirmed_version:3 });
  });
  it("permits owner-approved questions with unknown facts but refuses basket confirmation", async () => {
    await seedMission(false);
    expect((await apply("select",1)).mission.status).toBe("SELECTED");
    expect((await apply("confirm",2)).error).toBe("PLAN_INCOMPLETE");
    const sent=await apply("contact",2);
    expect(sent.sent_messages).toHaveLength(3);
    expect(sent.mission.status).toBe("SELECTED");
    expect(sent.mission.confirmed_at).toBeNull();
  });
  it("persists messages and receipts exactly once despite concurrent sends and new idempotency keys", async () => {
    await apply("select",1);
    const sent = await Promise.all([apply("contact",2),apply("contact",2)]);
    expect(sent.map(result=>result.sent_messages.length).sort()).toEqual([0,3]);
    expect((await db.query("select * from messages")).rows).toHaveLength(3);
    expect((await mission()).contacts).toHaveLength(3);
    await apply("confirm",2);
    expect((await apply("contact",3)).sent_messages).toEqual([]);
  });
  it("rolls back the whole multi-seller batch when a later existing conversation is closed", async () => {
    await apply("select",1);
    const last = plan.configurations[0].seller_groups.at(-1)!;
    await db.query("insert into threads(thread_type,listing_id,owner_id,buyer_agent_id,seller_agent_id,status) values('MARKETPLACE',$1,$2,$3,$4,'CLOSED')",[last.listing_ids[0],sellerOwner(2),BUYER,last.seller_agent_id]);
    await expect(apply("contact",2)).rejects.toThrow("PROJECT_THREAD_UNAVAILABLE");
    expect((await db.query("select * from messages")).rows).toEqual([]);
    expect((await mission()).contacts).toEqual([]);
  });
  it.each(["price","status","hidden"])("revokes confirmed consent immediately on %s changes and rejects delayed contact", async change => {
    await apply("select",1);
    await apply("confirm",2);
    if (change==="price") await db.query("update listings set price_amount=120 where listing_id=$1",[listingId(0)]);
    if (change==="status") await db.query("update listings set status='REMOVED' where listing_id=$1",[listingId(0)]);
    if (change==="hidden") await db.query("insert into moderation_states values('listing',$1,true)",[listingId(0)]);
    expect(await mission()).toMatchObject({ status:"DRAFT",confirmed_version:null,confirmed_at:null,selected_configuration_id:null });
    expect((await apply("contact",3)).error).toBe("VERSION_CONFLICT");
    expect((await db.query("select * from messages")).rows).toEqual([]);
  });
  it("checks snapshots even when a timestamp-only change did not trigger proactive invalidation", async () => {
    await apply("select",1);
    await db.query("update listings set updated_at='2026-10-23T00:00:00Z' where listing_id=$1",[listingId(0)]);
    expect((await apply("contact",2)).error).toBe("CATALOG_CHANGED");
    expect((await mission()).status).toBe("DRAFT");
  });
  it.each(["owner","agent","seller"])("blocks %s suspension before any contact", async target => {
    await apply("select",1);
    if (target==="owner") await db.query("update owners set suspended_at=now() where owner_id=$1",[O]);
    if (target==="agent") await db.query("update agents set suspended_at=now() where id=$1",[BUYER]);
    if (target==="seller") await db.query("update agents set suspended_at=now() where id=$1",[sellerAgent(0)]);
    expect((await apply("contact",2)).error).toBe(target==="owner"?"OWNER_SUSPENDED":target==="agent"?"AGENT_SUSPENDED":"CATALOG_CHANGED");
    expect((await db.query("select * from messages")).rows).toEqual([]);
  });
  it("rejects a seller policy inserted after the preview policy check", async () => {
    await apply("select",1);
    await db.query("insert into policies values($1,1,$2)",[sellerOwner(0),{denylist_agent_ids:[BUYER]}]);
    expect((await apply("contact",2)).error).toBe("POLICY_CHANGED");
    expect((await db.query("select * from messages")).rows).toEqual([]);
  });
  it("recomputes the sum instead of trusting a stale ready flag or displayed total", async () => {
    const config=plan.configurations[0];
    config.items[0].facts!.quoted_price_cents=50000;
    facts[config.items[0].listing_id].facts.quoted_price_cents=50000;
    await db.query("update project_missions set plan=$1,facts=$2 where id=$3",[plan,facts,M]);
    await apply("select",1);
    expect((await apply("confirm",2)).error).toBe("PLAN_INCOMPLETE");
  });
  it.each(["confirm", "contact"])("revokes consent and rejects %s when the project deadline passed in France", async action => {
    await apply("select",1);
    await db.query("update project_missions set brief=jsonb_set(brief,'{pickup_by}',to_jsonb(((clock_timestamp() at time zone 'Europe/Paris')::date-1)::text)) where id=$1",[M]);
    const result = await apply(action,2);
    expect(result.error).toBe("PROJECT_DEADLINE_EXPIRED");
    expect(result.mission).toMatchObject({ status:"DRAFT", selected_configuration_id:null, confirmed_at:null, confirmed_version:null, version:3 });
    expect((await db.query("select * from messages")).rows).toEqual([]);
  });
});
