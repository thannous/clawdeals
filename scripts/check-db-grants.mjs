#!/usr/bin/env node
// Post-reset database check of the public grants and RLS (issue #32). It
// starts a native local Supabase stack, runs `supabase db reset`, reads
// pg_catalog and fails when:
// - a table in public (partitions included) lacks row level security or an
//   explicit service_role privilege (select, insert, update or delete);
// - anon or authenticated hold a table privilege in public that
//   supabase/db-grants-allowlist.json does not list;
// - a SECURITY DEFINER function in public is executable by PUBLIC or anon.
// Views in public and SECURITY DEFINER functions authenticated can execute
// are reported, not failed. Objects that belong to an extension are skipped.
// The stack is always stopped and destroyed at the end, also on failure or a
// signal (a reset already wiped its data). scripts/lint-migration-grants.mjs
// stays as a static backstop.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PREFIX = "check-db-grants:";
const DATA_API = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const ROLES = ["anon", "authenticated"];

// One row per relation in public that is not an extension member.
export const RELATIONS_SQL = `
select c.relname as name, c.relkind as kind, c.relispartition as partition, c.relrowsecurity as rls,
  array(select distinct a.privilege_type from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
        where a.grantee = 'service_role'::regrole order by 1) as service_role,
  array(select r || ':' || p from unnest(array['anon','authenticated']) r,
        -- MAINTAIN is a table privilege from PostgreSQL 17 (supabase/config.toml major_version).
        unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
        where has_table_privilege(r, c.oid, p)
        union all
        -- Column-level grants, which has_table_privilege does not see.
        select r || ':' || p || '(columns)' from unnest(array['anon','authenticated']) r,
        unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) p
        where has_any_column_privilege(r, c.oid, p) and not has_table_privilege(r, c.oid, p)
        order by 1) as exposed
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  and not exists (select 1 from pg_catalog.pg_depend d
                  where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
order by 1`;

// One row per SECURITY DEFINER function in public that is not an extension member.
export const FUNCTIONS_SQL = `
select p.oid::regprocedure::text as signature,
  exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_exec,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_exec
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from pg_catalog.pg_depend d
                  where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
order by 1`;

/** The allowlist as a set of "table role:PRIVILEGE" keys; every entry needs a reason. */
export function allowedGrants(allowlist) {
  const allowed = new Set();
  for (const entry of allowlist?.tables ?? []) {
    if (typeof entry?.table !== "string" || !Array.isArray(entry.grants) || typeof entry.reason !== "string" || !entry.reason.trim()) {
      throw new Error(`${PREFIX} allowlist entry ${JSON.stringify(entry)} needs table, grants and a reason`);
    }
    for (const grant of entry.grants) allowed.add(`${entry.table} ${String(grant)}`);
  }
  return allowed;
}

/**
 * The verdict on query results: failures (each naming its object), views and
 * notes to report. Pure, so the tests run it on fixture rows.
 */
export function evaluate({ relations, functions }, allowlist = { tables: [] }) {
  const allowed = allowedGrants(allowlist);
  const failures = [];
  const views = [];
  const notes = [];
  for (const row of relations) {
    const label = `public.${row.name}`;
    if (row.kind === "r" || row.kind === "p") {
      const what = row.partition ? "partition" : row.kind === "p" ? "partitioned table" : "table";
      if (!row.rls) failures.push(`${label} (${what}): row level security is not enabled`);
      if (!DATA_API.some((privilege) => (row.service_role ?? []).includes(privilege))) {
        failures.push(`${label} (${what}): no explicit service_role grant (select, insert, update or delete)`);
      }
    } else if (row.kind === "v" || row.kind === "m") {
      views.push(`${label} (${row.kind === "m" ? "materialized view" : "view"}): service_role ${(row.service_role ?? []).join(", ") || "none"}; anon/authenticated ${(row.exposed ?? []).join(", ") || "none"}`);
    } else if (row.kind === "f" && !DATA_API.some((privilege) => (row.service_role ?? []).includes(privilege))) {
      failures.push(`${label} (foreign table): no explicit service_role grant (select, insert, update or delete)`);
    }
    for (const grant of row.exposed ?? []) {
      if (!allowed.has(`${row.name} ${grant}`)) failures.push(`${label}: ${grant} is granted, and supabase/db-grants-allowlist.json does not list it`);
    }
  }
  // A reset that applied nothing must not pass on an empty catalog.
  if (!relations.some((row) => row.kind === "r" || row.kind === "p")) {
    failures.push("public: no tables after the reset, so the migrations were not applied");
  }
  for (const row of functions) {
    const label = `public.${row.signature}`;
    if (row.public_exec) failures.push(`${label} (security definer): PUBLIC can execute it`);
    if (row.anon_exec) failures.push(`${label} (security definer): anon can execute it`);
    if (row.authenticated_exec) notes.push(`${label} (security definer): authenticated can execute it`);
  }
  return { failures, views, notes };
}

/** Rows of `supabase db query --output-format json` (its JSON follows an optional preamble). */
export function parseQueryOutput(stdout) {
  const start = stdout.indexOf("{");
  if (start === -1) throw new Error(`${PREFIX} supabase db query printed no JSON: ${stdout.slice(0, 200)}`);
  const parsed = JSON.parse(stdout.slice(start));
  if (!Array.isArray(parsed.rows)) throw new Error(`${PREFIX} supabase db query returned no rows array`);
  return parsed.rows;
}

let running = null;
/** Runs the CLI without blocking the event loop, so a signal is handled at once. */
function supabase(args, { timeout = 300000, quiet = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("supabase", args, { stdio: ["ignore", "pipe", "pipe"] });
    running = child;
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    child.on("error", (error) => {
      clearTimeout(timer);
      running = null;
      reject(
        error.code === "ENOENT"
          ? new Error(`${PREFIX} the supabase CLI is not on PATH. Install Supabase CLI v2.121.0 or later (docs/local-supabase-development.md); this check cannot pass without it.`)
          : error,
      );
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      running = null;
      if (!quiet && status !== 0) {
        reject(new Error(`${PREFIX} supabase ${args.join(" ")} failed (${signal ?? `exit ${status}`}):\n${(stderr || stdout).trim().slice(-2000)}`));
      } else {
        resolve({ status, stdout, stderr });
      }
    });
  });
}

// Nothing to clean up until the CLI is known to be there.
let cleaned = true;
/**
 * Stops and destroys this project's stack; safe to call more than once.
 * Returns false when either step did not succeed, so the run cannot pass.
 */
function cleanup() {
  if (cleaned) return true;
  cleaned = true;
  let ok = true;
  // 15 s + 12 s: both fit in the 30 s step grace verify:pr gives on a stop
  // (VERIFY_LOCAL_STEP_GRACE_MS in verify-local.config.json); each takes a
  // second or two normally.
  for (const [args, timeout] of [[["stop", "--output-format", "json"], 15000], [["stack", "destroy", "--yes", "--output-format", "json"], 12000]]) {
    const result = spawnSync("supabase", args, { encoding: "utf8", timeout, killSignal: "SIGKILL" });
    if (result.status !== 0 && !/No managed stack/i.test(`${result.stdout}${result.stderr}`)) {
      ok = false;
      console.error(`${PREFIX} FAIL supabase ${args.join(" ")} did not succeed (${result.error?.message ?? `exit ${result.status}`}): ${(result.stderr || result.stdout || "").trim().slice(-500)}`);
    }
  }
  return ok;
}

function seconds(since) {
  return `${((Date.now() - since) / 1000).toFixed(1)} s`;
}

async function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.chdir(root);
  const allowlist = JSON.parse(readFileSync(path.join(root, "supabase", "db-grants-allowlist.json"), "utf8"));
  allowedGrants(allowlist);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      console.error(`${PREFIX} ${signal}: stopping and destroying the local stack`);
      running?.kill("SIGTERM");
      cleanup();
      process.exit(signal === "SIGINT" ? 130 : signal === "SIGHUP" ? 129 : 143);
    });
  }
  const started = Date.now();
  const version = (await supabase(["--version"])).stdout.trim();
  cleaned = false;
  try {
    const status = await supabase(["status", "--output-format", "json"], { quiet: true, timeout: 60000 });
    if (status.status === 0) {
      console.log(`${PREFIX} reusing the running stack of this checkout (CLI ${version}); the reset wipes its data and the stack is destroyed at the end`);
    } else {
      await supabase(["start", "--runtime", "native", "--output-format", "json"]);
      console.log(`${PREFIX} native stack started (CLI ${version}) in ${seconds(started)}`);
    }
    const reset = Date.now();
    await supabase(["db", "reset", "--output-format", "json"]);
    console.log(`${PREFIX} supabase db reset in ${seconds(reset)}`);
    const relations = parseQueryOutput((await supabase(["db", "query", RELATIONS_SQL, "--output-format", "json"])).stdout);
    const functions = parseQueryOutput((await supabase(["db", "query", FUNCTIONS_SQL, "--output-format", "json"])).stdout);
    const { failures, views, notes } = evaluate({ relations, functions }, allowlist);
    const tables = relations.filter((row) => row.kind === "r" || row.kind === "p").length;
    console.log(`${PREFIX} ${tables} tables (partitions included), ${views.length} views, ${functions.length} security definer functions in public`);
    for (const view of views) console.log(`${PREFIX} view ${view}`);
    for (const note of notes) console.log(`${PREFIX} note ${note}`);
    for (const failure of failures) console.error(`${PREFIX} FAIL ${failure}`);
    if (failures.length) {
      console.error(`${PREFIX} ${failures.length} problem(s) after ${seconds(started)}`);
      process.exitCode = 1;
    } else {
      console.log(`${PREFIX} passed in ${seconds(started)} (stack teardown follows)`);
    }
  } finally {
    if (!cleanup()) {
      console.error(`${PREFIX} the stack teardown failed; run \`supabase stop\` and \`supabase stack destroy --yes\` here`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    cleanup();
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
