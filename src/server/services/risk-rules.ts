import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { safeAuditLog } from "../audit/singleton";
import { isUuid } from "../utils/validators";
import { getOpsConsoleOwnerId } from "../config/ops";
import { RISK_FLAG_VALUES, RISK_SIGNAL_TYPE_VALUES } from "../../shared/risk-rules";

const RISK_FLAG_SET = new Set(RISK_FLAG_VALUES);
const RISK_SIGNAL_SET = new Set(RISK_SIGNAL_TYPE_VALUES);

function buildServiceError(message: string, status = 500, code = "ERROR", meta?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (meta && typeof meta === "object") {
    Object.assign(error, meta);
  }
  return error;
}

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

function toPositiveInt(value: any) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function toNonNegativeInt(value: any) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeRuleKey(value: any) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolvePerformedBy(actor: any) {
  const actorId = typeof actor?.id === "string" ? actor.id : null;
  if (actorId && isUuid(actorId)) return actorId;
  return getOpsConsoleOwnerId();
}

async function auditRiskEvent({
  event,
  actor,
  payload,
  outcome = "SUCCESS"
}: {
  event: string;
  actor?: any;
  payload?: any;
  outcome?: "SUCCESS" | "FAILURE" | "UNKNOWN";
}) {
  const ownerId = isUuid(actor?.id) ? actor.id : null;
  await safeAuditLog({
    occurredAt: new Date().toISOString(),
    actor: actor || { type: "system", id: "risk-rules-engine" },
    auth: { owner_id: ownerId, agent_id: null },
    request: {
      id: null,
      ip: null,
      userAgent: null,
      method: "CRON",
      path: "/api/internal/cron/risk-rules",
      query: null
    },
    action: {
      route_group: "internal.cron.risk-rules",
      method: "CRON",
      path: "/api/internal/cron/risk-rules",
      event
    },
    security: {},
    policy: {},
    payload: payload || {},
    rateLimit: null,
    idempotency: null,
    outcome
  });
}

async function logModerationRiskAction({
  client,
  performedBy,
  agentId,
  rule,
  signalCount
}: {
  client: any;
  performedBy: string;
  agentId: string;
  rule: any;
  signalCount: number;
}) {
  const { error } = await client.from("moderation_actions").insert({
    action_type: "risk_rule_flag_applied",
    entity_type: "agent",
    entity_id: agentId,
    performed_by: performedBy,
    reason: `risk_rule:${rule.rule_key}`,
    metadata: {
      rule_key: rule.rule_key,
      signal_type: rule.signal_type,
      signal_count: signalCount,
      threshold: rule.threshold,
      window_seconds: rule.window_seconds,
      cooldown_seconds: rule.cooldown_seconds,
      flag: rule.flag
    }
  });
  if (error) {
    console.error("[risk-rules] failed to log moderation action", error);
  }
}

export async function listRiskRules({
  enabledOnly = false,
  ruleKey = null,
  client: injectedClient
}: {
  enabledOnly?: boolean;
  ruleKey?: string | null;
  client?: any;
} = {}) {
  const client = injectedClient || getSupabaseServiceClient();
  let query = client.from("risk_rules").select("*").order("created_at", { ascending: true });
  if (enabledOnly) query = query.eq("enabled", true);
  if (ruleKey) query = query.eq("rule_key", ruleKey);
  const { data, error } = await query;
  if (error) mapError(error);
  return Array.isArray(data) ? data : [];
}

export async function updateRiskRule({
  ruleId,
  patch,
  updatedBy,
  client: injectedClient
}: {
  ruleId: string;
  patch: any;
  updatedBy?: string | null;
  client?: any;
}) {
  if (!isUuid(ruleId)) {
    throw buildServiceError("ruleId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const payload: any = {};
  if (patch && typeof patch === "object") {
    if (patch.enabled !== undefined) {
      if (typeof patch.enabled !== "boolean") {
        throw buildServiceError("enabled must be a boolean", 400, "VALIDATION_ERROR");
      }
      payload.enabled = patch.enabled;
    }

    if (patch.threshold !== undefined) {
      const threshold = toPositiveInt(patch.threshold);
      if (threshold === null) {
        throw buildServiceError("threshold must be a positive integer", 400, "VALIDATION_ERROR");
      }
      payload.threshold = threshold;
    }

    if (patch.window_seconds !== undefined) {
      const windowSeconds = toPositiveInt(patch.window_seconds);
      if (windowSeconds === null) {
        throw buildServiceError("window_seconds must be a positive integer", 400, "VALIDATION_ERROR");
      }
      payload.window_seconds = windowSeconds;
    }

    if (patch.cooldown_seconds !== undefined) {
      const cooldown = toNonNegativeInt(patch.cooldown_seconds);
      if (cooldown === null) {
        throw buildServiceError("cooldown_seconds must be a non-negative integer", 400, "VALIDATION_ERROR");
      }
      payload.cooldown_seconds = cooldown;
    }

    if (patch.flag !== undefined) {
      const flag = typeof patch.flag === "string" ? patch.flag.trim() : "";
      if (!RISK_FLAG_SET.has(flag as any)) {
        throw buildServiceError("flag is invalid", 400, "VALIDATION_ERROR");
      }
      payload.flag = flag;
    }
  }

  if (Object.keys(payload).length === 0) {
    throw buildServiceError("No updatable fields provided", 400, "VALIDATION_ERROR");
  }

  payload.updated_at = new Date().toISOString();
  if (updatedBy && isUuid(updatedBy)) {
    payload.updated_by = updatedBy;
  }

  const client = injectedClient || getSupabaseServiceClient();
  const { data, error } = await client
    .from("risk_rules")
    .update(payload)
    .eq("risk_rule_id", ruleId)
    .select("*")
    .maybeSingle();
  if (error) mapError(error);
  if (!data) {
    throw buildServiceError("Risk rule not found", 404, "NOT_FOUND");
  }
  return data;
}

type RunRiskRulesOptions = {
  dryRun?: boolean;
  ruleKey?: string | null;
  maxAgentsPerRule?: number | null;
  actor?: { type?: string; id?: string } | null;
  now?: Date;
  client?: any;
};

export async function runRiskRulesEngine({
  dryRun = false,
  ruleKey = null,
  maxAgentsPerRule = null,
  actor = null,
  now = new Date(),
  client: injectedClient
}: RunRiskRulesOptions = {}) {
  const client = injectedClient || getSupabaseServiceClient();
  const normalizedRuleKey = normalizeRuleKey(ruleKey);
  const normalizedMaxAgents =
    maxAgentsPerRule === null || maxAgentsPerRule === undefined
      ? null
      : toPositiveInt(maxAgentsPerRule);

  if (maxAgentsPerRule !== null && maxAgentsPerRule !== undefined && normalizedMaxAgents === null) {
    throw buildServiceError("maxAgentsPerRule must be a positive integer", 400, "VALIDATION_ERROR");
  }

  const summary: any = {
    dry_run: Boolean(dryRun),
    rules_scanned: 0,
    agents_evaluated: 0,
    flags_applied: 0,
    would_apply: 0,
    skipped_cooldown: 0,
    already_flagged: 0,
    errors: 0,
    error_details: [] as any[]
  };

  const rules = await listRiskRules({
    enabledOnly: true,
    ruleKey: normalizedRuleKey,
    client
  });

  for (const rule of rules) {
    summary.rules_scanned += 1;
    const ruleId = rule?.risk_rule_id;
    if (!ruleId || !isUuid(ruleId)) continue;
    if (!RISK_SIGNAL_SET.has(rule.signal_type)) continue;
    if (!RISK_FLAG_SET.has(rule.flag)) continue;

    let touchedRule = false;

    try {
      const { data: candidates, error: candidatesError } = await client.rpc("risk_rule_candidates_v1", {
        p_signal_type: rule.signal_type,
        p_window_seconds: rule.window_seconds,
        p_threshold: rule.threshold,
        p_max_agents: normalizedMaxAgents || 1000
      });

      if (candidatesError) {
        throw candidatesError;
      }

      for (const candidate of Array.isArray(candidates) ? candidates : []) {
        const agentId = candidate?.agent_id;
        const signalCountRaw = candidate?.signal_count;
        const signalCount = Number.isFinite(Number(signalCountRaw)) ? Number(signalCountRaw) : 0;
        if (!isUuid(agentId)) continue;

        summary.agents_evaluated += 1;

        try {
          const { data: stateRow, error: stateError } = await client
            .from("risk_rule_state")
            .select("last_triggered_at")
            .eq("risk_rule_id", ruleId)
            .eq("agent_id", agentId)
            .maybeSingle();
          if (stateError) {
            throw stateError;
          }

          if (stateRow?.last_triggered_at && rule.cooldown_seconds > 0) {
            const lastTriggeredMs = new Date(stateRow.last_triggered_at).getTime();
            if (Number.isFinite(lastTriggeredMs)) {
              const cooldownMs = Number(rule.cooldown_seconds) * 1000;
              if (now.getTime() - lastTriggeredMs < cooldownMs) {
                summary.skipped_cooldown += 1;
                continue;
              }
            }
          }

          if (dryRun) {
            summary.would_apply += 1;
            continue;
          }

          const { data: added, error: flagError } = await client.rpc("add_agent_trust_flag_if_missing_v1", {
            p_agent_id: agentId,
            p_flag: rule.flag
          });
          if (flagError) {
            throw flagError;
          }
          if (added === null || added === undefined) {
            throw buildServiceError("Agent not found while applying risk flag", 404, "NOT_FOUND", { agent_id: agentId });
          }

          const nowIso = now.toISOString();
          const { error: stateUpsertError } = await client.from("risk_rule_state").upsert(
            {
              risk_rule_id: ruleId,
              agent_id: agentId,
              last_triggered_at: nowIso,
              last_observed_count: signalCount,
              last_flag: rule.flag,
              updated_at: nowIso
            },
            { onConflict: "risk_rule_id,agent_id" }
          );
          if (stateUpsertError) {
            throw stateUpsertError;
          }
          touchedRule = true;

          if (added) {
            summary.flags_applied += 1;
            const performedBy = resolvePerformedBy(actor);
            await Promise.allSettled([
              logModerationRiskAction({
                client,
                performedBy,
                agentId,
                rule,
                signalCount
              }),
              auditRiskEvent({
                event: "risk_rule.flag_applied",
                actor: actor || { type: "system", id: "risk-rules-engine" },
                payload: {
                  rule_key: rule.rule_key,
                  signal_type: rule.signal_type,
                  signal_count: signalCount,
                  threshold: rule.threshold,
                  window_seconds: rule.window_seconds,
                  cooldown_seconds: rule.cooldown_seconds,
                  flag: rule.flag,
                  agent_id: agentId
                }
              })
            ]);
          } else {
            summary.already_flagged += 1;
          }
        } catch (error: any) {
          summary.errors += 1;
          summary.error_details.push({
            rule_key: rule.rule_key,
            agent_id: agentId,
            message: error?.message ? String(error.message) : "Unknown error"
          });
        }
      }
    } catch (error: any) {
      summary.errors += 1;
      summary.error_details.push({
        rule_key: rule.rule_key,
        message: error?.message ? String(error.message) : "Unknown error"
      });
    } finally {
      if (!dryRun && touchedRule) {
        await client
          .from("risk_rules")
          .update({
            last_triggered_at: now.toISOString(),
            updated_at: now.toISOString()
          })
          .eq("risk_rule_id", ruleId);
      }
    }
  }

  return summary;
}

export async function manualUnflagRiskFlag({
  agentId,
  flag,
  reason,
  actor,
  client: injectedClient
}: {
  agentId: string;
  flag: string;
  reason: string;
  actor?: { type?: string; id?: string } | null;
  client?: any;
}) {
  if (!isUuid(agentId)) {
    throw buildServiceError("agentId must be a UUID", 400, "VALIDATION_ERROR");
  }

  const normalizedFlag = typeof flag === "string" ? flag.trim() : "";
  if (!RISK_FLAG_SET.has(normalizedFlag as any)) {
    throw buildServiceError("flag is invalid", 400, "VALIDATION_ERROR");
  }

  if (typeof reason !== "string" || !reason.trim()) {
    throw buildServiceError("reason is required", 400, "VALIDATION_ERROR");
  }

  const client = injectedClient || getSupabaseServiceClient();
  const { data: beforeRow, error: beforeError } = await client
    .from("agents")
    .select("trust_flags")
    .eq("id", agentId)
    .maybeSingle();
  if (beforeError) mapError(beforeError);
  if (!beforeRow) {
    throw buildServiceError("Agent not found", 404, "NOT_FOUND");
  }

  const hadFlag = Array.isArray(beforeRow.trust_flags) && beforeRow.trust_flags.includes(normalizedFlag);

  const { data: trustFlags, error } = await client.rpc("remove_agent_trust_flag_v1", {
    p_agent_id: agentId,
    p_flag: normalizedFlag
  });
  if (error) mapError(error);
  if (trustFlags === null || trustFlags === undefined) {
    throw buildServiceError("Agent not found", 404, "NOT_FOUND");
  }

  const performedBy = resolvePerformedBy(actor);
  await Promise.allSettled([
    client.from("moderation_actions").insert({
      action_type: "risk_rule_flag_removed_manual",
      entity_type: "agent",
      entity_id: agentId,
      performed_by: performedBy,
      reason: reason.trim(),
      metadata: {
        flag: normalizedFlag,
        removed: hadFlag
      }
    }),
    auditRiskEvent({
      event: "risk_rule.flag_removed_manual",
      actor: actor || { type: "owner", id: performedBy },
      payload: {
        agent_id: agentId,
        flag: normalizedFlag,
        reason: reason.trim(),
        removed: hadFlag
      }
    })
  ]);

  return {
    agent_id: agentId,
    flag: normalizedFlag,
    removed: hadFlag,
    trust_flags: Array.isArray(trustFlags) ? trustFlags : []
  };
}

