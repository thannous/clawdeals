import { getSupabaseServiceClient } from "../db/supabase";
import { getAuditLogger } from "../audit/singleton";
import { isFeatureEnabled } from "../config/feature-flags";
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
const MAX_UPDATED_IDS = 50;

function clampInt(value: number, min: number, max: number) {
  const clamped = Math.min(Math.max(value, min), max);
  return Math.trunc(clamped);
}

function toDate(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function computeDaysSinceCreated(createdAt, now) {
  const created = toDate(createdAt);
  if (!created) return 0;
  const diffMs = now.getTime() - created.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / DAY_MS);
}

function extractOwnerRelation(ownerRelation) {
  if (!ownerRelation) return null;
  if (Array.isArray(ownerRelation)) return ownerRelation[0] || null;
  return ownerRelation;
}

async function logTrustscoreRecalculated({ now, summary, outcome = "SUCCESS" }) {
  try {
    const logger = getAuditLogger();
    await logger({
      occurredAt: now.toISOString(),
      actor: { type: "system", source: "cron" },
      auth: {},
      request: {
        method: "INTERNAL",
        path: "/internal/cron/trustscore-recalc"
      },
      action: {
        event: "trustscore.recalculated"
      },
      payload: summary,
      outcome
    });
  } catch (error) {
    console.error("[trustscore] audit log failed", error);
  }
}

export async function runTrustScoreRecalculation({
  now = new Date(),
  pageSize = 200,
  limit = null
} = {}) {
  const client = getSupabaseServiceClient();
  const useFullFormula = isFeatureEnabled("trustscore.v1_full");
  const summary = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    updated_ids: [],
    updated_ids_truncated: false
  };

  let offset = 0;
  const nowIso = now.toISOString();

  while (true) {
    const from = offset;
    const to = offset + pageSize - 1;
    const { data, error } = await client
      .from("agents")
      .select(
        "id, created_at, trust_score, trust_flags, trust_formula_version, owner_id, owners(email_verified_at, phone_verified_at)"
      )
      // Newest first so limited runs (tests / debug) still pick up recent agents.
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch agents: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    const ratingStatsByAgentId = await getRatingStatsByRatedAgentId(
      client,
      data.map((row: any) => row?.id).filter(Boolean)
    );

    for (const agent of data) {
      if (limit !== null && summary.scanned >= limit) {
        break;
      }
      summary.scanned += 1;

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
        useFull: useFullFormula
      });

      const ratingStats = ratingStatsByAgentId[agent.id] || { avgRating: 0, ratingCount: 0 };
      const ratingPoints = computeRatingPoints({
        avgRating: ratingStats.avgRating,
        ratingCount: ratingStats.ratingCount
      });

      const nextScore = clampInt(baseScore + ratingPoints, 0, 100);

      const nextFormulaVersion = TRUST_FORMULA_VERSION;

      const shouldUpdate =
        agent.trust_score !== nextScore ||
        agent.trust_formula_version !== nextFormulaVersion ||
        !areFlagsEqual(agent.trust_flags, nextFlags);

      if (!shouldUpdate) {
        summary.skipped += 1;
        continue;
      }

      const { error: updateError } = await client
        .from("agents")
        .update({
          trust_score: nextScore,
          trust_flags: nextFlags,
          trust_formula_version: nextFormulaVersion,
          trust_updated_at: nowIso,
          updated_at: nowIso
        })
        .eq("id", agent.id);

      if (updateError) {
        summary.errors += 1;
        continue;
      }

      summary.updated += 1;
      if (!summary.updated_ids_truncated) {
        if (summary.updated_ids.length < MAX_UPDATED_IDS) {
          summary.updated_ids.push(agent.id);
        } else {
          summary.updated_ids_truncated = true;
        }
      }
    }

    if (limit !== null && summary.scanned >= limit) {
      break;
    }

    if (data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  await logTrustscoreRecalculated({
    now,
    summary: {
      ...summary,
      formula_version: TRUST_FORMULA_VERSION,
      full_formula_enabled: useFullFormula
    },
    outcome: summary.errors ? "FAILURE" : "SUCCESS"
  });

  return summary;
}
