import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const bin = process.env.PG_FIXTURE_BIN;
const read = (name) => fs.readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
const views = {
  acquisition_funnel_summary: "20260810113000_acquisition_revenue_attribution_v1.sql",
  acquisition_revenue_attribution_summary: "20260810113000_acquisition_revenue_attribution_v1.sql",
  ops_obs_market_gauges_v1: "20260716101211_launch_markets_fr_gb_es.sql",
  ops_obs_queue_depth_gauges_v1: "20260709100000_watchlist_match_queue_observability_v1.sql",
  ops_sli_api_write_journeys_daily_v1: "20260209200000_ti_288_sli_dashboard_views_v1.sql",
  ops_sli_approvals_resolve_daily_v1: "20260209200000_ti_288_sli_dashboard_views_v1.sql",
};
const columns = {
  acquisition_funnel_events: "acquisition_id uuid,occurred_at timestamptz,event_name text,landing_path text,locale text,market_code text,source text,medium text,campaign text,channel text,cta_location text,interaction_type text",
  acquisition_revenue_attributions: "escrow_id uuid,acquisition_id uuid,occurred_at timestamptz,currency text,gross_volume_minor bigint,platform_revenue_minor bigint,attribution_model text",
  deals: "deal_id uuid,market_code text",
  listings: "listing_id uuid,market_code text",
  watchlists: "market_code text,active boolean,deleted_at timestamptz",
  watchlist_matches: "matched_at timestamptz,entity_type text,entity_id uuid",
  watchlist_match_queue: "updated_at timestamptz,entity_type text,entity_id uuid",
  notification_outbox: "status text,last_error text,entity_type text,entity_id uuid",
  approvals: "state public.approval_state,created_at timestamptz,resolved_at timestamptz",
  trustscore_recalc_queue: "updated_at timestamptz",
  watchlist_backfill_queue: "updated_at timestamptz",
  audit_logs: "occurred_at timestamptz,action jsonb,request jsonb",
};

test("native PG17 invoker views preserve restrictive filters and private boundaries", {
  skip: !bin && "Set PG_FIXTURE_BIN to verified official PostgreSQL 17 binaries",
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-views-native-"));
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  fs.mkdirSync(socket);
  // A clean environment prevents ambient PGHOST/PGSERVICE/PGPASSWORD settings
  // from directing any client to an existing or remote database.
  const env = { PATH: process.env.PATH, HOME: root, LANG: "C", LC_ALL: "C" };
  const run = (name, args, input) => spawnSync(path.join(bin, name), args, { input, env, encoding: "utf8", timeout: 30000 });
  const checked = (name, args, input) => {
    const result = run(name, args, input);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  };
  let started = false;
  try {
    assert.match(checked("postgres", ["--version"]), /PostgreSQL\) 17\./);
    checked("initdb", ["-D", data, "--no-locale", "--username=fixture_owner"]);
    checked("pg_ctl", ["-D", data, "-l", path.join(root, "server.log"), "-o", `-c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"]);
    started = true;
    const args = ["-X", "-h", socket, "-U", "fixture_owner", "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"];
    const query = (sql) => checked("psql", [...args, "-c", sql]);
    const apply = (sql) => checked("psql", [...args, "-f", "-"], sql);
    const app = (sql) => query(`set role clawdeals_app; ${sql}`);
    const denied = (sql, pattern = /permission denied/) => {
      const result = run("psql", [...args, "-c", sql]);
      assert.notEqual(result.status, 0); assert.match(result.stderr, pattern);
    };
    apply(`create role clawdeals_app nologin nosuperuser nobypassrls noinherit;
      create role anon; create role authenticated;
      create schema private; revoke all on schema public,private from public;
      grant usage on schema public to anon,authenticated;
      revoke temporary on database postgres from public;
      create table private.secret(value text); insert into private.secret values('synthetic');
      create type public.approval_state as enum ('PENDING','APPROVED');`);
    for (const [name, definition] of Object.entries(columns)) {
      apply(`create table public.${name}(${definition},fixture_visible boolean,fixture_secret text);
        alter table public.${name} enable row level security;
        alter table public.${name} force row level security;
        create policy deny_all_anon_authenticated on public.${name} to anon,authenticated using(false) with check(false);`);
    }
    // Repository view bodies reviewed against source DDL, not a dump import.
    for (const [name, migration] of Object.entries(views)) {
      const match = read(`supabase/migrations/${migration}`).match(new RegExp(`create(?: or replace)? view public\\.${name}\\b[\\s\\S]*?;`, "i"));
      assert(match, name); apply(match[0]);
      query(`alter view public.${name} set(security_invoker=true)`);
    }
    const candidate = read("scripts/migration/neon-view-role-plan.sql");
    apply(candidate);
    assert.equal(query("select has_table_privilege('clawdeals_app','acquisition_funnel_summary','SELECT')"), "f", "candidate rolls back");
    const grantPlan = candidate.replace("ROLLBACK; -- Review candidate: archive binding and app policy authorization required.", "COMMIT;");
    // Reject owner semantics or missing RLS, rather than silently repairing them.
    query("alter view acquisition_funnel_summary set(security_invoker=false)");
    assert.notEqual(run("psql", [...args, "-f", "-"], grantPlan).status, 0);
    query("alter view acquisition_funnel_summary set(security_invoker=true)");
    query("alter table deals no force row level security");
    assert.notEqual(run("psql", [...args, "-f", "-"], grantPlan).status, 0);
    query("alter table deals force row level security; alter role clawdeals_app bypassrls");
    assert.notEqual(run("psql", [...args, "-f", "-"], grantPlan).status, 0);
    query("alter role clawdeals_app nobypassrls");
    // Grants without policies still default-deny a NOBYPASS caller.
    apply(grantPlan.replace(/^CREATE POLICY clawdeals_view_app_read.*;$/gm, ""));
    for (const visible of [true, false]) {
      const id = visible ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002";
      apply(`insert into acquisition_funnel_events values('${id}',now(),'landing_view','/','fr','FR','synthetic','test','campaign','web',null,null,${visible},'private');
        insert into acquisition_revenue_attributions values('${id}','${id}',now(),'EUR',100,10,'first_touch',${visible},'private');
        insert into deals values('${id}','FR',${visible},'private');
        insert into listings values('${id}','FR',${visible},'private');
        insert into watchlists values('FR',true,null,${visible},'private');
        insert into watchlist_matches values(now(),'deal','${id}',${visible},'private');
        insert into watchlist_match_queue values(now(),'deal','${id}',${visible},'private');
        insert into notification_outbox values('PENDING','synthetic error','deal','${id}',${visible},'private');
        insert into approvals values('PENDING',now()-interval '1 hour',now(),${visible},'private');
        insert into trustscore_recalc_queue values(now(),${visible},'private');
        insert into watchlist_backfill_queue values(now(),${visible},'private');
        insert into audit_logs values(now(),'{"event":"deal.create"}','{"status_code":201,"duration_ms":100}',${visible},'private');`);
    }
    for (const name of Object.keys(views)) app(`select * from ${name}`);
    assert.equal(app("select count(*) from acquisition_funnel_summary"), "0");
    assert.equal(app("select sum(depth) from ops_obs_queue_depth_gauges_v1"), "0");
    assert.equal(app("select sum(deals_total) from ops_obs_market_gauges_v1"), "0");
    apply(grantPlan);
    assert.equal(app("select count(*) from acquisition_funnel_summary"), "2", "explicit global server read parity");
    // This restrictive test policy is NOT a proposed production tenant policy.
    for (const name of Object.keys(columns)) query(`create policy fixture_filtered on ${name} as restrictive for select to clawdeals_app using(fixture_visible)`);
    assert.equal(app("select count(*) from acquisition_funnel_summary"), "1");
    assert.equal(app("select count(*) from acquisition_revenue_attribution_summary where source='synthetic'"), "1");
    assert.equal(app("select deals_total||','||listings_total||','||watchlists_active||','||match_queue_depth||','||matches_24h||','||notifications_pending||','||notification_errors from ops_obs_market_gauges_v1 where market_code='FR'"), "1,1,1,1,1,1,1");
    assert.equal(app("select string_agg(depth::text,',' order by queue_name) from ops_obs_queue_depth_gauges_v1"), "1,1,1,1");
    assert.equal(app("select total_requests||','||success_requests||','||p95_duration_ms from ops_sli_api_write_journeys_daily_v1"), "1,1,100");
    assert.equal(app("select resolved_approvals||','||p95_resolve_seconds from ops_sli_approvals_resolve_daily_v1"), "1,3600");
    assert.equal(query("select count(*) from acquisition_funnel_summary"), "2", "owner sees both fixtures, invoker does not");
    query("revoke select on acquisition_funnel_summary from clawdeals_app");
    denied("set role clawdeals_app; select * from acquisition_revenue_attribution_summary");
    query("grant select on acquisition_funnel_summary to clawdeals_app");
    query("revoke select(event_name) on acquisition_funnel_events from clawdeals_app");
    denied("set role clawdeals_app; select * from acquisition_revenue_attribution_summary");
    query("grant select(event_name) on acquisition_funnel_events to clawdeals_app");
    assert.equal(app("select count(*) from acquisition_revenue_attribution_summary"), "1");
    for (const name of Object.keys(columns)) {
      denied(`set role clawdeals_app; select fixture_secret from ${name}`);
      denied(`set role clawdeals_app; update ${name} set fixture_secret='changed'`);
    }
    for (const role of ["clawdeals_app", "anon", "authenticated"]) {
      denied(`set role ${role}; select * from private.secret`);
      for (const name of Object.keys(views)) if (role !== "clawdeals_app") denied(`set role ${role}; select * from ${name}`);
    }
    denied("set role clawdeals_app; create table public.bad(id int)");
    denied("set role clawdeals_app; create temporary table bad(id int)");
    assert.equal(query("select bool_and(reloptions @> array['security_invoker=true']) from pg_class where relkind='v' and relnamespace='public'::regnamespace"), "t");
  } finally {
    if (started) checked("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
