import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { auditQuerySurface } from "./audit-query-surface.mjs";
const ops = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const ident = (name) => { if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Invalid public table identifier"); return `"${name}"`; };
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const helpers = {
  "src/server/audit/supabase-writer.ts": { insert: ["audit_logs"] },
  "src/server/retention/shared.ts": { update: ["audit_logs", "reports"], delete: ["audit_logs", "reports"] },
  "src/server/observability/alerts.ts": { select: ["trustscore_recalc_queue", "watchlist_backfill_queue", "watchlist_match_queue"] },
  "src/server/services/console-ops-dashboard.ts": { select: ["approvals", "trustscore_recalc_queue", "watchlist_backfill_queue", "watchlist_match_queue"] }
};
export function deriveDirectTables(root, catalog, census = auditQuerySurface(root)) {
  const tables = new Map(), unresolved = [], cache = new Map();
  const source = (file) => {
    if (!cache.has(file)) { const text = fs.readFileSync(path.join(root, file), "utf8"); cache.set(file, { text, sha256: hash(text), ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true) }); }
    return cache.get(file);
  };
  const add = (name, operation, evidence) => {
    ident(name);
    if (!tables.has(name)) tables.set(name, { name, operations: new Set(), evidence: [] });
    const row = tables.get(name); row.operations.add(operation);
    const value = { ...evidence, source_sha256: source(evidence.file).sha256 };
    if (!row.evidence.some((old) => JSON.stringify(old) === JSON.stringify(value))) row.evidence.push(value);
  };
  for (const item of census.continuations) {
    if (item.kind !== "from" || !["select", "insert", "update", "delete", "upsert"].includes(item.method)) continue;
    const names = item.names.length ? item.names : helpers[item.file]?.[item.method];
    if (!names?.length) { unresolved.push(item); continue; }
    let operations = [item.method.toUpperCase()];
    if (item.method === "upsert") {
      const { ast } = source(item.file); let found = false, ignore = false, unknown = false;
      const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "upsert" && ast.getLineAndCharacterOfPosition(node.getStart()).line + 1 === item.line) {
          found = true; const options = node.arguments[1];
          if (options && !ts.isObjectLiteralExpression(options)) unknown = true;
          if (options && ts.isObjectLiteralExpression(options)) for (const prop of options.properties) {
            if (ts.isSpreadAssignment(prop)) unknown = true;
            if (prop.name?.getText() === "ignoreDuplicates" && ts.isPropertyAssignment(prop)) {
              ignore = prop.initializer.kind === ts.SyntaxKind.TrueKeyword;
              if (![ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(prop.initializer.kind)) unknown = true;
            }
          }
        }
        ts.forEachChild(node, visit);
      }; visit(ast);
      if (!found || unknown) { unresolved.push({ ...item, reason: "unresolved upsert options" }); continue; }
      operations = ignore ? ["INSERT"] : ["INSERT", "UPDATE"];
    }
    for (const name of names) {
      for (const operation of operations) add(name, operation, { file: item.file, line: item.line, method: item.method, bounded_helper: !item.names.length });
      // The current compiler emits SELECT t.* / RETURNING t.* even for minimal
      // writes, so full-row SELECT is a demonstrated adapter dependency.
      add(name, "SELECT", { file: item.file, line: item.line, method: "adapter full-row dependency", bounded_helper: !item.names.length });
    }
  }
  const objects = new Map(catalog.objects.filter((o) => o.schema === "public").map((o) => [o.name, o]));
  return { catalog_sha256: hash(JSON.stringify(catalog)), unresolved, tables: [...tables.values()].sort((a,b) => a.name.localeCompare(b.name)).map((row) => {
    const object = objects.get(row.name);
    const separate = row.name === "acquisition_funnel_events" ? "separate acquisition policy integration" : object?.kind === "v" ? "separate view role plan" : null;
    if (!object || !["r", "p", "v"].includes(object.kind) || object.relispartition) unresolved.push({ table: row.name, reason: "missing source public base-table identity or direct partition" });
    return { ...row, operations: ops.filter((op) => row.operations.has(op)), source_kind: object?.kind, metadata_sha256: object?.metadata_sha256, separate };
  }) };
}
export function renderDirectTableSql(report) {
  if (report.unresolved.length) throw new Error("Unresolved direct-table authorization evidence");
  const lines = ["-- REVIEW ONLY. Never execute against Supabase. Actual dump/column/default/trigger binding is required.", "-- Trusted server role semantics; USING(true) does NOT provide tenant isolation.", "-- Additive candidate, not an ACL reset: inherited/legacy grants and restrictive policies need separate review.", "BEGIN;", `DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clawdeals_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication) THEN RAISE EXCEPTION 'Restricted app role required'; END IF;
  IF has_database_privilege('clawdeals_app',current_database(),'TEMP') OR has_schema_privilege('clawdeals_app','public','CREATE') OR has_schema_privilege('clawdeals_app','private','USAGE') THEN RAISE EXCEPTION 'App TEMP/DDL/private access must be removed first'; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p') AND pg_has_role('clawdeals_app',c.relowner,'MEMBER')) THEN RAISE EXCEPTION 'App must not own or assume table owners'; END IF;
END $$;`, "GRANT USAGE ON SCHEMA public TO clawdeals_app;"];
  for (const table of report.tables) {
    if (table.separate) { lines.push(`-- EXCLUDED public.${table.name}: ${table.separate}; observed ${table.operations.join(', ')}.`); continue; }
    const name = ident(table.name), qualified = `public.${name}`;
    lines.push(`-- Source identity public.${table.name}; kind ${table.source_kind}; metadata SHA256 ${table.metadata_sha256}`);
    lines.push(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='${table.name}' AND c.relkind='${table.source_kind}' AND NOT c.relispartition) THEN RAISE EXCEPTION 'Unexpected public.${table.name} identity'; END IF; END $$;`);
    lines.push(`GRANT ${table.operations.join(", ")} ON TABLE ${qualified} TO clawdeals_app;`, `ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY;`, `ALTER TABLE ${qualified} FORCE ROW LEVEL SECURITY;`);
    for (const op of table.operations) lines.push(`CREATE POLICY ${ident(`neon_direct_${op.toLowerCase()}`)} ON ${qualified} FOR ${op} TO clawdeals_app ${op === "INSERT" ? "WITH CHECK (true)" : op === "UPDATE" ? "USING (true) WITH CHECK (true)" : "USING (true)"};`);
  }
  lines.push("ROLLBACK; -- Review candidate: actual dump parity and assembled authorization are not approved.");
  return lines.join("\n") + "\n";
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalogPath = process.argv[2]; if (!catalogPath) throw new Error("Provide the reviewed source catalog path");
  const bytes = fs.readFileSync(catalogPath); const report = deriveDirectTables(process.cwd(), JSON.parse(bytes));
  report.catalog_file_sha256 = hash(bytes);
  if (process.argv.includes("--sql")) process.stdout.write(renderDirectTableSql(report));
  else process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
