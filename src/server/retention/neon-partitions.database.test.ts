import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
describe("bounded Neon partition maintenance", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role clawdeals_app nologin nosuperuser nobypassrls noinherit;
      create role clawdeals_maintenance nologin nosuperuser nobypassrls noinherit;
      create schema private; revoke all on schema public,private from public;
      grant usage on schema public to clawdeals_app;
      create table audit_logs(id int,occurred_at timestamptz not null,outcome text,auth jsonb) partition by range(occurred_at);
      grant select,insert on audit_logs to clawdeals_app;
      create policy app_audit on audit_logs to clawdeals_app using(true) with check(true);`);
    // Actual repository function, verified against authorized schema-review.sql.
    const acquisition = readFileSync(new URL("../../../supabase/migrations/20260726221554_acquisition_funnel_v1.sql", import.meta.url), "utf8");
    const capture = acquisition.match(/create or replace function public\.capture_acquisition_d7_retention\(\)[\s\S]*?\$\$;/i);
    if (!capture) throw new Error("Missing source acquisition trigger function");
    await db.exec(capture[0]);
    await db.exec("revoke all on function public.capture_acquisition_d7_retention() from public; create trigger audit_logs_capture_acquisition_d7 after insert on public.audit_logs for each row execute function public.capture_acquisition_d7_retention()");
    const template = readFileSync(new URL("../../../scripts/migration/neon-partition-role-plan.sql", import.meta.url), "utf8");
    await db.exec(template.replace("ROLLBACK; -- Review template: imported privilege closure and owner changes require approval.", "COMMIT;"));
  }, 30000);
  afterAll(async () => { await db?.close(); });
  it("creates exactly current and next two UTC months through fixed wrapper, idempotently", async () => {
    await db.exec("revoke execute on function public.capture_acquisition_d7_retention() from clawdeals_maintenance; set role clawdeals_app");
    await expect(db.query("select public.ensure_audit_log_partitions()")).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role; grant execute on function public.capture_acquisition_d7_retention() to clawdeals_maintenance; set role clawdeals_app; set datestyle='SQL,DMY'");
    try {
      const first: any = (await db.query("select public.ensure_audit_log_partitions() as result")).rows[0];
      expect(first.result.partitions).toHaveLength(3);
      expect((await db.query("select public.ensure_audit_log_partitions() as result")).rows[0]).toEqual(first);
      await db.exec("insert into audit_logs(id,occurred_at,outcome) values(1,now(),'FAILURE')");
      expect((await db.query("select id from audit_logs")).rows).toEqual([{ id: 1 }]);
      await expect(db.query(`select * from public.${first.result.partitions[0]}`)).rejects.toMatchObject({ code: "42501" });
    } finally { await db.exec("reset role"); }
    expect((await db.query("select count(*)::int as n,bool_and(c.relforcerowsecurity) as forced from pg_inherits i join pg_class c on c.oid=i.inhrelid where inhparent='audit_logs'::regclass")).rows).toEqual([{ n: 3, forced: true }]);
  });
  it("denies private calls, arbitrary arguments, DDL, and owner role assumption", async () => {
    await db.exec("set role clawdeals_app");
    try {
      await expect(db.exec("select private.ensure_audit_log_partitions()" )).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec("select public.ensure_audit_log_partitions('other')")).rejects.toMatchObject({ code: "42883" });
      await expect(db.exec("create table public.unwanted(id int)")).rejects.toMatchObject({ code: "42501" });
      await expect(db.exec("alter table public.audit_logs disable row level security")).rejects.toMatchObject({ code: "42501" });
      expect((await db.query("select pg_has_role(current_user,'clawdeals_maintenance','MEMBER') as member")).rows).toEqual([{ member: false }]);
    } finally { await db.exec("reset role"); }
  });
});
