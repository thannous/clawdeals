import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readPublicFile(filename: string) {
  return fs.readFileSync(path.join(process.cwd(), "public", filename), "utf8");
}

const ESSENTIAL_LLMS_URLS = [
  "https://clawdeals.com/guides",
  "https://clawdeals.com/integrations",
  "https://clawdeals.com/mcp",
  "https://clawdeals.com/integrations/openclaw",
  "https://clawdeals.com/guides/openclaw-dealwatch",
  "https://clawdeals.com/guides/mcp-marketplace-safety",
  "https://clawdeals.com/guides/openclaw-skill-vs-mcp-vs-clawhub",
  "https://clawdeals.com/guides/mcp-security-checklist",
  "https://clawdeals.com/guides/ai-agent-human-approval-spending",
  "https://clawdeals.com/guides/ai-agent-marketplace",
  "https://clawdeals.com/skill.md",
  "https://clawdeals.com/policies.md",
  "https://clawdeals.com/security.md",
  "https://clawdeals.com/reference.md",
  "https://clawdeals.com/examples.md",
  "https://clawdeals.com/pricing.md",
  "https://clawdeals.com/pricing.txt",
  "https://clawdeals.com/pricing",
  "https://clawdeals.com/about/editorial"
];

describe("public agent-readable files", () => {
  it("publishes an honest operational notice without placeholder status or contact claims", () => {
    const heartbeat = readPublicFile("heartbeat.md");

    expect(heartbeat).toContain("not a live status feed");
    expect(heartbeat).toContain("does not publish an uptime guarantee or support SLA");
    expect(heartbeat).toContain("https://clawdeals.com/skill.md");
    expect(heartbeat).toContain("https://clawdeals.com/robots.txt");
    expect(heartbeat).toContain("https://clawdeals.com/sitemap.xml");
    expect(heartbeat).not.toMatch(/clawdeals\.example/i);
    expect(heartbeat).not.toMatch(/Status:\s*OK\s*\|/i);
    expect(heartbeat).not.toMatch(/(?:API Read|API Write|SSE Stream|Background Jobs|Console\/Admin):\s*OK/i);
    expect(heartbeat).not.toMatch(/SLOs?\s+v\d/i);
    expect(heartbeat).not.toMatch(/#ops-oncall|#incidents/i);
    expect(heartbeat).not.toContain("INC-YYYYMMDD");
  });

  it("does not publish a placeholder security contact", () => {
    const security = readPublicFile("security.md");

    expect(security).toContain("does not currently publish a security-reporting email");
    expect(security).not.toMatch(/clawdeals\.example/i);
    expect(security).not.toMatch(/security@/i);
  });

  it("publishes an llms.txt index containing every essential canonical resource", () => {
    const llms = readPublicFile("llms.txt");

    expect(llms).toMatch(/^# ClawDeals\s*$/m);
    for (const url of ESSENTIAL_LLMS_URLS) {
      expect(llms, `missing canonical resource in llms.txt: ${url}`).toContain(url);
    }
    expect(llms).not.toMatch(/clawdeals\.example|TODO|TBD/i);
  });

  it("states that public pricing is not final without inventing an amount or plan", () => {
    const pricing = readPublicFile("pricing.md");
    const pricingText = readPublicFile("pricing.txt");

    expect(pricing).toContain("Public prices, plan definitions, usage quotas, billing intervals, and transaction fee rates for ClawDeals are not final.");
    expect(pricing).toContain("treat the price as unavailable and do not proceed");
    expect(pricing).not.toMatch(/clawdeals\.example|TODO|TBD/i);
    expect(pricing).not.toMatch(/[$€£]\s*\d|\d+(?:[.,]\d+)?\s*(?:EUR|GBP|USD)/i);
    expect(pricing).not.toMatch(/^##\s+(?:Free|Pro|Enterprise)\b/im);
    expect(pricing).not.toMatch(/(?:per month|per year|\/month|\/year)/i);
    expect(pricingText).toContain("Public prices, plan definitions, usage quotas, billing intervals, and transaction fee rates are not final.");
    expect(pricingText).toContain("treat the price as unavailable and do not proceed");
    expect(pricingText).not.toMatch(/[$€£]\s*\d|\d+(?:[.,]\d+)?\s*(?:EUR|GBP|USD)/i);
  });
});
