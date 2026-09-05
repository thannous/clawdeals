import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readFile(relPath: string) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function extractFrontmatter(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? match[1] : null;
}

function extractFencedBlocks(markdown: string) {
  const blocks: Array<{ info: string; content: string }> = [];
  // Support both LF and CRLF line endings.
  const re = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)\r?\n```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    blocks.push({ info: match[1] || "", content: match[2] || "" });
  }
  return blocks;
}

function listRelativeLinks(markdown: string) {
  const links: string[] = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
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

function isPathInsideDir(dir: string, p: string) {
  const rel = path.relative(dir, p);
  if (!rel || rel === "." || rel === "..") return false;
  if (rel.startsWith(`..${path.sep}`)) return false;
  if (path.isAbsolute(rel)) return false;
  return true;
}

describe("skills/clawdeals skill pack docs", () => {
  it("rejects local SKILL.md links that escape the published skill folder", () => {
    const skillDir = path.join(process.cwd(), "skills", "clawdeals");
    const md = "See [bad](../README.md) and [ok](./SKILL.md) and [ext](https://example.com).";

    const links = listRelativeLinks(md);
    expect(links).toContain("../README.md");

    const p = path.resolve(skillDir, "../README.md");
    expect(isPathInsideDir(skillDir, p)).toBe(false);
  });

  it("is ClawHub-install ready: docs-only, has SECURITY + CHANGELOG, and SKILL.md contains metadata + valid links", () => {
    const skillDir = path.join(process.cwd(), "skills", "clawdeals");
    // When running on WSL against the Windows mount (/mnt/*), executable bits are not reliable (often 777).
    const isWslDrvfs = Boolean(process.env.WSL_DISTRO_NAME) && skillDir.startsWith(`${path.sep}mnt${path.sep}`);

    const requiredFiles = [
      "SKILL.md",
      "HEARTBEAT.md",
      "POLICIES.md",
      "SECURITY.md",
      "CHANGELOG.md",
      "reference.md",
      "examples.md"
    ];
    for (const f of requiredFiles) {
      const p = path.join(skillDir, f);
      expect(fs.existsSync(p), `missing required file: skills/clawdeals/${f}`).toBe(true);
    }

    // Docs-only: only Markdown files, no subfolders, no executable bits.
    for (const ent of fs.readdirSync(skillDir, { withFileTypes: true })) {
      expect(ent.isDirectory(), `unexpected subdirectory in skills/clawdeals/: ${ent.name}`).toBe(false);
      expect(ent.isFile(), `unexpected non-file entry in skills/clawdeals/: ${ent.name}`).toBe(true);
      expect(ent.name.endsWith(".md"), `non-doc file found in skills/clawdeals/: ${ent.name}`).toBe(true);

      const st = fs.statSync(path.join(skillDir, ent.name));
      if (!isWslDrvfs) {
        expect((st.mode & 0o111) === 0, `executable bit set on skills/clawdeals/${ent.name}`).toBe(true);
      }
    }

    const skillMd = readFile("skills/clawdeals/SKILL.md");
    expect(skillMd).toContain("clawhub install clawdeals");

    const fm = extractFrontmatter(skillMd);
    expect(fm, "SKILL.md must have YAML frontmatter").toBeTruthy();
    expect(fm!).toContain("name:");
    expect(fm!).toContain("version:");
    expect(fm!).toContain("description:");
    expect(fm!).toContain("permissions:");
    expect(fm!).toContain("entrypoints:");
    expect(fm!).toMatch(/^name:\s*clawdeals\s*$/m);

    const versionLine = fm!
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("version:"));
    expect(versionLine, "SKILL.md frontmatter must include version").toBeTruthy();
    const version = versionLine!.replace(/^version:\s*/, "").replace(/^"|"$/g, "");
    expect(version, "SKILL.md version must be semver 0.x").toMatch(/^0\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);

    expect(fm!, "permissions must be a YAML list").toMatch(/permissions:\r?\n(?:[ \t]*-[^\r\n]*\r?\n)+/m);
    expect(fm!, 'permissions must include "no-exec"').toMatch(/^\s*-\s*("?no-exec"?)\s*\r?$/m);

    // ClawHub registry scanner reads metadata.clawdbot for the package preview.
    expect(fm!, "frontmatter must include metadata.clawdbot block").toContain("clawdbot:");
    expect(fm!, "metadata.clawdbot must declare CLAWDEALS_API_BASE in requires.env").toMatch(
      /metadata:\s*\r?\n\s+clawdbot:\s*\r?\n[\s\S]*CLAWDEALS_API_BASE/
    );
    expect(fm!, "metadata.clawdbot must declare CLAWDEALS_API_KEY in requires.env").toMatch(
      /metadata:\s*\r?\n\s+clawdbot:\s*\r?\n[\s\S]*CLAWDEALS_API_KEY/
    );
    expect(fm!, "metadata.clawdbot must declare primaryEnv").toMatch(/primaryEnv:\s*CLAWDEALS_API_KEY/);

    // Ensure all relative links in SKILL.md resolve inside the skill folder.
    for (const rel of listRelativeLinks(skillMd)) {
      const p = path.resolve(skillDir, rel);
      expect(isPathInsideDir(skillDir, p), `relative link escapes skills/clawdeals/: (${rel})`).toBe(true);
      expect(fs.existsSync(p), `broken relative link in SKILL.md: (${rel})`).toBe(true);
      expect(fs.statSync(p).isFile(), `relative link target is not a file: (${rel})`).toBe(true);
    }

    // CHANGELOG should mention current version.
    const changelog = readFile("skills/clawdeals/CHANGELOG.md");
    expect(changelog).toContain(version);
  });

  it("SKILL.md includes required sections and links to companion docs", () => {
    const md = readFile("skills/clawdeals/SKILL.md");

    const requiredHeadings = [
      "## 1) Quickstart",
      "## 2) Safety rules (non negotiable)",
      "## 3) Headers & contracts",
      "## Reference routing",
      "## 7) Troubleshooting"
    ];

    let lastIndex = -1;
    for (const heading of requiredHeadings) {
      const idx = md.indexOf(heading);
      expect(idx, `missing heading: ${heading}`).toBeGreaterThan(-1);
      expect(idx, `heading order wrong: ${heading}`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }

    expect(md).toContain("(./reference.md)");
    expect(md).toContain("(./examples.md)");
    expect(md).toContain("(./HEARTBEAT.md)");
    expect(md).toContain("(./POLICIES.md)");
    expect(md.toLowerCase()).toContain("supply-chain warning");
  });

  it("reference.md includes endpoints, typed messages, and 6 workflows with curl+response+errors", () => {
    const md = readFile("skills/clawdeals/reference.md");

    const requiredHeadings = [
      "## 4) Endpoints MVP (table)",
      "## 5) Typed messages examples",
      "## 6) Workflow examples (illustrative)"
    ];

    let lastIndex = -1;
    for (const heading of requiredHeadings) {
      const idx = md.indexOf(heading);
      expect(idx, `missing heading: ${heading}`).toBeGreaterThan(-1);
      expect(idx, `heading order wrong: ${heading}`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }

    const workflows = md.split(/^### Workflow \d+:/m).slice(1);
    expect(workflows.length).toBeGreaterThanOrEqual(6);

    for (const [i, section] of workflows.slice(0, 6).entries()) {
      expect(section, `workflow ${i + 1} missing curl`).toMatch(/\bcurl\b/);
      expect(section, `workflow ${i + 1} missing example response`).toMatch(/Example response\s*\(/);
      expect(section, `workflow ${i + 1} missing expected errors`).toMatch(/Expected errors/);

      const errorLines = section
        .split("\n")
        .filter((line) => line.trim().match(/^- \d{3}\b/));
      expect(errorLines.length, `workflow ${i + 1} must list at least 2 error codes`).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses explicit Markdown links for production URLs outside command blocks", () => {
    const bundleFiles = [
      "SKILL.md",
      "HEARTBEAT.md",
      "POLICIES.md",
      "SECURITY.md",
      "CHANGELOG.md",
      "reference.md",
      "examples.md"
    ];

    for (const filename of bundleFiles) {
      const md = readFile(`skills/clawdeals/${filename}`);
      expect(
        md,
        `${filename} wraps a production URL in inline code, which can create a trailing-%60 crawl URL`
      ).not.toMatch(/`https:\/\/(?:app\.)?clawdeals\.com\/[^`\s]+`/);
    }
  });

  it("write curl examples include Idempotency-Key", () => {
    for (const filename of ["skills/clawdeals/SKILL.md", "skills/clawdeals/reference.md"]) {
      const md = readFile(filename);
      const blocks = extractFencedBlocks(md).filter((b) => b.info === "bash");

      for (const block of blocks) {
        const content = block.content;
        const isWrite =
          /\bcurl\b/.test(content) &&
          (/-X POST\b/.test(content) || /-X PUT\b/.test(content) || /-X PATCH\b/.test(content) || /-X DELETE\b/.test(content));

        if (!isWrite) continue;

        expect(content, `${filename} write curl block missing Idempotency-Key`).toMatch(/Idempotency-Key:/);
      }
    }
  });

  it("HEARTBEAT.md is an honest operational notice without placeholder status claims", () => {
    const md = readFile("skills/clawdeals/HEARTBEAT.md");

    const headings = [
      "## Public reachability checks",
      "## Authenticated API verification",
      "## Incidents and support"
    ];

    let lastIndex = -1;
    for (const heading of headings) {
      const idx = md.indexOf(heading);
      expect(idx, `missing heading: ${heading}`).toBeGreaterThan(-1);
      expect(idx, `heading order wrong: ${heading}`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }

    expect(md).toContain("not a live status feed");
    expect(md).not.toMatch(/clawdeals\.example/i);
    expect(md).not.toMatch(/Status:\s*OK\s*\|/i);
    expect(md).not.toContain("INC-YYYYMMDD");
  });

  it("POLICIES.md includes at least 3 complete JSON policies and warnings", () => {
    const md = readFile("skills/clawdeals/POLICIES.md");

    expect(md).toContain("No external payment links");
    expect(md).toContain("Contact reveal is gated");
    expect(md).toContain("Audit logs exist");

    const jsonBlocks = extractFencedBlocks(md).filter((b) => b.info === "json");
    const policyBlocks = jsonBlocks.filter((b) => /"budgets"\s*:/m.test(b.content) && /"approval_thresholds"\s*:/m.test(b.content));
    expect(policyBlocks.length).toBeGreaterThanOrEqual(3);
  });

  it("docs/mcp-tools-spec.md declares 17 tools and includes 2 invocation examples", () => {
    const md = readFile("docs/mcp-tools-spec.md");

    const toolRe = /`(clawdeals\.[a-z0-9_]+\.[a-z0-9_]+)`/gi;
    const tools = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = toolRe.exec(md))) {
      tools.add(match[1]);
    }

    // We expect at least the 17 v0 tools to be present; extra references are allowed.
    expect(Array.from(tools).length).toBeGreaterThanOrEqual(17);

    expect(md).toContain("## Annex: tool invocation examples (2)");
    expect(md).toContain("### Example 1: List deals");
    expect(md).toContain("### Example 2: Create listing (write)");
  });
});
