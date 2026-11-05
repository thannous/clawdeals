import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { restoreScript, rehearsalSqlBlockers, PROVIDER_CATALOG_FINGERPRINT_SQL, validateRehearsalEvidence } from "./rehearsal-restore.mjs";
const evidence = { runtime_roles: ["fixture_app"], provider_schemas: [] };
test("reconstructed restore refuses unsafe definitions and provider access", () => {
  for (const sql of ["CREATE SCHEMA sneaky;", "CREATE TABLE pg_catalog.x (id integer);", "CREATE TABLE public.t (id integer DEFAULT evil());", "CREATE TABLE public.t AS SELECT pg_sleep(1);", "CREATE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$SELECT 1$$;", "COPY public.x TO PROGRAM 'bad';", "CREATE TABLE public.x (u neon_auth.user_type);"]) assert.ok(rehearsalSqlBlockers(sql).length, sql);
  assert.deepEqual(rehearsalSqlBlockers("CREATE TABLE public.t (id integer, title text);\nCOPY public.t (id, title) FROM stdin;\n1\tfixture\n\\.\n"), []);
});
test("fresh source/target/review and verified provider owner required", () => {
  assert.throws(() => validateRehearsalEvidence({}, {}, "archive", "sql"));
  const e = { observed_at: new Date().toISOString(), project_id: "p", branch_id: "b", restore_user: "owner", isolated_rehearsal: true, application_writers_disabled: true, external_job_runners_disabled: true, no_outbound_or_scheduled_jobs: true, provider_schemas_untouched: true, source_archive_sha256: "archive", reviewed_sql_sha256: "sql", ...evidence };
  validateRehearsalEvidence(e, { project_id: "p", branch_id: "b", user: "owner" }, "archive", "sql");
  assert.throws(() => validateRehearsalEvidence({ ...e, provider_schemas: [{ name: "neon_auth" }] }, { project_id: "p", branch_id: "b", user: "owner" }, "archive", "sql"));
});
const bin = process.env.PG_FIXTURE_BIN;
test("native PostgreSQL fixture proves atomic rollback, provider preservation and runtime lockdown", { skip: !bin && "Set PG_FIXTURE_BIN to verified official local PostgreSQL binaries" }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-fixture-")), data = path.join(root, "data"), socket = path.join(root, "socket"); fs.mkdirSync(socket);
  const run = (name, args, input) => spawnSync(path.join(bin, name), args, { input, encoding: "utf8", timeout: 30000 });
  const checked = (name, args, input) => { const r = run(name, args, input); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  let started = false;
  try {
    checked("initdb", ["-D", data, "--auth=trust", "--no-locale", "--username=fixture_owner"]);
    checked("pg_ctl", ["-D", data, "-l", path.join(root, "server.log"), "-o", `-c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"]); started = true;
    const args = ["-X", "-h", socket, "-U", "fixture_owner", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"];
    const query = sql => checked("psql", [...args, "-c", sql]);
    const restore = (sql, ev = evidence) => run("psql", [...args, "--single-transaction", "-f", "-"], restoreScript(sql, ev));
    query("CREATE ROLE fixture_app; CREATE ROLE provider_owner; CREATE SCHEMA neon_auth AUTHORIZATION provider_owner; CREATE TABLE neon_auth.fixture(id integer DEFAULT 1); INSERT INTO neon_auth.fixture VALUES(7);");
    const fingerprint = query(PROVIDER_CATALOG_FINGERPRINT_SQL);
    const ev = { ...evidence, provider_schemas: [{ name: "neon_auth", owner: "provider_owner", catalog_md5: fingerprint, provider_owned_verified: true }] };
    assert.notEqual(restore("CREATE TABLE public.t (id integer);\nCOPY public.t (id) FROM stdin;\nbad\n\\.\n", ev).status, 0);
    assert.equal(query("SELECT to_regclass('public.t') IS NULL"), "t");
    assert.equal(query("SELECT id FROM neon_auth.fixture"), "7");
    assert.equal(query(PROVIDER_CATALOG_FINGERPRINT_SQL), fingerprint);
    assert.notEqual(restore("CREATE TABLE public.t (id integer);", evidence).status, 0);
    query("ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO fixture_app;");
    assert.notEqual(restore("CREATE TABLE public.t (id integer);", ev).status, 0);
    assert.equal(query("SELECT to_regclass('public.t') IS NULL"), "t");
    query("ALTER DEFAULT PRIVILEGES REVOKE SELECT ON TABLES FROM fixture_app;");
    assert.equal(restore("CREATE TABLE public.t (id integer);\nCOPY public.t (id) FROM stdin;\n8\n\\.\n", ev).status, 0);
    assert.equal(query("SELECT id FROM public.t"), "8");
    assert.equal(query("SELECT has_schema_privilege('fixture_app','public','USAGE')"), "f");
    assert.equal(query("SELECT has_table_privilege('fixture_app','public.t','SELECT')"), "f");
    assert.equal(query(PROVIDER_CATALOG_FINGERPRINT_SQL), fingerprint);
    assert.notEqual(restore("CREATE TABLE public.other (id integer);", ev).status, 0);
    assert.equal(query("SELECT to_regclass('public.other') IS NULL"), "t");
    query("ALTER TABLE neon_auth.fixture ALTER COLUMN id SET DEFAULT 2");
    assert.notEqual(query(PROVIDER_CATALOG_FINGERPRINT_SQL), fingerprint);
  } finally {
    if (started) checked("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
