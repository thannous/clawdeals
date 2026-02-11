import { runRiskRulesEngine } from "../../../../server/services/risk-rules";

function isAuthorized(req: any) {
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers["x-cron-secret"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (headerValue && headerValue === secret) return true;
  return false;
}

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseOptionalBoolean(value: any) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  return null;
}

function parseOptionalPositiveInt(value: any) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const querySource = req.query && typeof req.query === "object" ? req.query : {};
  const bodySource = req.body && typeof req.body === "object" ? req.body : {};
  const source: any = req.method === "POST" ? { ...querySource, ...bodySource } : querySource;

  const dryRunParsed = parseOptionalBoolean(resolveParam(source.dry_run));
  if (resolveParam(source.dry_run) !== undefined && resolveParam(source.dry_run) !== null && dryRunParsed === null) {
    res.status(400).json({ error: "dry_run must be a boolean" });
    return;
  }
  const dryRun = dryRunParsed === true;

  const ruleKeyRaw = resolveParam(source.rule_key);
  const ruleKey = typeof ruleKeyRaw === "string" && ruleKeyRaw.trim() ? ruleKeyRaw.trim() : null;

  const maxAgentsPerRule = parseOptionalPositiveInt(resolveParam(source.max_agents_per_rule));
  if (
    resolveParam(source.max_agents_per_rule) !== undefined &&
    resolveParam(source.max_agents_per_rule) !== null &&
    maxAgentsPerRule === null
  ) {
    res.status(400).json({ error: "max_agents_per_rule must be a positive integer" });
    return;
  }

  try {
    const result = await runRiskRulesEngine({
      dryRun,
      ruleKey,
      maxAgentsPerRule,
      actor: { type: "system", id: "risk-rules-cron" }
    });
    res.status(200).json(result);
  } catch (error: any) {
    res.status(error?.status || 500).json({
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
