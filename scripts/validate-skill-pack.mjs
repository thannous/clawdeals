import fs from "node:fs";
import path from "node:path";

function fail(msg) {
  console.error(`validate-skill-pack: ${msg}`);
  process.exit(1);
}

function readUtf8(p) {
  return fs.readFileSync(p, "utf8");
}

function existsFile(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile();
  } catch {
    return false;
  }
}

function supportsExecutableBitChecks(dir) {
  const probePath = path.join(dir, `.perm-probe-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probePath, "probe\n", "utf8");

    fs.chmodSync(probePath, 0o644);
    const mode644 = fs.statSync(probePath).mode & 0o777;

    fs.chmodSync(probePath, 0o755);
    const mode755 = fs.statSync(probePath).mode & 0o777;

    return (mode644 & 0o111) === 0 && (mode755 & 0o111) !== 0;
  } catch {
    return false;
  } finally {
    try {
      fs.unlinkSync(probePath);
    } catch {
      // ignore
    }
  }
}

function extractFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  return m ? m[1] : null;
}

function listRelativeLinks(markdown) {
  const links = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(markdown))) {
    let raw = match[1].trim();
    // Markdown allows a <...> wrapper around URLs/paths.
    if (raw.startsWith("<") && raw.endsWith(">")) raw = raw.slice(1, -1).trim();

    const withoutHash = raw.split("#")[0].split("?")[0].trim();
    if (!withoutHash) continue;

    // Skip same-doc anchors and explicit URL schemes (https:, mailto:, etc).
    if (withoutHash.startsWith("#")) continue;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withoutHash)) continue;

    // Treat anything else as a local path we must ship in the published bundle.
    links.push(withoutHash);
  }
  return links;
}

function isPathInsideDir(dir, p) {
  const rel = path.relative(dir, p);
  if (!rel || rel === "." || rel === "..") return false;
  if (rel.startsWith(`..${path.sep}`)) return false;
  if (path.isAbsolute(rel)) return false;
  return true;
}

const skillDir = path.join(process.cwd(), "skills", "clawdeals");

if (!fs.existsSync(skillDir)) {
  fail(`missing directory: ${skillDir}`);
}

const required = [
  "SKILL.md",
  "HEARTBEAT.md",
  "POLICIES.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "reference.md",
  "examples.md"
];

for (const f of required) {
  const p = path.join(skillDir, f);
  if (!existsFile(p)) fail(`missing required file: skills/clawdeals/${f}`);
}

const canCheckExecutableBits = supportsExecutableBitChecks(skillDir);

// Docs-only: no subfolders, no non-md files, no executable bits.
for (const ent of fs.readdirSync(skillDir, { withFileTypes: true })) {
  if (ent.isDirectory()) {
    fail(`unexpected subdirectory in skills/clawdeals/: ${ent.name}`);
  }
  if (!ent.isFile()) {
    fail(`unexpected non-file entry in skills/clawdeals/: ${ent.name}`);
  }
  if (!ent.name.endsWith(".md")) {
    fail(`non-doc file found in skills/clawdeals/: ${ent.name}`);
  }
  if (canCheckExecutableBits) {
    const st = fs.statSync(path.join(skillDir, ent.name));
    if ((st.mode & 0o111) !== 0) {
      fail(`executable bit set on skills/clawdeals/${ent.name}`);
    }
  }
}

const skillMdPath = path.join(skillDir, "SKILL.md");
const skillMd = readUtf8(skillMdPath);

if (!skillMd.includes("clawhub install clawdeals")) {
  fail("SKILL.md must document installation: `clawhub install clawdeals`");
}

const fm = extractFrontmatter(skillMd);
if (!fm) fail("SKILL.md missing YAML frontmatter");

for (const key of ["name:", "version:", "description:", "permissions:", "entrypoints:"]) {
  if (!fm.includes(key)) fail(`SKILL.md frontmatter missing key: ${key.replace(":", "")}`);
}

const versionLine = fm
  .split("\n")
  .map((l) => l.trim())
  .find((l) => l.startsWith("version:"));

if (!versionLine) fail("SKILL.md frontmatter missing version");
const version = versionLine.replace(/^version:\s*/, "").replace(/^"|"$/g, "");
if (!/^0\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`SKILL.md version must be semver 0.x (got: ${version})`);
}

if (!/permissions:\n(?:[ \t]*-[^\n]*\n)+/m.test(fm)) {
  fail("SKILL.md permissions must be a YAML list");
}
if (!/^\s*-\s*("?no-exec"?)\s*$/m.test(fm)) {
  fail('SKILL.md permissions must include "no-exec"');
}

// Verify all relative links in SKILL.md resolve to a file on disk.
for (const rel of listRelativeLinks(skillMd)) {
  const p = path.resolve(skillDir, rel);
  if (!isPathInsideDir(skillDir, p)) {
    fail(`relative link escapes skills/clawdeals/: (${rel})`);
  }
  if (!existsFile(p)) {
    fail(`broken relative link in SKILL.md: (${rel})`);
  }
}

const changelog = readUtf8(path.join(skillDir, "CHANGELOG.md"));
if (!changelog.includes(version)) {
  fail(`CHANGELOG.md must include current version ${version}`);
}

console.log("validate-skill-pack: OK");
