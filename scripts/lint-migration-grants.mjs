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
const CREATE_HEAD = String.raw`\bcreate\s+(?:(?:global|local)\s+)?(?:(temporary|temp|unlogged|foreign)\s+)?table\s+(?:if\s+not\s+exists\s+)?`;
const CREATE = new RegExp(String.raw`${CREATE_HEAD}(?:(${NAME})\s*\.\s*)?(${NAME})`, "gi");
// One `alter table public.X ...` statement; every RLS action in it is replayed in order.
const RLS = new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}([^;]*)`, "gi");
const RLS_ACTION = /\b(enable|disable)\s+row\s+level\s+security\b/gi;
const PRIVILEGE = /\b(grant|revoke)\s+([^;]*?)\s+on\s+([^;]*?)\s+(to|from)\s+([^;]*?)\s*;/gi;
const IN_LIST = new RegExp(String.raw`^${IDENT}$`, "i");
// `select ... into [table] public.X` also creates a table (not `insert into`
// or `merge into`, and not a PL/pgSQL `into` a variable, which has no schema).
const SELECT_INTO = new RegExp(
  String.raw`(?<!\b(?:insert|merge)\s+)\binto\s+(?:(temporary|temp|unlogged)\s+)?(?:table\s+)?${IDENT}`,
  "gi",
);
const SERIAL = new RegExp(String.raw`(?:^|[(,])\s*(?:add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?)?(${NAME})\s+(?:small|big)?serial\b`, "gi");
// `alter table public.T add [column] C serial` creates the sequence T_C_seq.
const ALTER_ADD = new RegExp(String.raw`\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${IDENT}([^;]*)`, "gi");
// `alter [foreign] table|[materialized] view|sequence <schema>.T set schema public` brings it into public.
const SET_SCHEMA = new RegExp(
  String.raw`\balter\s+(foreign\s+table|table|materialized\s+view|view|sequence)\s+(?:if\s+exists\s+)?(?:(${NAME})\s*\.\s*)?(${NAME})\s+set\s+schema\s+${PUBLIC}\b`,
  "gi",
);
// The schema group is optional so that an unqualified view or sequence is rejected.
const VIEW = new RegExp(
  String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:(temporary|temp)\s+)?(?:recursive\s+|materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?(?:(${NAME})\s*\.\s*)?(${NAME})`,
  "gi",
);
const SEQUENCE = new RegExp(
  String.raw`\bcreate\s+(?:(temporary|temp|unlogged)\s+)?sequence\s+(?:if\s+not\s+exists\s+)?(?:(${NAME})\s*\.\s*)?(${NAME})`,
  "gi",
);
// The privileges PostgREST needs: at least one of them must be held.
const DATA_API = ["select", "insert", "update", "delete"];

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

const ALL_PRIVILEGES = {
  table: ["select", "insert", "update", "delete", "truncate", "references", "trigger", "maintain"],
  sequence: ["usage", "select", "update"],
};

/** The privileges a grant or revoke list names ("all [privileges]" expands; column lists drop). */
function privilegeNames(list, kind) {
  const names = splitList(list.replace(/\([^)]*\)/g, "")).map((item) => item.toLowerCase().replace(/\s+/g, " "));
  if (names.some((item) => item === "all" || item === "all privileges")) return ALL_PRIVILEGES[kind];
  return names;
}

/**
 * The privileges service_role holds on public.<name> at the end of the
 * migration, from the grants and revokes after <at> replayed in order (a
 * `revoke grant option for` keeps the privilege).
 */
function privilegesAtEnd(statements, at, kind, name) {
  const held = new Set();
  for (const statement of statements) {
    if (statement.index < at) continue;
    const roles = splitList(statement.roles.replace(/\bwith\s+grant\s+option\b|\bgranted\s+by\s+\S+|\bcascade\b|\brestrict\b/gi, ""))
      .map((role) => role.toLowerCase());
    if (!roles.includes("service_role") || !covers(statement.objects, kind, name)) continue;
    if (statement.verb === "revoke" && /^grant\s+option\s+for\b/i.test(statement.privileges)) continue;
    for (const privilege of privilegeNames(statement.privileges, kind)) {
      if (statement.verb === "grant") held.add(privilege);
      else held.delete(privilege);
    }
  }
  return held;
}

/** Problems of one migration: one entry per object missing RLS or an explicit service_role grant. */
export function lintMigration(sql) {
  const text = maskSql(sql);
  const problems = [];
  // Tables and views made public in this migration, by name; the last creation counts
  // (a drop and re-create discards earlier RLS and grants).
  const created = new Map();
  const sequences = new Map();
  const statementAt = (index) => {
    const end = text.indexOf(";", index);
    return text.slice(index, end === -1 ? text.length : end);
  };
  const serialsOf = (table, body, at) => {
    for (const column of body.matchAll(SERIAL)) sequences.set(`${table}_${unquote(column[1])}_seq`, { at, table, column: unquote(column[1]) });
  };
  const create = (name, at, kind) => {
    if (!created.has(name) || created.get(name).at <= at) created.set(name, { at, kind });
  };
  for (const match of text.matchAll(CREATE)) {
    const [, temporary, schema, table] = match;
    if (temporary && /^temp/i.test(temporary)) continue;
    if (!schema) {
      problems.push(`${unquote(table)}: "create table" without a schema; write public.${unquote(table)} (or the schema it belongs to)`);
      continue;
    }
    if (unquote(schema) !== "public") continue;
    const name = unquote(table);
    // A foreign table is a PostgREST endpoint too, but takes no RLS rule here.
    if (temporary && /^foreign/i.test(temporary)) {
      create(name, match.index, "foreign table");
      continue;
    }
    create(name, match.index, "table");
    serialsOf(name, statementAt(match.index), match.index);
  }
  for (const match of text.matchAll(SELECT_INTO)) {
    if (match[1] && /^temp/i.test(match[1])) continue;
    create(unquote(match[2]), match.index, "table");
  }
  for (const match of text.matchAll(SET_SCHEMA)) {
    if (match[2] && unquote(match[2]) === "public") continue;
    const kind = match[1].toLowerCase().replace(/\s+/g, " ");
    if (kind === "sequence") {
      sequences.set(unquote(match[3]), { at: match.index, table: null, column: null });
      continue;
    }
    create(unquote(match[3]), match.index, kind === "table" ? "table" : kind);
  }
  for (const match of text.matchAll(VIEW)) {
    const [, temporary, schema, view] = match;
    if (temporary) continue;
    if (!schema) {
      problems.push(`${unquote(view)}: "create view" without a schema; write public.${unquote(view)} (or the schema it belongs to)`);
      continue;
    }
    if (unquote(schema) !== "public") continue;
    create(unquote(view), match.index, "view");
  }
  for (const match of text.matchAll(ALTER_ADD)) serialsOf(unquote(match[1]), match[2], match.index);
  for (const match of text.matchAll(SEQUENCE)) {
    const [, temporary, schema, sequence] = match;
    if (temporary && /^temp/i.test(temporary)) continue;
    if (!schema) {
      problems.push(`${unquote(sequence)}: "create sequence" without a schema; write public.${unquote(sequence)} (or the schema it belongs to)`);
      continue;
    }
    if (unquote(schema) !== "public") continue;
    sequences.set(unquote(sequence), { at: match.index, table: null, column: null });
  }
  const statements = [...text.matchAll(PRIVILEGE)].map((match) => ({
    index: match.index,
    verb: match[1].toLowerCase(),
    privileges: match[2],
    objects: match[3],
    roles: match[5],
    direction: match[4].toLowerCase(),
  })).filter((statement) => (statement.verb === "grant") === (statement.direction === "to"));
  for (const [name, { at, kind }] of created) {
    if (kind === "table") {
      const rls = [...text.matchAll(RLS)]
        .filter((match) => match.index > at && unquote(match[1]) === name)
        .flatMap((match) => [...match[2].matchAll(RLS_ACTION)].map((action) => action[1].toLowerCase()));
      if (!rls.length) problems.push(`public.${name}: no "alter table public.${name} enable row level security" after its create table`);
      else if (rls.at(-1) === "disable") problems.push(`public.${name}: row level security is disabled again later in the migration`);
    }
    const held = privilegesAtEnd(statements, at, "table", name);
    if (!DATA_API.some((privilege) => held.has(privilege))) {
      problems.push(`public.${name}: no explicit "grant select|insert|update|delete on public.${name} to service_role" left in force after its create ${kind}`);
    }
  }
  for (const [sequence, { at, table, column }] of sequences) {
    const held = privilegesAtEnd(statements, at, "sequence", sequence);
    if (!held.has("usage") && !held.has("update")) {
      const what = table ? `public.${table}: serial column ${column}` : `public.${sequence}: sequence`;
      problems.push(`${what} needs "grant usage, select on sequence public.${sequence} to service_role" (nextval needs usage or update)`);
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
