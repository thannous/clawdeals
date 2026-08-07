import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { assertNonProdTarget } from "../lib/assert-non-prod-target.mjs";

const DEFAULT_BUCKETS = ["listing-photos", "evidence"];

function loadDotenvFallback() {
  for (const candidate of [path.resolve(".env.local"), path.resolve("..", ".env.local")]) {
    if (!fs.existsSync(candidate)) continue;
    dotenv.config({ path: candidate, override: false });
    break;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseArgs(argv) {
  const bucketsArg = argv.find((arg) => arg.startsWith("--buckets="));
  const outputArg = argv.find((arg) => arg.startsWith("--output-dir="));
  const buckets = (bucketsArg ? bucketsArg.slice("--buckets=".length).split(",") : DEFAULT_BUCKETS)
    .map((value) => value.trim())
    .filter(Boolean);
  if (buckets.length === 0 || buckets.some((bucket) => !/^[a-z0-9][a-z0-9._-]*$/i.test(bucket))) {
    throw new Error("--buckets must contain safe comma-separated bucket names");
  }
  return {
    execute: argv.includes("--execute"),
    buckets,
    outputDir: outputArg ? outputArg.slice("--output-dir=".length) : null
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeObjectPath(bucketRoot, objectKey) {
  const segments = String(objectKey).split("/");
  if (
    segments.length === 0 ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))
  ) {
    throw new Error(`Unsafe storage object key: ${objectKey}`);
  }
  const resolved = path.resolve(bucketRoot, ...segments);
  if (!resolved.startsWith(`${bucketRoot}${path.sep}`)) {
    throw new Error(`Storage object escaped export root: ${objectKey}`);
  }
  return resolved;
}

async function listObjects(client, bucket) {
  const objects = [];
  const queue = [""];
  while (queue.length > 0) {
    const prefix = queue.shift();
    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" }
      });
      if (error) throw error;
      if (!data?.length) break;
      for (const row of data) {
        const key = prefix ? `${prefix}/${row.name}` : row.name;
        if (row.id == null && row.metadata == null) queue.push(key);
        else objects.push(key);
      }
      if (data.length < 1000) break;
      offset += data.length;
    }
  }
  return objects;
}

async function exportBucket(client, bucket, outputRoot) {
  const bucketRoot = path.resolve(outputRoot, bucket);
  fs.mkdirSync(bucketRoot, { recursive: true });
  const objectKeys = await listObjects(client, bucket);
  const entries = [];

  for (const [index, key] of objectKeys.entries()) {
    const { data, error } = await client.storage.from(bucket).download(key);
    if (error || !data) throw error || new Error(`Missing object ${bucket}/${key}`);
    const bytes = Buffer.from(await data.arrayBuffer());
    const destination = safeObjectPath(bucketRoot, key);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { mode: 0o600 });
    entries.push({
      key,
      bytes: bytes.byteLength,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      content_type: data.type || null
    });
    console.log(`[migration-export-storage] bucket=${bucket} object=${index + 1}/${objectKeys.length}`);
  }

  return entries;
}

async function main() {
  loadDotenvFallback();
  const args = parseArgs(process.argv.slice(2));
  const configuredUrl = process.env.SUPABASE_URL?.trim() || null;
  const configuredServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  if ((!configuredUrl || !configuredServiceRoleKey) && !args.execute) {
    console.log(
      "[migration-export-storage] plan only; requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and --execute for a non-production source"
    );
    return;
  }
  const supabaseUrl = configuredUrl || requireEnv("SUPABASE_URL");
  const serviceRoleKey = configuredServiceRoleKey || requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertNonProdTarget({
    context: "the Supabase Storage export",
    supabaseTargets: [{ label: "SUPABASE_URL", value: supabaseUrl }]
  });

  const artifactsRoot = path.resolve("migration-artifacts");
  const outputRoot = path.resolve(args.outputDir || path.join(artifactsRoot, `storage-${timestamp()}`));
  if (outputRoot !== artifactsRoot && !outputRoot.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new Error("--output-dir must stay inside migration-artifacts/");
  }

  console.log(`[migration-export-storage] buckets=${args.buckets.join(",")}`);
  console.log(`[migration-export-storage] output=${outputRoot}`);
  console.log("[migration-export-storage] mode=read-only export; production is refused by guardrail");
  if (!args.execute) {
    console.log("[migration-export-storage] plan only; add --execute for a non-production source");
    return;
  }

  fs.mkdirSync(outputRoot, { recursive: true });
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const manifest = { created_at: new Date().toISOString(), source_url: supabaseUrl, buckets: {} };
  for (const bucket of args.buckets) {
    manifest.buckets[bucket] = await exportBucket(client, bucket, outputRoot);
  }
  fs.writeFileSync(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  console.log("[migration-export-storage] complete");
}

main().catch((error) => {
  console.error(`[migration-export-storage] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
