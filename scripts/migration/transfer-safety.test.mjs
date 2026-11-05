import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { bindSource, bindTarget, digest, requireApproval, pgEnvironment, verifyFreeze, newDirectory, writePrivate } from "./transfer-contract.mjs";
import { splitSqlStatements, inspectImportSql } from "./sql-statements.mjs";
import { readSecrets, writeEncrypted, readEncrypted } from "./transfer-secrets.mjs";
const source = "postgres://postgres:password@db.abcdefghijklmnopqrst.supabase.co/postgres?sslmode=require";
const target = "postgres://admin:password@ep-test-123.us-east-2.aws.neon.tech/neondb";
const evidence = { observed_at: new Date().toISOString(), project_id: "project", branch_id: "branch", host: "ep-test-123.us-east-2.aws.neon.tech", database: "neondb", restore_user: "admin", isolated_rehearsal: true, runtime_roles: ["app"] };
test("source and target bind exact identities, reject app role/pooler/wrong source", () => {
  assert.equal(bindSource(source, "abcdefghijklmnopqrst").project_ref, "abcdefghijklmnopqrst");
  assert.throws(() => bindSource(source, "xxxxxxxxxxxxxxxxxxxx"));
  assert.equal(bindTarget(target, evidence).branch_id, "branch");
  assert.throws(() => bindTarget(target, { ...evidence, host: "different" }));
  assert.throws(() => bindTarget(target, { ...evidence, runtime_roles: ["admin"] }));
  assert.throws(() => bindTarget(target.replace("ep-test-123.", "ep-test-123-pooler."), evidence));
});
test("TLS verification cannot downgrade and root CA is preserved", () => {
  const env = pgEnvironment(source, true, { PATH: process.env.PATH, PGSSLMODE: "disable", PGOPTIONS: "unsafe", PGSSLROOTCERT: "/trusted/root.pem" });
  assert.equal(env.PGSSLMODE, "verify-full"); assert.equal(env.PGSSLROOTCERT, "/trusted/root.pem");
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.throws(() => pgEnvironment(source.replace("require", "disable")));
});
test("approval digest and bounded freeze cannot be fabricated by rehearsal", () => {
  const plan = { created_at: new Date().toISOString(), source: "a" };
  requireApproval(plan, digest(plan)); assert.throws(() => requireApproval({ ...plan, source: "b" }, digest(plan)));
  assert.throws(() => verifyFreeze({}, bindSource(source, "abcdefghijklmnopqrst")));
});
test("splitter preserves COPY metacharacters but rejects inline and spaced psql commands", () => {
  const sql = "COPY public.t (v) FROM stdin;\n\\! not a command\n\\.\nCREATE TABLE public.x(id int);";
  assert.equal(splitSqlStatements(sql).length, 2);
  assert.deepEqual(inspectImportSql(sql), []);
  for (const bad of ["  \\! echo bad\n", "SELECT 1 \\gexec\n", "ABORT; SELECT 1;", "START /* comment */ TRANSACTION;"]) assert.ok(inspectImportSql(bad).length);
});
test("dollar bodies split atomically and unsafe dependencies refuse", () => {
  assert.equal(splitSqlStatements("CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN; END$$;").length, 1);
  for (const bad of ["DO $$BEGIN END$$;", "SELECT public.f();", "COPY public.t TO PROGRAM 'bad';", "CREATE VIEW public.v AS SELECT * FROM neon_auth.users;", "CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $$BEGIN EXECUTE 'bad'; END$$;"]) assert.ok(inspectImportSql(bad).length);
});
test("private stdin rejects unknown keys without echoing secrets", async () => {
  assert.equal((await readSecrets(Readable.from(['{"artifact_passphrase":"test"}']))).artifact_passphrase, "test");
  await assert.rejects(readSecrets(Readable.from(['{"SECRET":"never echo"}'])), /^Error: Invalid private stdin input$/);
});
test("GPG encrypted roundtrip, tamper/wrong key, private files and no overwrite", async () => {
  const dir = newDirectory(`migration-artifacts/fixture-${process.pid}-${Date.now()}`), file = path.join(dir, "data.gpg"), key = "fixture-key-only-".repeat(4);
  try {
    const plain = Buffer.from("synthetic fixture only"); await writeEncrypted(file, plain, key);
    assert.ok(!fs.readFileSync(file).includes(plain));
    const decoded = await readEncrypted(file, key); assert.deepEqual(decoded, plain); decoded.fill(0);
    await assert.rejects(readEncrypted(file, "wrong-key-".repeat(5)));
    await assert.rejects(writeEncrypted(file, plain, key));
    const encrypted = fs.readFileSync(file); encrypted[encrypted.length - 5] ^= 1;
    const tampered = path.join(dir, "tampered.gpg"); writePrivate(tampered, encrypted);
    await assert.rejects(readEncrypted(tampered, key));
    assert.equal(fs.statSync(file).mode & 0o077, 0);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["data.gpg", "tampered.gpg"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
