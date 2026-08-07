import fs from "node:fs";
import path from "node:path";

function fail(msg) {
  console.error(`sync-skill-public: ${msg}`);
  process.exit(1);
}

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function writeUtf8(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

function extractFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return m ? m[1] : null;
}

function parseScalarFrontmatterValue(frontmatter, key) {
  const re = new RegExp(`^${key}:\\s*(.+)\\s*$`, "m");
  const m = frontmatter.match(re);
  if (!m?.[1]) return null;
  return m[1].trim().replace(/^"|"$/g, "");
}

const check = process.argv.includes("--check");

const repoRoot = process.cwd();
const srcDir = path.join(repoRoot, "skills", "clawdeals");
const publicDir = path.join(repoRoot, "public");

if (!fs.existsSync(srcDir)) fail(`missing source directory: ${srcDir}`);
if (!fs.existsSync(publicDir)) fail(`missing public directory: ${publicDir}`);

const sources = {
  "SKILL.md": ["skill.md"],
  "HEARTBEAT.md": ["heartbeat.md"],
  "POLICIES.md": ["policies.md"],
  "SECURITY.md": ["security.md"],
  "CHANGELOG.md": ["changelog.md"],
  "reference.md": ["reference.md"],
  "examples.md": ["examples.md"]
};

const skillMdPath = path.join(srcDir, "SKILL.md");
const skillMd = readUtf8(skillMdPath);
const fm = extractFrontmatter(skillMd);
if (!fm) fail("SKILL.md missing YAML frontmatter");

const name = parseScalarFrontmatterValue(fm, "name");
const version = parseScalarFrontmatterValue(fm, "version");
const description = parseScalarFrontmatterValue(fm, "description");
if (!name || !version || !description) {
  fail("SKILL.md frontmatter missing one of: name, version, description");
}

const siteUrl = "https://clawdeals.com";
const apiBase = "https://app.clawdeals.com/api";
const requiredEnvVars = ["CLAWDEALS_API_BASE", "CLAWDEALS_API_KEY"];
const primaryCredential = {
  type: "bearer_token",
  env: "CLAWDEALS_API_KEY",
  alternatives: ["oauth_device_flow", "oauth_access_token"]
};

const skillJson = JSON.stringify(
  {
    name,
    version,
    description,
    homepage: siteUrl,
    required_env_vars: requiredEnvVars,
    // Keep snake_case, camelCase, and kebab-case for registry/scanner compatibility.
    requiredEnvVars,
    "required-env-vars": requiredEnvVars,
    primary_credential: primaryCredential,
    primaryCredential,
    "primary-credential": primaryCredential,
    // ClawHub registry scanner reads metadata.clawdbot.requires.env for the package preview.
    metadata: {
      clawdbot: {
        requires: { env: requiredEnvVars },
        primaryEnv: "CLAWDEALS_API_KEY"
      }
    },
    clawdeals: {
      api_base: apiBase,
      files: {
        "skill.md": `${siteUrl}/skill.md`,
        "heartbeat.md": `${siteUrl}/heartbeat.md`,
        "policies.md": `${siteUrl}/policies.md`,
        "security.md": `${siteUrl}/security.md`,
        "changelog.md": `${siteUrl}/changelog.md`,
        "reference.md": `${siteUrl}/reference.md`,
        "examples.md": `${siteUrl}/examples.md`,
        "skill.json": `${siteUrl}/skill.json`
      }
    }
  },
  null,
  2
);

const desired = [];

for (const [srcName, outNames] of Object.entries(sources)) {
  const srcPath = path.join(srcDir, srcName);
  if (!fs.existsSync(srcPath)) fail(`missing source file: skills/clawdeals/${srcName}`);
  const content = readUtf8(srcPath);
  for (const outName of outNames) {
    desired.push({ outPath: path.join(publicDir, outName), content });
  }
}

desired.push({ outPath: path.join(publicDir, "skill.json"), content: `${skillJson}\n` });

// Compare with normalized line endings: git autocrlf may check files out as
// CRLF on Windows while the generator emits LF.
function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

let mismatches = 0;
for (const { outPath, content } of desired) {
  if (check) {
    try {
      const cur = readUtf8(outPath);
      if (normalizeEol(cur) !== normalizeEol(content)) mismatches++;
    } catch {
      mismatches++;
    }
  } else {
    if (!fs.existsSync(outPath) || normalizeEol(readUtf8(outPath)) !== normalizeEol(content)) {
      writeUtf8(outPath, content);
    }
  }
}

if (check && mismatches > 0) {
  fail(`public skill files out of date (mismatches: ${mismatches}). Run: node scripts/sync-skill-public.mjs`);
}

console.log(check ? "sync-skill-public: OK" : "sync-skill-public: synced");
