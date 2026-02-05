import { getAgentById } from "../services/agents";
import { createAuditLogger, createSupabaseAuditWriter } from "../audit";
import { normalizeTrustFlags } from "./compute";
import { computeActionWeight, computeDaysSinceCreated } from "./quarantine";

async function logQuarantineApplied({ ctx, trustContext, actionType, now = new Date() }) {
  try {
    const logger = createAuditLogger({ write: createSupabaseAuditWriter() });
    await logger({
      occurredAt: now.toISOString(),
      actor: ctx.actor,
      auth: {
        agent_id: ctx.agentId,
        owner_id: ctx.ownerId,
        api_key_id: ctx.apiKeyId || null,
        api_key_state: ctx.apiKeyState || null
      },
      request: {
        id: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        method: ctx.method,
        path: ctx.path,
        query: ctx.query
      },
      action: {
        event: "trust.quarantine_applied",
        action_type: actionType
      },
      payload: trustContext,
      outcome: "SUCCESS"
    });
  } catch (error) {
    console.error("[trust] quarantine audit failed", error);
  }
}

export async function resolveTrustContext({ ctx, actionType, now = new Date() } = {}) {
  if (!ctx?.agentId) return null;
  const agent = await getAgentById(ctx.agentId);
  if (!agent) return null;

  const trustScore = Number.isFinite(agent.trust_score) ? agent.trust_score : 0;
  const trustFlags = normalizeTrustFlags(agent.trust_flags);
  const daysSinceCreated = computeDaysSinceCreated(agent.created_at, now);
  const { actionWeight, baseWeight, quarantineApplied, quarantineMultiplier } = computeActionWeight({
    trustScore,
    trustFlags,
    daysSinceCreated,
    actionType
  });

  const trustContext = {
    trust_score: trustScore,
    trust_flags: trustFlags,
    days_since_created: daysSinceCreated,
    base_weight: baseWeight,
    action_weight: actionWeight,
    quarantine_applied: quarantineApplied,
    quarantine_multiplier: quarantineMultiplier
  };

  ctx.trustContext = trustContext;

  if (quarantineApplied) {
    await logQuarantineApplied({ ctx, trustContext, actionType, now });
  }

  return trustContext;
}

export function mergeTrustContextIntoPolicy(ctx) {
  if (!ctx?.trustContext) return;
  const existing = ctx.policy && typeof ctx.policy === "object" ? ctx.policy : {};
  ctx.policy = {
    ...existing,
    trust: ctx.trustContext
  };
}
