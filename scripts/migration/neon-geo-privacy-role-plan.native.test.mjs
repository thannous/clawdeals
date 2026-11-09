import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { renderRpcRoleReview } from "./render-rpc-role-review.mjs";

const bin = process.env.PG_FIXTURE_BIN;
const canonicalFile = process.env.NEON_CANONICAL_ROUTINES_FILE;
const signature = "public.list_listings_geo_v1(double precision,double precision,integer,boolean,integer,double precision,uuid,text,text,text,integer,integer)";
test("native geo role composition uses rounded positions with strict historical and replacement identities", { skip: (!bin || !canonicalFile) && "PG_FIXTURE_BIN and NEON_CANONICAL_ROUTINES_FILE required" }, () => {
  // Bind the complete private input before executing any captured SQL bytes.
  const canonicalBytes = fs.readFileSync(canonicalFile);
  assert.equal(createHash("sha256").update(canonicalBytes).digest("hex"), "e8dc9ea399f44d60ce891f842127d2d97ce6bffcf3c1114be1e6a8a55fefc8ef");
  const canonical = JSON.parse(canonicalBytes);
  const old = canonical.routines.find(r => r.schema === "public" && r.name === "list_listings_geo_v1");
  assert.equal(old.definition_sha256, "2a74270673a3ade4a5cbd8814ad8441fca05fcb5b24a4a31f78a1494a17ecee8");
  assert.equal(createHash("sha256").update(old.definition_review).digest("hex"), old.definition_sha256);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "neon-geo-role-"));
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  fs.mkdirSync(socket);
  const run = (name, args, input) => spawnSync(path.join(bin, name), args, { input, encoding: "utf8", timeout: 30000 });
  const checked = (name, args, input) => { const r = run(name, args, input); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  let started = false;
  try {
    checked("initdb", ["-D", data, "--auth=trust", "--no-locale", "--encoding=UTF8", "--username=fixture_owner"]);
    checked("pg_ctl", ["-D", data, "-l", path.join(root, "server.log"), "-o", `-c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"]); started = true;
    const args = ["-X", "-h", socket, "-U", "fixture_owner", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"];
    const q = sql => checked("psql", [...args, "-f", "-"], sql);
    const app = sql => checked("psql", [...args.map(a => a === "fixture_owner" ? "clawdeals_app" : a), "-f", "-"], sql);
    q(`CREATE ROLE clawdeals_app LOGIN NOINHERIT; CREATE ROLE clawdeals_schema_owner NOLOGIN NOINHERIT;
      CREATE SCHEMA extensions; CREATE EXTENSION postgis WITH SCHEMA extensions;
      CREATE TYPE public.listing_status AS ENUM ('LIVE','DRAFT'); CREATE TYPE public.report_entity_type AS ENUM ('listing','deal');
      CREATE TABLE public.listings(listing_id uuid PRIMARY KEY,title text,category text,condition text,price_amount integer,currency char(3),status public.listing_status,seller_agent_id uuid,delivery_method text,created_at timestamptz DEFAULT now(),geo_lat numeric,geo_lng numeric,geo_point extensions.geography,search_tsv tsvector);
      CREATE TABLE public.moderation_states(entity_type public.report_entity_type,entity_id uuid,hidden boolean,PRIMARY KEY(entity_type,entity_id));
      GRANT USAGE ON SCHEMA public,extensions TO clawdeals_app,clawdeals_schema_owner; GRANT SELECT ON public.listings,public.moderation_states TO clawdeals_app;
      REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE TEMP ON DATABASE postgres FROM PUBLIC;
      ${old.definition_review};
      REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
    const historical = renderRpcRoleReview({ format: "clawdeals-authorization-review-v1", executable: false, restore_eligible: false, catalog_sha256: "fixture-only", rendering_context: { search_path: "pg_catalog, public", evidence: "actual historical source fixture" }, routines: [{ identity: { schema: "public", name: old.name, identity_arguments: old.identity_arguments }, disposition: "server-invoker-candidate", source_security_definer: false, source_definition_sha256: old.definition_sha256 }] });
    q(historical.replace(/ROLLBACK;\n$/, "COMMIT; -- isolated synthetic fixture only\n"));
    q(`INSERT INTO public.listings(listing_id,title,status,geo_lat,geo_lng,geo_point) VALUES
      ('00000000-0000-4000-8000-000000000001','synthetic location','LIVE',48.8649,2.3549,extensions.st_setsrid(extensions.st_makepoint(2.3549,48.8649),4326)::extensions.geography);`);
    const call = "SELECT count(*) FROM public.list_listings_geo_v1(p_lat=>48.86::double precision,p_lng=>2.35::double precision,p_distance_km=>0);";
    const migration = fs.readFileSync("supabase/migrations/20261107000000_listing_geo_privacy_v1.sql", "utf8");
    const overlay = fs.readFileSync("scripts/migration/neon-geo-privacy-role-plan.sql", "utf8");
    assert.equal(createHash("sha256").update(migration).digest("hex"), "7950ce1bdea643d2897663875a42187accb23e7af5bc9042a886039e95eac2a8");
    assert.ok(overlay.includes(migration), "Overlay embeds the exact reviewed repository migration bytes");
    assert.equal((overlay.match(/^ROLLBACK;/gm) || []).length, 1);
    assert.match(overlay, /ROLLBACK;\n$/);
    const apply = sql => q(sql.replace(/^ROLLBACK;$/m, "COMMIT; -- isolated synthetic fixture only"));
    const reject = sql => { const r = run("psql", [...args, "-f", "-"], sql); assert.notEqual(r.status, 0); return r.stderr; };
    // An ordinary review rolls back both replacement bytes and privileges.
    assert.match(q(overlay.replace(/^ROLLBACK;$/m, `SET LOCAL ROLE clawdeals_app; ${call} RESET ROLE; ROLLBACK;`)), /\n1\n/);
    assert.equal(app(call), "0", "Rollback restores the original definition");
    q(old.definition_review.replace(/(AS \$[a-zA-Z_0-9]*\$)/, "$1\n-- fixture definition drift\n") + ";");
    assert.match(reject(overlay), /Geo historical definition changed/);
    q(old.definition_review + ";");
    assert.match(reject(overlay.replace("floor(l.geo_lng * 100 + 0.5)", "floor(l.geo_lng * 10 + 0.5)")), /Geo replacement definition changed/);
    assert.equal(app(call), "0", "A mismatched replacement rolls back atomically");
    apply(overlay);
    assert.equal(app(call), "1", "A zero-radius public query must match the rounded position, never the seller's exact location");
    assert.equal(app("SELECT distance_m FROM public.list_listings_geo_v1(p_lat=>48.86::double precision,p_lng=>2.35::double precision,p_distance_km=>0);"), "0");
    assert.match(reject(historical), /Definition changed/);
    assert.equal(q(`SELECT has_function_privilege('clawdeals_app','${signature}','EXECUTE')`), "t");
    assert.equal(q(`SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='${signature}'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')`), "f");
    q("UPDATE public.listings SET geo_lat=48.8648,geo_point=extensions.st_setsrid(extensions.st_makepoint(2.3549,48.8648),4326)::extensions.geography;");
    assert.equal(app(call), "1", "Exact movement within one public cell cannot change membership");
    q("UPDATE public.listings SET geo_lat=48.8651,geo_point=extensions.st_setsrid(extensions.st_makepoint(2.3549,48.8651),4326)::extensions.geography;");
    assert.equal(app(call), "0", "Moving to another rounded cell changes a zero-radius match");
    q("UPDATE public.listings SET geo_lat=48.8649; INSERT INTO public.moderation_states VALUES('listing','00000000-0000-4000-8000-000000000001',true);");
    assert.equal(app(call), "0", "The overlay preserves moderation filtering");
  } finally {
    if (started) checked("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
