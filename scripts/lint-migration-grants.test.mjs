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
  serialWithSequenceGrant: `create table public.items (id bigserial primary key, label text);
alter table public.items enable row level security;
grant select, insert on public.items to service_role;
grant usage, select on sequence public.items_id_seq to service_role;`,
  serialWithSchemaSequences: `create table public.items (id serial primary key);
alter table public.items enable row level security;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;`,
  identityNeedsNoSequenceGrant: `create table public.items (id bigint generated always as identity primary key);
alter table public.items enable row level security;
grant select, insert on public.items to service_role;`,
  revokeOtherRolesOnly: `create table public.items (id int);
alter table public.items enable row level security;
grant select on public.items to service_role;
revoke all on public.items from anon, authenticated;`,
  regrantAfterRevoke: `create table public.items (id int);
alter table public.items enable row level security;
revoke all on public.items from public, anon, authenticated, service_role;
grant select on public.items to service_role;`,
  temporaryUnqualified: "create temporary table scratch (id int);",
  partialRevokeKeepsInsert: `create table public.items (id int);
alter table public.items enable row level security;
grant select, insert on public.items to service_role;
revoke select on public.items from service_role;`,
  revokeGrantOptionOnly: `create table public.items (id int);
alter table public.items enable row level security;
grant select on public.items to service_role with grant option;
revoke grant option for select on public.items from service_role;`,
  viewWithGrant: `create or replace view public.summary as select 1 as n;
grant select on public.summary to service_role;`,
  sequenceWithUsage: `create sequence if not exists public.counter_seq;
grant usage, select on sequence public.counter_seq to service_role;`,
  addSerialWithGrant: `alter table public.existing add column if not exists n bigserial;
grant usage on sequence public.existing_n_seq to service_role;`,
  insertIntoAndPlpgsqlInto: `create table public.items (id int);
alter table public.items enable row level security;
grant select, insert on public.items to service_role;
insert into public.items (id) values (1);
do $$ declare n int; begin select count(*) into n from public.items; end $$;`,
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
  grantOnlyInLiteral: [
    `create table public.items (id int);
alter table public.items enable row level security;
comment on table public.items is 'grant select on public.items to service_role;';`,
    /no explicit "grant/,
  ],
  rlsOnlyInLiteral: [
    `create table public.items (id int);
select 'alter table public.items enable row level security';
grant select on public.items to service_role;`,
    /enable row level security/,
  ],
  revokedAfterGrant: [
    `create table public.items (id int);
alter table public.items enable row level security;
grant select on public.items to service_role;
revoke all on public.items from anon, authenticated, service_role;`,
    /left in force/,
  ],
  rlsDisabledAfterEnable: [
    `create table public.items (id int);
alter table public.items enable row level security;
grant select on public.items to service_role;
alter table public.items disable row level security;`,
    /disabled again/,
  ],
  serialWithoutSequenceGrant: [
    `create table public.items (id serial primary key);
alter table public.items enable row level security;
grant select, insert on public.items to service_role;`,
    /serial column id needs "grant usage, select on sequence public\.items_id_seq/,
  ],
  unqualifiedCreate: [
    "create table if not exists items (id int);",
    /items: "create table" without a schema/,
  ],
  sequenceSelectOnly: [
    `create table public.items (id serial primary key);
alter table public.items enable row level security;
grant select, insert on public.items to service_role;
grant select on sequence public.items_id_seq to service_role;`,
    /nextval needs usage or update/,
  ],
  recreatedAfterGrant: [
    `create table public.items (id int);
alter table public.items enable row level security;
grant select on public.items to service_role;
drop table public.items;
create table public.items (id int);`,
    /public\.items: no "alter table/,
  ],
  selectIntoTable: [
    "select 1 as id into table public.items;",
    /public\.items: no explicit "grant/,
  ],
  onlyNonDataApiPrivilege: [
    `create table public.items (id int);
alter table public.items enable row level security;
grant trigger, references on public.items to service_role;`,
    /no explicit "grant select\|insert/,
  ],
  viewWithoutGrant: [
    "create view public.summary as select 1 as n;",
    /public\.summary: no explicit "grant .* after its create view/,
  ],
  movedIntoPublic: [
    `create table private.items (id int);
alter table private.items set schema public;`,
    /public\.items: no "alter table/,
  ],
  sequenceWithoutGrant: [
    "create sequence public.counter_seq;",
    /public\.counter_seq: sequence needs "grant usage/,
  ],
  addSerialWithoutGrant: [
    "alter table public.existing add column n serial;",
    /public\.existing: serial column n needs/,
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
