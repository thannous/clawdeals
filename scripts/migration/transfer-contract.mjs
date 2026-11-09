import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digest = value => sha256(canonical(value));
export function fresh(observed, maxMs = 15 * 60_000, now = Date.now()) {
  const age = now - Date.parse(observed);
  if (!Number.isFinite(age) || age < -30_000 || age > maxMs) throw new Error("Evidence missing or stale");
}
export function parseConnection(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Invalid database connection"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) || url.hash) throw new Error("Invalid database connection");
  for (const [key, value] of url.searchParams) {
    if (key !== "sslmode" || !["require", "verify-full"].includes(value)) throw new Error("Unapproved connection parameter");
  }
  return url;
}
export function identity(url) {
  return { host: url.hostname, port: url.port || "5432", database: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username) };
}
export function bindSource(raw, ref) {
  if (!/^[a-z0-9]{20}$/.test(ref || "")) throw new Error("Exact source ref required");
  const url = parseConnection(raw), id = identity(url);
  const direct = id.host === `db.${ref}.supabase.co`;
  const pooler = /^[a-z0-9-]+\.[a-z0-9-]+\.pooler\.supabase\.com$/.test(id.host) && id.user.endsWith(`.${ref}`);
  if ((!direct && !pooler) || id.port !== "5432") throw new Error("Source identity mismatch or transaction pooler");
  return { ...id, project_ref: ref };
}
export function bindTarget(raw, evidence) {
  fresh(evidence?.observed_at);
  const url = parseConnection(raw), id = identity(url);
  if (!/^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(id.host) || id.host.includes("-pooler.") || id.port !== "5432") throw new Error("Direct Neon endpoint required");
  if (!evidence.project_id || !evidence.branch_id || evidence.host !== id.host || evidence.database !== id.database || evidence.restore_user !== id.user || evidence.isolated_rehearsal !== true) throw new Error("Target evidence mismatch");
  if (!Array.isArray(evidence.runtime_roles) || !evidence.runtime_roles.length || evidence.runtime_roles.includes(id.user) || /^(?:clawdeals_app|clawdeals_runtime)$/.test(id.user)) throw new Error("Distinct restore administrator required");
  return { ...id, project_id: evidence.project_id, branch_id: evidence.branch_id };
}
export function requireApproval(plan, approved) {
  fresh(plan.created_at, 24 * 3600_000);
  if (approved !== digest(plan)) throw new Error("Exact reviewed plan digest required");
}
export function verifyFreeze(freeze, source) {
  fresh(freeze?.observed_at, 5 * 60_000);
  if (freeze.source_project_ref !== source.project_ref || freeze.all_writers_disabled !== true || freeze.verified !== true || !freeze.rollback_preserves_post_cutover_writes) throw new Error("Verified bounded write freeze required");
  const end = Date.parse(freeze.expires_at), start = Date.parse(freeze.started_at);
  if (!(start <= Date.now() && end - start <= 3600_000 && end - Date.now() >= 20 * 60_000)) throw new Error("Freeze window insufficient");
}
export function protectedPath(filename, { existing = true, root = path.resolve("migration-artifacts") } = {}) {
  const file = path.resolve(filename), base = path.resolve(root);
  if (!file.startsWith(`${base}${path.sep}`)) throw new Error("Artifacts must remain under migration-artifacts");
  let cursor = path.parse(file).root;
  for (const component of file.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, component);
    if (!fs.existsSync(cursor)) { if (existing) throw new Error("Missing protected artifact"); continue; }
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error("Artifact symlink refused");
    if ((cursor === base || cursor.startsWith(`${base}${path.sep}`)) && (stat.uid !== process.getuid() || (stat.mode & 0o077))) throw new Error("Artifact permissions must be private");
  }
  return file;
}
export function newDirectory(dir) {
  const filename = protectedPath(dir, { existing: false });
  const root = path.resolve("migration-artifacts");
  if (!fs.existsSync(root)) fs.mkdirSync(root, { mode: 0o700 });
  protectedPath(filename, { existing: false });
  fs.mkdirSync(filename, { mode: 0o700 });
  return filename;
}
export function writePrivate(file, bytes) {
  const name = protectedPath(file, { existing: false });
  fs.writeFileSync(name, bytes, { flag: "wx", mode: 0o600 });
}
export function pgEnvironment(raw, readOnly = false, ambient = process.env) {
  const url = parseConnection(raw), id = identity(url);
  const env = Object.fromEntries(Object.entries(ambient).filter(([key]) => !key.startsWith("PG")));
  for (const key of ["PGSSLROOTCERT", "PGSSLCRL", "PGSSLCRLDIR"]) if (ambient[key]) env[key] = ambient[key];
  if (!url.password && ambient.PGPASSFILE) {
    const stat = fs.lstatSync(ambient.PGPASSFILE);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw new Error("Passfile must be private and owned");
    env.PGPASSFILE = ambient.PGPASSFILE;
  }
  Object.assign(env, { PGHOST: id.host, PGPORT: id.port, PGUSER: id.user, PGDATABASE: id.database, PGSSLMODE: "verify-full", PGCONNECT_TIMEOUT: "15", PGAPPNAME: "clawdeals-reviewed-transfer", PGOPTIONS: `-c statement_timeout=900000${readOnly ? " -c default_transaction_read_only=on" : ""}` });
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  return env;
}
