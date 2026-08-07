import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { transformSupabasePublicDump } from "./neon-portability.mjs";

function parseArgs(argv) {
  const inputArg = argv.find((arg) => arg.startsWith("--input="));
  if (!inputArg) throw new Error("Missing --input=migration-artifacts/.../supabase-public.sql");
  return { input: inputArg.slice("--input=".length) };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifactsRoot = path.resolve("migration-artifacts");
  const inputPath = path.resolve(args.input);
  if (!inputPath.startsWith(`${artifactsRoot}${path.sep}`)) {
    throw new Error("--input must stay inside migration-artifacts/");
  }
  if (path.basename(inputPath) !== "supabase-public.sql") {
    throw new Error("--input must point to a supabase-public.sql export");
  }

  const input = fs.readFileSync(inputPath, "utf8");
  const transformed = transformSupabasePublicDump(input);
  if (transformed.blockers.length > 0) {
    throw new Error(`Neon portability blockers remain: ${transformed.blockers.join(", ")}`);
  }

  const outputPath = path.join(path.dirname(inputPath), "neon-public.sql");
  fs.writeFileSync(outputPath, transformed.sql, { encoding: "utf8", mode: 0o600 });
  const manifest = {
    created_at: new Date().toISOString(),
    input: path.basename(inputPath),
    input_sha256: sha256(input),
    output: path.basename(outputPath),
    output_sha256: sha256(transformed.sql),
    stripped_statements: transformed.counts,
    blockers: transformed.blockers
  };
  fs.writeFileSync(
    path.join(path.dirname(inputPath), "neon-prepare-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  console.log(`[migration-prepare-neon] output=${outputPath}`);
  console.log(`[migration-prepare-neon] sha256=${manifest.output_sha256}`);
}

try {
  main();
} catch (error) {
  console.error(`[migration-prepare-neon] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
