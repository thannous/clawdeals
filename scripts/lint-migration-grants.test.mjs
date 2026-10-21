import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { RULE_AFTER, lintMigration, lintMigrations } from "./lint-migration-grants.mjs";

const passing = {
  plain: `create table public.items (id uuid primary key);
alter table public.items enable row level security;
grant select, insert, update, delete on table public.items to service_role;`,
  ifNotExistsQuoted: `create table if not exists public."Mixed Case" (id int);
alter table if exists only public."Mixed Case" enable row level security;
grant select on public."Mixed Case", public.other to authenticated, service_role;`,
  quotedSchema: `CREATE TABLE "public".lower_name (id int);
ALTER TABLE public.LOWER_NAME ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."lower_name" TO service_role;`,
  schemaWide: `create table public.a (id int);
alter table public.a enable row level security, force row level security;
grant select, insert on all tables in schema public to service_role;`,
  otherSchema: "create table private.state (id int);",
  dynamic: "execute format('create table if not exists public.%I partition of public.audit_logs', name);",
};

const failing = {
  noGrant: [
    `create table public.items (id int);
alter table public.items enable row level security;`,
    /public\.items: no explicit "grant/,
  ],
  noRls: [
    `create table public.items (id int);
grant select on public.items to service_role;`,
    /public\.items: no "alter table public\.items enable row level security"/,
  ],
  grantWithoutServiceRole: [
    `create table public.items (id int);
alter table public.items enable row level security;
grant select on public.items to anon, authenticated;`,
    /no explicit "grant/,
  ],
  grantBeforeCreate: [
    `grant select on public.items to service_role;
create table public.items (id int);
alter table public.items enable row level security;`,
    /no explicit "grant/,
  ],
  commentedOut: [
    `create table public.items (id int);
-- alter table public.items enable row level security;
/* grant select on public.items to service_role; */`,
    /enable row level security/,
  ],
  quotedNameMismatch: [
    `create table public."Items" (id int);
alter table public.items enable row level security;
grant select on public.items to service_role;`,
    /public\.Items: no "alter table/,
  ],
};

for (const [name, sql] of Object.entries(passing)) {
  test(`passes: ${name}`, () => assert.deepEqual(lintMigration(sql), []));
}

for (const [name, [sql, expected]] of Object.entries(failing)) {
  test(`fails: ${name}`, () => {
    const problems = lintMigration(sql);
    assert.ok(problems.length > 0, "a problem is reported");
    assert.ok(problems.some((problem) => expected.test(problem)), problems.join("\n"));
  });
}

test("only migrations after RULE_AFTER are checked", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "migration-grants-"));
  try {
    const bad = "create table public.items (id int);";
    writeFileSync(path.join(dir, `${RULE_AFTER}_old.sql`), bad);
    assert.deepEqual(lintMigrations(dir), []);
    writeFileSync(path.join(dir, "29990101000000_new.sql"), bad);
    const problems = lintMigrations(dir);
    assert.equal(problems.length, 2);
    assert.ok(problems.every((problem) => problem.startsWith("29990101000000_new.sql: ")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the repository migrations pass", () => {
  assert.deepEqual(lintMigrations(new URL("../supabase/migrations", import.meta.url).pathname), []);
});
