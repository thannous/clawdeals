#!/usr/bin/env node
// Every table a migration creates in `public` must enable row level security
// and grant its privileges explicitly to service_role in the same migration.
// From 2026-10-30 Supabase gives new `public` tables no default grant to anon,
// authenticated or service_role, so PostgREST answers 42501 (before RLS) on a
// table without an explicit grant. Static SQL only: a table created through
// dynamic SQL (format with %I) is checked by its own migration's review.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Migrations at or before this version predate the rule and are not checked:
// 20260708221322_service_role_public_grants.sql granted service_role every
// table that existed then ("on all tables in schema public"), and the older
// migrations relied on default grants (and, for two tables, enable RLS in a
// later migration).
export const RULE_AFTER = "20260708221322";

const IDENT = String.raw`(?:"public"|public)\s*\.\s*("(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const CREATE = new RegExp(
  String.raw`\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${IDENT}`,
  "gi",
);
const RLS = new RegExp(
  String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}[^;]*?\benable\s+row\s+level\s+security`,
  "gi",
);
const GRANT = /\bgrant\s+([^;]*?)\s+on\s+([^;]*?)\s+to\s+([^;]*?)\s*;/gi;
const TABLE_IN_LIST = new RegExp(String.raw`^(?:table\s+)?${IDENT}$`, "i");

/** public.X as Postgres resolves it: unquoted names fold to lower case. */
function tableName(raw) {
  return raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase();
}

/** The SQL without comments, so a commented-out statement does not count. */
export function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Splits a grant's object or role list on commas outside double quotes. */
function splitList(text) {
  return text.match(/(?:"(?:[^"]|"")*"|[^,])+/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
}

/** Problems of one migration: one entry per table missing RLS or a service_role grant. */
export function lintMigration(sql) {
  const text = stripComments(sql);
  const created = new Map();
  for (const match of text.matchAll(CREATE)) {
    const name = tableName(match[1]);
    if (!created.has(name)) created.set(name, match.index);
  }
  const problems = [];
  for (const [name, at] of created) {
    const rls = [...text.matchAll(RLS)].some((match) => match.index > at && tableName(match[1]) === name);
    const granted = [...text.matchAll(GRANT)].some((match) => {
      if (match.index < at) return false;
      const roles = splitList(match[3].replace(/\bwith\s+grant\s+option\b/i, "")).map((role) => role.toLowerCase());
      if (!roles.includes("service_role")) return false;
      const objects = match[2].trim();
      if (/^all\s+tables\s+in\s+schema\s+(?:"public"|public)$/i.test(objects)) return true;
      return splitList(objects.replace(/^table\s+/i, "")).some((item) => {
        const table = item.match(TABLE_IN_LIST);
        return table && tableName(table[1]) === name;
      });
    });
    if (!rls) problems.push(`public.${name}: no "alter table public.${name} enable row level security" after its create table`);
    if (!granted) problems.push(`public.${name}: no explicit "grant ... on public.${name} to service_role" after its create table`);
  }
  return problems;
}

/** Problems of every migration in <dir> after RULE_AFTER, as "file: problem". */
export function lintMigrations(dir, { after = RULE_AFTER } = {}) {
  const problems = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    const version = file.split("_")[0];
    if (after && version <= after) continue;
    for (const problem of lintMigration(readFileSync(path.join(dir, file), "utf8"))) problems.push(`${file}: ${problem}`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
  const problems = lintMigrations(dir);
  for (const problem of problems) console.error(`lint-migration-grants: ${problem}`);
  if (problems.length) {
    console.error(`lint-migration-grants: ${problems.length} problem(s). Enable RLS and grant explicitly to service_role (and to any other role the table needs).`);
    process.exit(1);
  }
  console.log("lint-migration-grants: every public table created by a checked migration enables RLS and grants service_role explicitly.");
}
