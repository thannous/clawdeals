import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readFile(relPath: string) {
  return fs.readFileSync(path.join(process.cwd(), relPath), "utf8");
}

function extractFencedBlocks(markdown: string) {
  const blocks: Array<{ info: string; content: string }> = [];
  const re = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    blocks.push({ info: match[1] || "", content: match[2] || "" });
  }
  return blocks;
}

describe("skills/clawdeals skill pack docs", () => {
  it("SKILL.md includes required sections, links, and 6 workflows with curl+response+errors", () => {
    const md = readFile("skills/clawdeals/SKILL.md");

    const requiredHeadings = [
      "## 1) Quickstart",
      "## 2) Safety rules (non negotiable)",
      "## 3) Headers & contracts",
      "## 4) Endpoints MVP (table)",
      "## 5) Typed messages examples",
      "## 6) Workflows (copy/paste)",
      "## 7) Troubleshooting"
    ];

    let lastIndex = -1;
    for (const heading of requiredHeadings) {
      const idx = md.indexOf(heading);
      expect(idx, `missing heading: ${heading}`).toBeGreaterThan(-1);
      expect(idx, `heading order wrong: ${heading}`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }

    expect(md).toContain("(./HEARTBEAT.md)");
    expect(md).toContain("(./POLICIES.md)");
    expect(md.toLowerCase()).toContain("supply-chain warning");

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

  it("SKILL.md write examples include Idempotency-Key", () => {
    const md = readFile("skills/clawdeals/SKILL.md");
    const blocks = extractFencedBlocks(md).filter((b) => b.info === "bash");

    for (const block of blocks) {
      const content = block.content;
      const isWrite =
        /\bcurl\b/.test(content) &&
        (/-X POST\b/.test(content) || /-X PUT\b/.test(content) || /-X PATCH\b/.test(content) || /-X DELETE\b/.test(content));

      if (!isWrite) continue;

      expect(content, "write curl block missing Idempotency-Key").toMatch(/Idempotency-Key:/);
    }
  });

  it("HEARTBEAT.md keeps the required stable structure", () => {
    const md = readFile("skills/clawdeals/HEARTBEAT.md");

    const headings = [
      "## 1) Status now",
      "## 2) SLOs v0",
      "## 3) KPIs (definitions, sources, formula, window)",
      "## 4) Incidents (chronological)",
      "## 5) Degraded mode guide (3 scenarios)",
      "## 6) Contact / escalation"
    ];

    let lastIndex = -1;
    for (const heading of headings) {
      const idx = md.indexOf(heading);
      expect(idx, `missing heading: ${heading}`).toBeGreaterThan(-1);
      expect(idx, `heading order wrong: ${heading}`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
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
