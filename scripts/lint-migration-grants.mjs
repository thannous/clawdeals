#!/usr/bin/env node
// Every table a migration creates in `public` must enable row level security
// and grant its privileges explicitly to service_role in the same migration,
// and keep them to the end of that migration. From 2026-10-30 Supabase gives
// new `public` tables and sequences no default grant to anon, authenticated or
// service_role, so PostgREST answers 42501 (before RLS) without an explicit
// grant. Static SQL only: string literals are masked, so a table created
// through dynamic SQL (format with %I) is left to its own migration's review.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Migrations at or before this version predate the rule and are not checked:
// 20260708221322_service_role_public_grants.sql granted service_role every
// table that existed then ("on all tables in schema public"), and the older
// migrations relied on default grants (and, for two tables, enable RLS in a
// later migration).
export const RULE_AFTER = "20260708221322";

const NAME = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const PUBLIC = String.raw`(?:"public"|public)`;
const IDENT = String.raw`${PUBLIC}\s*\.\s*(${NAME})`;
const CREATE_HEAD = String.raw`\bcreate\s+(?:(?:global|local)\s+)?(?:(temporary|temp|unlogged)\s+)?table\s+(?:if\s+not\s+exists\s+)?`;
const CREATE = new RegExp(String.raw`${CREATE_HEAD}(?:(${NAME})\s*\.\s*)?(${NAME})`, "gi");
const RLS = new RegExp(
  String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}[^;]*?\b(enable|disable)\s+row\s+level\s+security`,
  "gi",
);
const PRIVILEGE = /\b(grant|revoke)\s+([^;]*?)\s+on\s+([^;]*?)\s+(to|from)\s+([^;]*?)\s*;/gi;
const IN_LIST = new RegExp(String.raw`^${IDENT}$`, "i");
const SERIAL = new RegExp(String.raw`(?:^|[(,])\s*(${NAME})\s+(?:small|big)?serial\b`, "gi");

/** A name as Postgres resolves it: unquoted names fold to lower case. */
function unquote(raw) {
  return raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase();
}

/**
 * The SQL with comments removed and the content of string literals ('...',
 * E'...') blanked, so neither a commented-out statement nor SQL text inside a
 * literal counts. Quoted identifiers and dollar-quoted bodies (DO blocks,
 * functions) stay, since they hold executable SQL.
 */
export function maskSql(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i, i + 2);
    if (rest === "--") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      out += " ";
    } else if (rest === "/*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += " ";
    } else if (sql[i] === "'") {
      const escapes = /[eE]$/.test(out) && !/[A-Za-z0-9_$][eE]$/.test(out);
      let j = i + 1;
      while (j < sql.length) {
        if (escapes && sql[j] === "\\") j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      out += "''";
      i = j + 1;
    } else if (sql[i] === '"') {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === '"' && sql[j + 1] !== '"')) j += sql[j] === '"' ? 2 : 1;
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** Splits a grant's object or role list on commas outside double quotes. */
function splitList(text) {
  return text.match(/(?:"(?:[^"]|"")*"|[^,])+/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
}

/** Whether a grant/revoke object list covers public.<name> of <kind> ("table" or "sequence"). */
function covers(objects, kind, name) {
  const text = objects.trim();
  const plural = kind === "table" ? "tables" : "sequences";
  if (new RegExp(String.raw`^all\s+${plural}\s+in\s+schema\s+(?:[^;]*,\s*)?${PUBLIC}(?:\s*,[^;]*)?$`, "i").test(text)) return true;
  const list = kind === "table" ? text.replace(/^table\s+/i, "") : text.replace(/^sequence\s+/i, "");
  if (kind === "sequence" && list === text) return false;
  if (kind === "table" && /^(?:sequence|function|procedure|routine|schema|all\s|type|domain|foreign|large|language|database|tablespace)\b/i.test(text)) {
    return false;
  }
  return splitList(list).some((item) => {
    const match = item.match(IN_LIST);
    return match && unquote(match[1]) === name;
  });
}

/** Whether the latest grant to service_role on public.<name> after <at> is not undone by a later revoke. */
function grantedAtEnd(statements, at, kind, name) {
  let state = false;
  for (const statement of statements) {
    if (statement.index < at) continue;
    const roles = splitList(statement.roles.replace(/\bwith\s+grant\s+option\b|\bcascade\b|\brestrict\b/gi, ""))
      .map((role) => role.toLowerCase());
    if (!roles.includes("service_role") || !covers(statement.objects, kind, name)) continue;
    state = statement.verb === "grant";
  }
  return state;
}

/** Problems of one migration: one entry per table missing RLS or an explicit service_role grant. */
export function lintMigration(sql) {
  const text = maskSql(sql);
  const problems = [];
  const created = new Map();
  for (const match of text.matchAll(CREATE)) {
    const [, temporary, schema, table] = match;
    if (temporary && /^temp/i.test(temporary)) continue;
    if (!schema) {
      problems.push(`${unquote(table)}: "create table" without a schema; write public.${unquote(table)} (or the schema it belongs to)`);
      continue;
    }
    if (unquote(schema) !== "public") continue;
    const name = unquote(table);
    if (created.has(name)) continue;
    const end = text.indexOf(";", match.index);
    const body = text.slice(match.index, end === -1 ? text.length : end);
    const serials = [...body.matchAll(SERIAL)].map((column) => unquote(column[1]));
    created.set(name, { at: match.index, serials });
  }
  const statements = [...text.matchAll(PRIVILEGE)].map((match) => ({
    index: match.index,
    verb: match[1].toLowerCase(),
    objects: match[3],
    roles: match[5],
    direction: match[4].toLowerCase(),
  })).filter((statement) => (statement.verb === "grant") === (statement.direction === "to"));
  for (const [name, { at, serials }] of created) {
    const rls = [...text.matchAll(RLS)].filter((match) => match.index > at && unquote(match[1]) === name);
    if (!rls.length) problems.push(`public.${name}: no "alter table public.${name} enable row level security" after its create table`);
    else if (rls.at(-1)[2].toLowerCase() === "disable") problems.push(`public.${name}: row level security is disabled again later in the migration`);
    if (!grantedAtEnd(statements, at, "table", name)) {
      problems.push(`public.${name}: no explicit "grant ... on public.${name} to service_role" left in force after its create table`);
    }
    for (const column of serials) {
      const sequence = `${name}_${column}_seq`;
      if (!grantedAtEnd(statements, at, "sequence", sequence)) {
        problems.push(`public.${name}: serial column ${column} needs "grant usage, select on sequence public.${sequence} to service_role"`);
      }
    }
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
