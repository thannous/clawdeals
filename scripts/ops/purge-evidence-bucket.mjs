import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_BUCKET = "evidence";
const DEFAULT_LIST_BATCH_SIZE = 1000;
const DEFAULT_REMOVE_BATCH_SIZE = 100;

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function loadDotenvFallback() {
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", ".env.local")
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: false });
    break;
  }
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function isFolderEntry(entry) {
  return entry?.id == null && entry?.metadata == null;
}

async function listObjectNamesRecursive(supabase, bucketId, listBatchSize) {
  const names = [];
  const queue = [""];

  while (queue.length > 0) {
    const prefix = queue.shift();
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucketId).list(prefix, {
        limit: listBatchSize,
        offset,
        sortBy: { column: "name", order: "asc" }
      });

      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) break;

      for (const row of data) {
        const rowName = typeof row?.name === "string" ? row.name : "";
        if (!rowName) continue;

        const fullPath = prefix ? `${prefix}/${rowName}` : rowName;
        if (isFolderEntry(row)) {
          queue.push(fullPath);
        } else {
          names.push(fullPath);
        }
      }

      if (data.length < listBatchSize) break;
      offset += data.length;
    }
  }

  return names;
}

async function purgeEvidenceBucket({
  supabase,
  bucketId,
  listBatchSize,
  removeBatchSize,
  dryRun
}) {
  const objectNames = await listObjectNamesRecursive(supabase, bucketId, listBatchSize);
  const before = objectNames.length;
  console.log(`[purge-evidence] bucket=${bucketId} objects_before=${before}`);

  if (dryRun) {
    const sample = objectNames.slice(0, 10);
    console.log(`[purge-evidence] dry-run sample=${JSON.stringify(sample)}`);
    return { before, removed: 0, after: before };
  }

  let removed = 0;
  for (let i = 0; i < objectNames.length; i += removeBatchSize) {
    const batch = objectNames.slice(i, i + removeBatchSize);
    if (batch.length === 0) continue;

    const { error } = await supabase.storage.from(bucketId).remove(batch);
    if (error) throw error;

    removed += batch.length;
    console.log(`[purge-evidence] removed=${removed}/${objectNames.length}`);
  }

  const after = (await listObjectNamesRecursive(supabase, bucketId, listBatchSize)).length;
  console.log(`[purge-evidence] objects_after=${after}`);
  return { before, removed, after };
}

async function main() {
  loadDotenvFallback();

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const bucketId = process.env.EVIDENCE_BUCKET_ID || DEFAULT_BUCKET;
  const listBatchSize = Math.min(toPositiveInt(process.env.EVIDENCE_LIST_BATCH_SIZE, DEFAULT_LIST_BATCH_SIZE), 1000);
  const removeBatchSize = Math.min(toPositiveInt(process.env.EVIDENCE_REMOVE_BATCH_SIZE, DEFAULT_REMOVE_BATCH_SIZE), 1000);
  const dryRun = process.argv.includes("--dry-run");

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } });
  const result = await purgeEvidenceBucket({ supabase, bucketId, listBatchSize, removeBatchSize, dryRun });

  if (!dryRun && result.after !== 0) {
    throw new Error(`[purge-evidence] Bucket not empty after purge: ${result.after} object(s) remain.`);
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`[purge-evidence] failed: ${error.message}`);
  } else if (error && typeof error === "object") {
    console.error(`[purge-evidence] failed: ${JSON.stringify(error)}`);
  } else {
    console.error(`[purge-evidence] failed: ${String(error)}`);
  }
  process.exit(1);
});
