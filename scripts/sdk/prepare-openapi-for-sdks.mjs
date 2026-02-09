import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/**
 * We keep `docs/openapi-v1.yaml` canonical and strict (Idempotency-Key required).
 * For SDK generation we relax *client-side* requiredness so generated methods
 * don't force passing idempotencyKey everywhere; the SDK runtime injects it.
 *
 * This script performs a minimal, indentation-aware patch on the YAML text:
 * - finds `components: -> parameters: -> IdempotencyKey:` block
 * - flips `required: true` to `required: false`
 */
function patchIdempotencyRequired(yamlText) {
  const lines = yamlText.split(/\r?\n/);

  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*IdempotencyKey:\s*$/.test(lines[i])) {
      idx = i;
      break;
    }
  }
  if (idx === -1) {
    fail("prepare-openapi-for-sdks: could not find `IdempotencyKey:` block in OpenAPI spec.");
  }

  const baseIndent = (lines[idx].match(/^(\s*)/) || ["", ""])[1].length;
  let patched = false;

  for (let i = idx + 1; i < lines.length; i++) {
    const indent = (lines[i].match(/^(\s*)/) || ["", ""])[1].length;
    if (lines[i].trim() !== "" && indent <= baseIndent) break; // end of block

    if (/^\s*required:\s*true\s*$/.test(lines[i])) {
      lines[i] = lines[i].replace("required: true", "required: false");
      patched = true;
      break;
    }
  }

  if (!patched) {
    fail("prepare-openapi-for-sdks: found `IdempotencyKey:` but did not find `required: true` inside its block.");
  }

  return lines.join("\n");
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const input = path.join(repoRoot, "docs", "openapi-v1.yaml");

const outDir = path.join(repoRoot, "sdk", ".tmp");
const output = path.join(outDir, "openapi-v1.sdk.yaml");

fs.mkdirSync(outDir, { recursive: true });

const raw = fs.readFileSync(input, "utf8");
const patched = patchIdempotencyRequired(raw);
fs.writeFileSync(output, patched, "utf8");

process.stdout.write(output);
