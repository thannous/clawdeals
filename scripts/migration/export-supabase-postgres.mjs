import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";

import { assertNonProdTarget, extractSupabaseRef } from "../lib/assert-non-prod-target.mjs";

function loadDotenvFallback() {
  for (const candidate of [path.resolve(".env.local"), path.resolve("..", ".env.local")]) {
    if (!fs.existsSync(candidate)) continue;
    dotenv.config({ path: candidate, override: false });
    break;
  }
}

function parseArgs(argv) {
  const execute = argv.includes("--execute");
  const outputArg = argv.find((arg) => arg.startsWith("--output-dir="));
  return {
    execute,
    outputDir: outputArg ? outputArg.slice("--output-dir=".length) : null
  };
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolveProjectRef(parsed, sourceUrl) {
  const explicit = process.env.SUPABASE_PROJECT_REF?.trim().toLowerCase();
  const fromHost = extractSupabaseRef(sourceUrl);
  const username = decodeURIComponent(parsed.username).toLowerCase();
  const fromPoolerUser = username.match(/\.([a-z0-9]{20})$/)?.[1] || null;
  const projectRef = explicit || fromHost || fromPoolerUser;
  if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error(
      "Unable to identify Supabase project ref; set SUPABASE_PROJECT_REF so the production guardrail can verify the source"
    );
  }
  return projectRef;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false, ...options });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function main() {
  loadDotenvFallback();
  const args = parseArgs(process.argv.slice(2));
  const configuredSourceUrl = process.env.SUPABASE_DB_URL?.trim() || null;
  if (!configuredSourceUrl && !args.execute) {
    console.log("[migration-export-db] plan only; requires SUPABASE_DB_URL and --execute for a non-production source");
    return;
  }
  const sourceUrl = configuredSourceUrl || requireEnv("SUPABASE_DB_URL");
  const parsed = new URL(sourceUrl);
  const projectRef = resolveProjectRef(parsed, sourceUrl);

  assertNonProdTarget({
    context: "the Supabase PostgreSQL export",
    supabaseTargets: [
      { label: "SUPABASE_DB_URL", value: sourceUrl },
      { label: "SUPABASE_PROJECT_REF", value: `https://${projectRef}.supabase.co` }
    ]
  });

  const artifactsRoot = path.resolve("migration-artifacts");
  const outputDir = path.resolve(args.outputDir || path.join(artifactsRoot, `postgres-${timestamp()}`));
  if (outputDir !== artifactsRoot && !outputDir.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new Error("--output-dir must stay inside migration-artifacts/");
  }

  const fullDumpPath = path.join(outputDir, "supabase-full.sql");
  const publicDumpPath = path.join(outputDir, "supabase-public.sql");
  console.log(`[migration-export-db] source_host=${parsed.hostname}`);
  console.log(`[migration-export-db] output=${outputDir}`);
  console.log("[migration-export-db] mode=read-only plain SQL dump; production is refused by guardrail");

  if (!args.execute) {
    console.log("[migration-export-db] plan only; add --execute to run pg_dump against a non-production source");
    return;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const pgEnv = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: parsed.searchParams.get("sslmode") || "require"
  };

  const commonArgs = [
      "--host", parsed.hostname,
      "--port", parsed.port || "5432",
      "--username", decodeURIComponent(parsed.username),
      "--dbname", databaseName,
      "--format", "plain",
      "--encoding", "UTF8",
      "--no-owner",
      "--no-privileges"
  ];

  await run(
    "pg_dump",
    [...commonArgs, "--file", fullDumpPath],
    { env: pgEnv }
  );
  await run(
    "pg_dump",
    [...commonArgs, "--schema", "public", "--file", publicDumpPath],
    { env: pgEnv }
  );

  const files = [];
  for (const filePath of [fullDumpPath, publicDumpPath]) {
    const stat = fs.statSync(filePath);
    files.push({
      file: path.basename(filePath),
      bytes: stat.size,
      sha256: await sha256File(filePath)
    });
  }
  const manifest = {
    created_at: new Date().toISOString(),
    source_host: parsed.hostname,
    source_project_ref: projectRef,
    database: databaseName,
    files,
    format: "postgresql-plain-sql"
  };
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  console.log(`[migration-export-db] complete files=${files.length}`);
}

main().catch((error) => {
  console.error(`[migration-export-db] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
