import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { sha256 } from "./transfer-contract.mjs";

/** Static production server call evidence, not proof of endpoint authorization. */
export function collectServerRpcCalls(root) {
  const calls = [], dynamic = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.[cm]?[jt]sx?$/.test(file) || /(?:\.test\.|\.spec\.|__tests__)/.test(file)) continue;
      const text = fs.readFileSync(file, "utf8"), tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const variables = new Map();
      function declarations(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) variables.set(node.name.text, [...(variables.get(node.name.text) || []), node.initializer]);
        ts.forEachChild(node, declarations);
      }
      declarations(tree);
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "rpc") {
          const first = node.arguments[0];
          let second = node.arguments[1];
          if (second && ts.isIdentifier(second) && variables.get(second.text)?.length === 1) second = variables.get(second.text)[0];
          const location = { file: path.relative(root, file), line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1, file_sha256: sha256(text) };
          if (first && ts.isStringLiteralLike(first)) {
            const argumentNames = second && ts.isObjectLiteralExpression(second) && second.properties.every(p => !ts.isSpreadAssignment(p) && p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) ? second.properties.map(p => p.name.text).sort() : null;
            calls.push({ name: first.text, argument_names: argumentNames, ...location });
          } else dynamic.push(location);
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
  for (const folder of ["src/server", "src/pages/api"]) walk(path.join(root, folder));
  return { calls, dynamic };
}

export function buildAuthorizationReview({ catalogBytes, expectedCatalogSha256, census, inventory }) {
  if (!Buffer.isBuffer(catalogBytes) || sha256(catalogBytes) !== expectedCatalogSha256) throw new Error("Catalog binding mismatch");
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  if (!Array.isArray(catalog.routines) || !Array.isArray(catalog.objects) || !Array.isArray(catalog.default_acl) || !Array.isArray(census.calls) || !Array.isArray(census.dynamic)) throw new Error("Complete catalog and call census required");
  const sourcePublicNames = new Map();
  for (const routine of catalog.routines.filter(r => r.schema === "public")) sourcePublicNames.set(routine.name, (sourcePublicNames.get(routine.name) || 0) + 1);
  const tableNames = new Set(catalog.objects.filter(r => ["r", "p", "table", "partitioned table"].includes(r.kind)).map(r => `${r.schema}.${r.name}`));
  const routines = catalog.routines.map(r => {
    if (typeof r.identity_arguments !== "string") throw new Error("Routine identity arguments missing");
    const callsites = r.schema === "public" ? census.calls.filter(c => c.name === r.name) : [];
    const overloaded = (sourcePublicNames.get(r.name) || 0) > 1;
    const names = r.identity_arguments ? r.identity_arguments.split(",").map(a => a.trim().match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1]).sort() : [];
    const exactNamedCalls = names.every(Boolean) && callsites.some(c => Array.isArray(c.argument_names) && JSON.stringify(c.argument_names) === JSON.stringify(names));
    const invokerCandidate = callsites.length > 0 && (!overloaded || exactNamedCalls) && !r.security_definer;
    const bodyReview = inventory.objects.filter(o => o.kind === "FUNCTION" && o.schema === r.schema && o.name.split("(")[0] === r.name);
    const tablePaths = [...new Set(bodyReview.flatMap(o => o.textual_references).filter(ref => tableNames.has(ref)))].sort();
    const required = [];
    if (overloaded && callsites.length && !exactNamedCalls) required.push("Resolve named arguments/defaults and type casts against this exact overload; never grant every same-name overload");
    if (r.security_definer) required.push("Exact replacement owner, dependency privileges and fixed trusted search_path; evaluate each executed path under NOLOGIN non-bypass owner");
    if (callsites.length) required.push("Run each cited server call with owner/actor/token mismatch fixtures; verify denial occurs before mutation and return rows are tenant-scoped");
    if (tablePaths.length) required.push("Per-operation SELECT/INSERT/UPDATE/DELETE and column grants plus RLS for listed table paths; include downstream triggers and invoker callees");
    if (r.name.includes("contact_reveal")) required.push("Bilateral consent, distinct parties and wrong actor must deny disclosure; exercise approval side effects");
    if (r.name.includes("evidence") || r.name.includes("upload")) required.push("Reservation owner/submitted_by, expiry, storage locator and finalized-state mismatch fixtures");
    if (r.name.includes("escrow") || r.name.includes("offer") || r.name.includes("transaction")) required.push("Participant ownership and legal state transition checks, concurrent duplicate attempts, and side-effect trigger closure");
    if (r.name.includes("connect") || r.name.includes("installation")) required.push("Poll/session token mismatch, expiry, scope narrowing and revocation invariants");
    return {
      identity: { schema: r.schema, name: r.name, kind: r.kind, identity_arguments: r.identity_arguments }, source_definition_sha256: r.definition_sha256, source_metadata_sha256: r.metadata_sha256,
      source_owner: r.owner, source_security_definer: r.security_definer, source_search_path: r.search_path,
      source_public_execute: (r.acl || []).some(a => /^=[^/]*X/.test(a)),
      ownership: r.security_definer ? "explicit-per-signature-NOLOGIN-role-review-required" : "non-runtime-NOLOGIN-schema-owner-proposed-not-yet-selected",
      public_execute: "revoke-before-commit", runtime_execute: invokerCandidate ? "candidate-exact-signature-clawdeals_app" : "withhold-until-specific-review",
      disposition: invokerCandidate ? "server-invoker-candidate" : callsites.length ? "called-but-signature-or-definer-review-required" : "not-in-static-direct-RPC-census",
      callsites, exact_named_argument_match: exactNamedCalls, qualified_table_paths: tablePaths, table_paths_complete: false,
      source_acl_copy: false, required_fixtures_or_decisions: required
    };
  });
  return {
    format: "clawdeals-authorization-review-v1", catalog_sha256: expectedCatalogSha256,
    source_schema_review_sha256: inventory.artifact_sha256, independent_snapshots: true,
    review_only: true, executable: false, restore_eligible: false,
    role_constraints: { clawdeals_app: { owner: false, bypass_rls: false, superuser: false, create_role: false, schema_create: false, elevated_membership: false, intended_boundary: "trusted-server-only; never browser/DataAPI credentials" }, definer_roles: "NOLOGIN, no bypass, explicit per-object grants; runtime cannot SET ROLE into owners" },
    routines,
    missing_source_rpc_names: [...new Set(census.calls.map(c => c.name).filter(n => !sourcePublicNames.has(n)))].sort(), dynamic_rpc_callsites: census.dynamic,
    default_acl_decisions: catalog.default_acl.map(d => ({ source_role: d.role, schema: d.schema, object_type: d.object_type, source_metadata_sha256: d.metadata_sha256, action: "do-not-copy", target: "new-owner defaults deny PUBLIC and runtime; per-object reviewed grants only" })),
    policy_decisions: catalog.policies.map(p => ({ identity: { schema: p.schema, relation: p.relation, name: p.name }, source_roles: p.roles, command: p.command, using_sha256: p.using_sha256, check_sha256: p.check_sha256, source_metadata_sha256: p.metadata_sha256, action: "no-mechanical-role-renaming", missing: "Source service_role bypassed these policies. Review explicit per-operation server-only USING(true)/WITH CHECK(true) policy with route-level ownership checks; do not claim DB tenant isolation" })),
    relation_decisions: catalog.objects.map(o => ({ schema: o.schema, name: o.name, kind: o.kind, source_metadata_sha256: o.metadata_sha256, source_owner: o.owner, source_rls: o.relrowsecurity, source_force_rls: o.relforcerowsecurity, runtime_ownership: false, runtime_grants: o.schema === "private" ? "none-direct; exact-definer-role-only" : "only-operation-specific-reviewed-grants", policy_candidate: o.schema === "private" ? "no-clawdeals_app-policy" : "FOR each reviewed operation TO clawdeals_app USING(true)/WITH CHECK(true) as applicable; preserves trusted-server semantics, not DB tenant isolation", owner_decision: "non-runtime-NOLOGIN-owner; audit partition ownership has separate reviewed plan" })),
    views: catalog.objects.filter(o => ["v", "m", "view", "materialized view"].includes(o.kind)).map(o => ({ schema: o.schema, name: o.name, decision: "withhold-runtime-SELECT-until-view-owner-and-security_invoker-or-barrier-semantics-reviewed", missing: "reloptions and exact view expression closure; test cross-tenant rows through view and underlying relations" })),
    locks: ["exact same-archive DDL and catalog binding", "structural routine overload/default-argument resolution", "approved target role attributes/membership and actual owner selection", "operation-specific table/column/RLS and trigger closure", "all-path tenant/server invariants", "PostGIS version/schema compatibility", "final source recheck after freeze"]
  };
}
