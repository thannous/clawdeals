import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { bindSource, bindTarget, digest, sha256, requireApproval, newDirectory, protectedPath, writePrivate, pgEnvironment } from "./transfer-contract.mjs";
import { readSecrets, runBuffered, readEncrypted, writeEncrypted } from "./transfer-secrets.mjs";
import { validateRehearsalEvidence, evidenceBinding, restoreScript } from "./rehearsal-restore.mjs";
const readJson = file => JSON.parse(fs.readFileSync(protectedPath(file), "utf8"));
async function encryptedJson(file, key) {
  const bytes = await readEncrypted(file, key);
  try { return JSON.parse(bytes.toString("utf8")); } finally { bytes.fill(0); }
}
async function saveJson(file, value, key) {
  const bytes = Buffer.from(JSON.stringify(value));
  try { await writeEncrypted(file, bytes, key); } finally { bytes.fill(0); }
}
function flags(argv) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!match || Object.hasOwn(result, match[1])) throw new Error("Invalid or repeated command option");
    result[match[1]] = match[2] ?? true;
  }
  return result;
}
function same(a, b) { if (digest(a) !== digest(b)) throw new Error("Bound identity or artifact changed"); }
export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv, args = flags(rest);
  const supported = ["rehearsal-plan", "rehearsal-export", "rehearsal-import-plan", "rehearsal-import"];
  if (!supported.includes(command)) throw new Error("Final cutover operations are not reconstructed; only explicit rehearsal commands are available");
  const allowed = new Set(["secrets-stdin", "source-ref", "out-dir", "plan", "manifest", "prepared-sql", "target-evidence", "rehearsal-evidence", "execute", "approved-plan-sha256"]);
  if (Object.keys(args).some(key => !allowed.has(key))) throw new Error("Unknown option; freeze/source substitutions are not accepted");
  if (!args["secrets-stdin"]) throw new Error("Private stdin is required; no URL or passphrase CLI flags");
  const secrets = await readSecrets(), key = secrets.artifact_passphrase;
  const out = args["out-dir"];
  if (command === "rehearsal-plan") {
    if (secrets.target_url || args.execute) throw new Error("Source-only offline planning required");
    const source = bindSource(secrets.source_url, args["source-ref"]);
    const plan = { kind: "clawdeals-readonly-rehearsal-plan-v2", created_at: new Date().toISOString(), source, schemas: ["public", "private"], coherent_pg_dump_snapshot: true, source_writes_may_continue: true, source_preserved: true, final_import_eligible: false, cutover_eligible: false, durable_recovery_verified: false };
    const dir = newDirectory(out); writePrivate(path.join(dir, "rehearsal-plan.json"), JSON.stringify(plan, null, 2));
    console.log(JSON.stringify({ plan_sha256: digest(plan), mode: "offline-plan" })); return;
  }
  if (command === "rehearsal-export") {
    const plan = readJson(args.plan);
    if (plan.kind !== "clawdeals-readonly-rehearsal-plan-v2" || plan.cutover_eligible !== false || plan.final_import_eligible !== false || digest(plan.schemas) !== digest(["public", "private"])) throw new Error("Wrong rehearsal plan");
    if (secrets.target_url) throw new Error("Export does not accept target credentials");
    if (!args.execute) { console.log(JSON.stringify({ mode: "dry-run", plan_sha256: digest(plan) })); return; }
    requireApproval(plan, args["approved-plan-sha256"]);
    same(plan.source, bindSource(secrets.source_url, plan.source.project_ref));
    await runBuffered("pg_dump", ["--version"]); await runBuffered("pg_restore", ["--version"]);
    const dir = newDirectory(out); let archive, verified, listing;
    try {
      archive = await runBuffered("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--schema=public", "--schema=private", "--no-password"], { env: pgEnvironment(secrets.source_url, true) });
      const archivePath = path.join(dir, "application.dump.gpg");
      await writeEncrypted(archivePath, archive, key);
      verified = await readEncrypted(archivePath, key);
      if (sha256(verified) !== sha256(archive)) throw new Error("Encrypted archive integrity mismatch");
      listing = await runBuffered("pg_restore", ["--list"], { input: verified });
      if (!listing.length) throw new Error("Archive catalog missing");
      const manifest = { kind: "clawdeals-readonly-rehearsal-manifest-v2", created_at: new Date().toISOString(), plan, plan_sha256: digest(plan), archive_file: "application.dump.gpg", archive_sha256: sha256(archive), archive_bytes: archive.length, archive_catalog_sha256: sha256(listing), final_import_eligible: false, cutover_eligible: false, durable_recovery_verified: false, complete_provider_backup: false };
      const manifestPath = path.join(dir, "rehearsal-manifest.json.gpg");
      await saveJson(manifestPath, manifest, key); same(await encryptedJson(manifestPath, key), manifest);
      console.log(JSON.stringify({ mode: "rehearsal-export-verified", complete_provider_backup: false, cutover_eligible: false }));
    } finally { archive?.fill(0); verified?.fill(0); listing?.fill(0); }
    return;
  }
  if (secrets.source_url) throw new Error("Rehearsal import must not receive source credentials");
  if (command === "rehearsal-import-plan") {
    if (args.execute) throw new Error("Planning never executes restore");
    const manifest = await encryptedJson(args.manifest, key);
    if (manifest.kind !== "clawdeals-readonly-rehearsal-manifest-v2" || manifest.final_import_eligible !== false || manifest.cutover_eligible !== false || manifest.plan?.source_preserved !== true || manifest.plan?.coherent_pg_dump_snapshot !== true || manifest.plan_sha256 !== digest(manifest.plan) || manifest.archive_file !== "application.dump.gpg") throw new Error("Valid coherent rehearsal snapshot required");
    const evidence = readJson(args["target-evidence"]), target = bindTarget(secrets.target_url, evidence), isolation = readJson(args["rehearsal-evidence"]);
    let archive, sql;
    try {
      archive = await readEncrypted(path.join(path.dirname(args.manifest), manifest.archive_file), key);
      if (sha256(archive) !== manifest.archive_sha256) throw new Error("Archive digest mismatch");
      sql = await readEncrypted(args["prepared-sql"], key);
      validateRehearsalEvidence(isolation, target, sha256(archive), sha256(sql));
      same(isolation.runtime_roles, evidence.runtime_roles);
      const script = restoreScript(sql.toString("utf8"), isolation);
      const plan = { kind: "clawdeals-isolated-rehearsal-import-v2", created_at: new Date().toISOString(), target, source: manifest.plan.source, archive_sha256: sha256(archive), sql_sha256: sha256(sql), script_sha256: sha256(script), evidence: isolation, evidence_binding: evidenceBinding(isolation), sql_file: "reviewed.sql.gpg", final_import_eligible: false, cutover_eligible: false, migration_complete: false };
      const dir = newDirectory(out); await writeEncrypted(path.join(dir, plan.sql_file), sql, key); await saveJson(path.join(dir, "rehearsal-import-plan.json.gpg"), plan, key);
      console.log(JSON.stringify({ mode: "offline-rehearsal-import-plan", plan_sha256: digest(plan), cutover_eligible: false }));
    } finally { archive?.fill(0); sql?.fill(0); }
    return;
  }
  const plan = await encryptedJson(args.plan, key);
  if (plan.kind !== "clawdeals-isolated-rehearsal-import-v2" || plan.final_import_eligible !== false || plan.cutover_eligible !== false || plan.sql_file !== "reviewed.sql.gpg") throw new Error("Wrong rehearsal import plan");
  if (!args.execute) { console.log(JSON.stringify({ mode: "dry-run", plan_sha256: digest(plan), cutover_eligible: false })); return; }
  requireApproval(plan, args["approved-plan-sha256"]);
  const targetEvidence = readJson(args["target-evidence"]), target = bindTarget(secrets.target_url, targetEvidence), isolation = readJson(args["rehearsal-evidence"]);
  same(target, plan.target); same(isolation.runtime_roles, targetEvidence.runtime_roles);
  if (evidenceBinding(isolation) !== plan.evidence_binding) throw new Error("Rehearsal isolation changed");
  let sql, script;
  try {
    sql = await readEncrypted(path.join(path.dirname(args.plan), plan.sql_file), key);
    if (sha256(sql) !== plan.sql_sha256) throw new Error("Reviewed SQL digest mismatch");
    validateRehearsalEvidence(isolation, target, plan.archive_sha256, sha256(sql));
    script = Buffer.from(restoreScript(sql.toString("utf8"), isolation));
    if (sha256(script) !== plan.script_sha256) throw new Error("Restore guards changed; replan");
    await runBuffered("psql", ["--version"]);
    const dir = newDirectory(out);
    writePrivate(path.join(dir, "attempt.json"), JSON.stringify({ started_at: new Date().toISOString(), plan_sha256: digest(plan), target, status: "started-outcome-unconfirmed" }));
    const result = await runBuffered("psql", ["-X", "--no-password", "--single-transaction", "--set=ON_ERROR_STOP=1", "--file=-"], { input: script, env: pgEnvironment(secrets.target_url) }); result.fill(0);
    writePrivate(path.join(dir, "rehearsal-result.json"), JSON.stringify({ completed_at: new Date().toISOString(), plan_sha256: digest(plan), target, status: "restore-transaction-confirmed", cutover_eligible: false, migration_complete: false }));
    console.log(JSON.stringify({ mode: "isolated-rehearsal-restored", cutover_eligible: false, migration_complete: false }));
  } finally { sql?.fill(0); script?.fill(0); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error("Transfer failed. No automatic retry or cleanup; inspect protected attempt markers. Details suppressed to protect secrets."); process.exitCode = 1; });
