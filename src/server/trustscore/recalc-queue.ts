import { getSupabaseServiceClient } from "../db/supabase";
import {
  areFlagsEqual,
  computeBaseTrustFlags,
  computeTrustScore,
  mergeTrustFlags,
  TRUST_FORMULA_VERSION
} from "./compute";
import { computeRatingPoints } from "./ratings";
import { getRatingStatsByRatedAgentId } from "./rating-stats";

const DAY_MS = 24 * 60 * 60 * 1000;

function clampInt(value: number, min: number, max: number) {
  const clamped = Math.min(Math.max(value, min), max);
  return Math.trunc(clamped);
}

function toDate(value: any) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function computeDaysSinceCreated(createdAt: any, now: Date) {
  const created = toDate(createdAt);
  if (!created) return 0;
  const diffMs = now.getTime() - created.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / DAY_MS);
}

function extractOwnerRelation(ownerRelation: any) {
  if (!ownerRelation) return null;
  if (Array.isArray(ownerRelation)) return ownerRelation[0] || null;
  return ownerRelation;
}

async function fetchAgentForRecalc(client: any, agentId: string) {
  const { data, error } = await client
    .from("agents")
    .select(
      "id, created_at, trust_score, trust_flags, trust_formula_version, owner_id, owners(email_verified_at, phone_verified_at)"
    )
    .eq("id", agentId)
    .maybeSingle();

  if (error) {
    throw Object.assign(new Error(`Failed to fetch agent: ${error.message}`), {
      status: 500,
      code: "DATABASE_ERROR"
    });
  }

  return data || null;
}

export async function recalculateTrustScoreForAgent({
  agentId,
  now = new Date()
}: {
  agentId: string;
  now?: Date;
}) {
  const client = getSupabaseServiceClient();
  const agent = await fetchAgentForRecalc(client, agentId);
  if (!agent) {
    return { ok: false, code: "AGENT_NOT_FOUND" };
  }

  const owner = extractOwnerRelation(agent.owners);
  const emailVerified = Boolean(owner?.email_verified_at);
  const phoneVerified = Boolean(owner?.phone_verified_at);
  const daysSinceCreated = computeDaysSinceCreated(agent.created_at, now);

  const baseFlags = computeBaseTrustFlags({
    daysSinceCreated,
    emailVerified,
    phoneVerified
  });

  const nextFlags = mergeTrustFlags({
    existingFlags: agent.trust_flags,
    baseFlags
  });

  const baseScore = computeTrustScore({
    daysSinceCreated,
    emailVerified,
    phoneVerified,
    useFull: false
  });

  const statsByAgentId = await getRatingStatsByRatedAgentId(client, [agentId]);
  const stats = statsByAgentId[agentId] || { avgRating: 0, ratingCount: 0 };
  const ratingPoints = computeRatingPoints({
    avgRating: stats.avgRating,
    ratingCount: stats.ratingCount
  });

  const nextScore = clampInt(baseScore + ratingPoints, 0, 100);
  const nextFormulaVersion = TRUST_FORMULA_VERSION;

  const shouldUpdate =
    agent.trust_score !== nextScore ||
    agent.trust_formula_version !== nextFormulaVersion ||
    !areFlagsEqual(agent.trust_flags, nextFlags);

  if (!shouldUpdate) {
    return { ok: true, updated: false, agent_id: agentId, trust_score: agent.trust_score };
  }

  const nowIso = now.toISOString();
  const { error: updateError } = await client
    .from("agents")
    .update({
      trust_score: nextScore,
      trust_flags: nextFlags,
      trust_formula_version: nextFormulaVersion,
      trust_updated_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", agentId);

  if (updateError) {
    throw Object.assign(new Error(`Failed to update agent trust score: ${updateError.message}`), {
      status: 500,
      code: "DATABASE_ERROR"
    });
  }

  return { ok: true, updated: true, agent_id: agentId, trust_score: nextScore };
}

export async function runTrustScoreRecalcQueue({
  now = new Date(),
  limit = 50
}: {
  now?: Date;
  limit?: number;
} = {}) {
  const client = getSupabaseServiceClient();
  const effectiveLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;

  const summary: any = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: 0
  };

  const { data, error } = await client
    .from("trustscore_recalc_queue")
    .select("agent_id, updated_at, last_reason")
    .order("updated_at", { ascending: true })
    .order("agent_id", { ascending: true })
    .limit(effectiveLimit);

  if (error) {
    throw Object.assign(new Error(`Failed to read trustscore queue: ${error.message}`), {
      status: 500,
      code: "DATABASE_ERROR"
    });
  }

  const rows = Array.isArray(data) ? data : [];

  for (const row of rows) {
    const agentId = row?.agent_id;
    if (!agentId) continue;
    summary.scanned += 1;
    try {
      const result: any = await recalculateTrustScoreForAgent({ agentId, now });
      if (result?.ok && result.updated) {
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }

      // Delete the queue row so future events can re-enqueue cleanly.
      const { error: deleteError } = await client.from("trustscore_recalc_queue").delete().eq("agent_id", agentId);
      if (deleteError) {
        throw new Error(deleteError.message || "Failed to delete trustscore queue row");
      }
    } catch (err) {
      summary.errors += 1;
      console.error("[trustscore-queue] recalc failed", {
        agent_id: agentId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return summary;
}

