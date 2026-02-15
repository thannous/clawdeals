import fs from "node:fs";
import path from "node:path";

const LOCALES = ["en", "fr", "es"];
const BASE = "en";

function kindOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function collectTypes(value, prefix = "", out = new Map()) {
  const kind = kindOf(value);
  out.set(prefix, kind);

  if (kind !== "object") return out;

  for (const key of Object.keys(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    collectTypes(value[key], next, out);
  }

  return out;
}

function loadMessages(locale) {
  const file = path.resolve(process.cwd(), `messages/${locale}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const data = Object.fromEntries(LOCALES.map((locale) => [locale, loadMessages(locale)]));
const baseTypes = collectTypes(data[BASE]);

let hasErrors = false;

for (const locale of LOCALES) {
  if (locale === BASE) continue;

  const currentTypes = collectTypes(data[locale]);
  const missing = [];
  const mismatches = [];

  for (const [keyPath, expectedType] of baseTypes) {
    if (!currentTypes.has(keyPath)) {
      missing.push(keyPath);
      continue;
    }
    const actualType = currentTypes.get(keyPath);
    if (actualType !== expectedType) {
      mismatches.push({ keyPath, expectedType, actualType });
    }
  }

  if (missing.length > 0 || mismatches.length > 0) {
    hasErrors = true;
    console.error(`\n[i18n-messages] ${locale}:`);

    if (missing.length > 0) {
      console.error(`  Missing keys (${missing.length}):`);
      for (const keyPath of missing.slice(0, 50)) {
        console.error(`  - ${keyPath}`);
      }
      if (missing.length > 50) {
        console.error(`  ... and ${missing.length - 50} more`);
      }
    }

    if (mismatches.length > 0) {
      console.error(`  Type mismatches (${mismatches.length}):`);
      for (const mismatch of mismatches.slice(0, 50)) {
        console.error(`  - ${mismatch.keyPath}: expected=${mismatch.expectedType} actual=${mismatch.actualType}`);
      }
      if (mismatches.length > 50) {
        console.error(`  ... and ${mismatches.length - 50} more`);
      }
    }
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log("[i18n-messages] OK");
