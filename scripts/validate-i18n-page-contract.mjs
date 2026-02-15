import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "src/pages");

const EXEMPT_FILES = new Set([
  "src/pages/_app.tsx",
  "src/pages/_document.tsx",
  "src/pages/sitemap.xml.ts",
  "src/pages/robots.txt.ts"
]);

const NON_VISUAL_ALLOWLIST = new Set([
  "src/pages/explore/index.tsx"
]);

const PAGE_EXT_RE = /\.(ts|tsx)$/;
const I18N_CONTRACT_RE =
  /getI18nStaticProps|getI18nServerSideProps|withMessages\s*\(|loadMessages\s*\(|messages\s*:\s*await\s+loadMessages/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api") continue;
      out.push(...walk(full));
      continue;
    }
    out.push(full);
  }
  return out;
}

function toRel(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll("\\\\", "/");
}

function isVisualPage(content) {
  if (!/export\s+default\s+/.test(content)) return false;
  if (/return\s+null\s*;/.test(content) && !/<[A-Za-z]/.test(content)) return false;
  return true;
}

const failures = [];

for (const filePath of walk(ROOT)) {
  if (!PAGE_EXT_RE.test(filePath)) continue;
  const rel = toRel(filePath);
  if (EXEMPT_FILES.has(rel) || NON_VISUAL_ALLOWLIST.has(rel)) continue;

  const content = fs.readFileSync(filePath, "utf8");
  if (!isVisualPage(content)) continue;

  if (!I18N_CONTRACT_RE.test(content)) {
    failures.push(rel);
  }
}

if (failures.length > 0) {
  console.error("\n[i18n-contract] Visual pages missing i18n messages contract:\n");
  for (const file of failures) {
    console.error(`- ${file}`);
  }
  console.error("\nAdd getI18nStaticProps/getI18nServerSideProps/withMessages (or explicit non-visual allowlist).\n");
  process.exit(1);
}

console.log("[i18n-contract] OK");
