const baseUrl = process.env.CRON_BASE_URL || process.env.SITE_URL || "http://localhost:3000";
const secret = process.env.INTERNAL_CRON_SECRET;

if (!secret) {
  console.error("Missing INTERNAL_CRON_SECRET for risk-rules cron.");
  process.exit(1);
}

const url = new URL("/api/internal/cron/risk-rules", baseUrl);

const dryRun = process.env.CRON_RISK_RULES_DRY_RUN;
const ruleKey = process.env.CRON_RISK_RULES_RULE_KEY;
const maxAgents = process.env.CRON_RISK_RULES_MAX_AGENTS;

if (dryRun !== undefined && dryRun !== null && String(dryRun).trim() !== "") {
  url.searchParams.set("dry_run", String(dryRun));
}
if (ruleKey) {
  url.searchParams.set("rule_key", String(ruleKey));
}
if (maxAgents) {
  url.searchParams.set("max_agents_per_rule", String(maxAgents));
}

async function run() {
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": secret
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Cron failed: ${response.status} ${text}`);
  }

  console.log(text);
}

run().catch((error) => {
  console.error("Risk rules cron failed", error);
  process.exit(1);
});

