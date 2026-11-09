import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const bin = process.env.PG_FIXTURE_BIN;
// This is a synthetic standard-tool experiment, not a source-dump importer.
test("restricted LOGIN restores pre-data, data, post-data atomically before activation", {
  skip: !bin && "Set PG_FIXTURE_BIN to verified official PostgreSQL 17 binaries"
}, () => {
  const root = fs.mkdtempSync("/tmp/cd-order-"), data = path.join(root, "data");
  const socket = path.join(root, "socket");
  fs.mkdirSync(socket, { mode: 0o700 });
  // Do not inherit credentials, service files, connection URLs or application env.
  const env = { PATH: process.env.PATH, HOME: root, LANG: "C", LC_ALL: "C" };
  const run = (name, args, input) => spawnSync(path.join(bin, name), args, {
    input, encoding: "utf8", timeout: 30000, env
  });
  const checked = (name, args, input) => {
    const r = run(name, args, input);
    assert.equal(r.status, 0, r.stderr || r.error?.message);
    return r.stdout.trim();
  };
  const args = (db, user = "restore_login") => ["-X", "-h", socket, "-U", user, "-d", db, "-At", "-v", "ON_ERROR_STOP=1"];
  const q = (db, sql, user) => checked("psql", [...args(db, user), "-c", sql]);
  const sqlAssert = (predicate, label) => `DO $$ BEGIN IF NOT (${predicate}) THEN RAISE EXCEPTION '${label}'; END IF; END $$;\n`;
  let started = false;
  try {
    checked("initdb", ["-D", data, "--auth=trust", "--no-locale", "--username=bootstrap"]);
    checked("pg_ctl", ["-D", data, "-l", path.join(root, "server.log"), "-o", `-c listen_addresses='' -c unix_socket_directories='${socket}'`, "-w", "start"]);
    started = true;
    // Administrator only bootstraps roles/databases. All fixture DDL/data/restore
    // and all verification below use actual restricted LOGIN connections.
    q("postgres", `CREATE ROLE restore_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;
      CREATE ROLE outsider LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;`, "bootstrap");
    for (const db of ["synthetic_source", "target_ok", "target_fail"]) {
      q("postgres", `CREATE DATABASE ${db} OWNER restore_login`, "bootstrap");
      q(db, `REVOKE ALL ON DATABASE ${db} FROM PUBLIC; GRANT CONNECT ON DATABASE ${db} TO outsider; REVOKE ALL ON SCHEMA public FROM PUBLIC;`, "bootstrap");
    }
    assert.equal(q("target_ok", `SELECT session_user = 'restore_login' AND current_user = session_user AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication FROM pg_roles WHERE rolname=current_user`), "t");
    assert.equal(q("target_ok", "SELECT count(*) FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)"), "0");
    q("synthetic_source", `CREATE SCHEMA fixture;
      CREATE TABLE fixture.rows(id integer PRIMARY KEY, payload text NOT NULL, amount integer CHECK(amount > 0), doubled integer GENERATED ALWAYS AS (amount * 2) STORED);
      CREATE TABLE fixture.queue(id integer);
      CREATE TABLE fixture.audit(counter integer NOT NULL);
      INSERT INTO fixture.audit VALUES(0);
      INSERT INTO fixture.rows(id,payload,amount) VALUES(1,'copied-untouched',7),(2,'copied-untouched',11);
      CREATE FUNCTION fixture.after_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        UPDATE fixture.rows SET payload='trigger-mutated' WHERE id=NEW.id;
        INSERT INTO fixture.queue VALUES(NEW.id);
        UPDATE fixture.audit SET counter=counter+1;
        RETURN NEW;
      END $$;
      CREATE TRIGGER insert_effect AFTER INSERT ON fixture.rows FOR EACH ROW EXECUTE FUNCTION fixture.after_insert();`);
    const archive = path.join(root, "synthetic.dump");
    checked("pg_dump", ["-h", socket, "-U", "restore_login", "-d", "synthetic_source", "-Fc", "-n", "fixture", "-f", archive]);
    const section = name => checked("pg_restore", ["--no-owner", "--no-privileges", `--section=${name}`, "-f", "-", archive]) + "\n";
    const pre = section("pre-data"), rows = section("data"), post = section("post-data");
    assert.doesNotMatch(pre, /CREATE TRIGGER/);
    assert.match(rows, /COPY fixture\.rows/);
    assert.match(post, /CREATE TRIGGER insert_effect/);
    const emptyTriggers = sqlAssert("(SELECT count(*) FROM pg_trigger WHERE tgrelid='fixture.rows'::regclass AND NOT tgisinternal)=0", "trigger present during copy");
    const unchanged = sqlAssert("(SELECT count(*) FROM fixture.rows WHERE payload='copied-untouched')=2 AND (SELECT count(*) FROM fixture.queue)=0 AND (SELECT counter FROM fixture.audit)=0 AND (SELECT sum(doubled) FROM fixture.rows)=36", "copy caused side effects");
    const locked = `REVOKE ALL ON SCHEMA fixture FROM PUBLIC, outsider;
      REVOKE ALL ON ALL TABLES IN SCHEMA fixture FROM PUBLIC, outsider;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fixture FROM PUBLIC, outsider;
      ALTER DEFAULT PRIVILEGES IN SCHEMA fixture REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
      ${sqlAssert("NOT has_schema_privilege('outsider','fixture','USAGE') AND NOT has_table_privilege('outsider','fixture.rows','SELECT') AND NOT has_function_privilege('outsider','fixture.after_insert()','EXECUTE')", "privileges not closed")}`;
    // -1 wraps every -f input in ONE transaction; ON_ERROR_STOP aborts on any error.
    const restore = (db, tail = "") => run("psql", [...args(db), "--single-transaction", "-f", "-"],
      pre + emptyTriggers + rows + emptyTriggers + unchanged + post + locked + tail);
    const success = restore("target_ok");
    assert.equal(success.status, 0, success.stderr);
    assert.equal(q("target_ok", "SELECT tgenabled FROM pg_trigger WHERE tgname='insert_effect' AND tgrelid='fixture.rows'::regclass"), "O");
    q("target_ok", unchanged);
    q("target_ok", "INSERT INTO fixture.rows(id,payload,amount) VALUES(3,'new',13)");
    assert.equal(q("target_ok", "SELECT payload FROM fixture.rows WHERE id=3"), "trigger-mutated");
    assert.equal(q("target_ok", "SELECT count(*) FROM fixture.queue"), "1");
    assert.equal(q("target_ok", "SELECT counter FROM fixture.audit"), "1");
    const denied = run("psql", [...args("target_ok", "outsider"), "-c", "SELECT * FROM fixture.rows"]);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /permission denied/);
    // Fail in an appended post-data statement after copy, trigger creation and
    // lockdown. Even those already-successful steps must all roll back.
    q("target_fail", "CREATE TABLE public.sentinel(value text); INSERT INTO public.sentinel VALUES('preserve')");
    const failure = restore("target_fail", "ALTER TABLE fixture.rows ADD CONSTRAINT deliberate_failure CHECK (id < 0);\n");
    assert.notEqual(failure.status, 0);
    assert.match(failure.stderr, /deliberate_failure/);
    assert.equal(q("target_fail", "SELECT count(*) FROM pg_namespace WHERE nspname='fixture'"), "0");
    assert.equal(q("target_fail", "SELECT value FROM public.sentinel"), "preserve");
    assert.equal(q("target_fail", "SELECT count(*) FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)"), "0");
  } finally {
    if (started) checked("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
