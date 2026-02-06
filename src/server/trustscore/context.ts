import { getAgentById } from "../services/agents";
import { normalizeTrustFlags } from "./compute";
import { computeActionWeight, computeDaysSinceCreated } from "./quarantine";

export async function resolveTrustContext({ ctx, actionType, now = new Date() }: any = {}) {
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
