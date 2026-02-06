import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { normalizeTrustFlags } from "../trustscore/compute";

const REPORT_WINDOW_DAYS = 7;
const MIN_DISTINCT_REPORTER_OWNERS = 3;

const REPORT_THRESHOLDS = {
  deal: 3.0,
  listing: 3.0,
  agent: 5.0,
  thread: 3.0,
  message: 3.0,
  offer: 3.0,
  transaction: 3.0
};

function computeReportWeight({ trustScore, trustFlags, quarantineApplied }) {
  if (quarantineApplied) return 0;
  const normalizedScore = Number.isFinite(trustScore) ? trustScore : 0;
  let weight = 0.1 + 0.9 * (Math.min(Math.max(normalizedScore, 0), 100) / 100);
  const flags = normalizeTrustFlags(trustFlags);
  if (flags.includes("unverified_owner")) {
    weight *= 0.3;
  }
  return weight;
}

function getThreshold(entityType) {
  return REPORT_THRESHOLDS[entityType] ?? 3.0;
}

function computeWindowStart(now = new Date()) {
  return new Date(now.getTime() - REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function maybeApplyAutoHide({
  client,
  entityType,
  entityId,
  now,
  ctx
}) {
  const since = computeWindowStart(now);
  const { data, error } = await client
    .from("reports")
    .select("report_weight, reporter_owner_id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .gte("created_at", since)
    .gt("report_weight", 0);

  if (error) {
    throw new Error(`Failed to evaluate report threshold: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  const distinctOwners = new Set(
    data
      .map((row) => row.reporter_owner_id)
      .filter((value) => value !== null && value !== undefined)
  );
  const weightedSum = data.reduce((sum, row) => sum + (row.report_weight || 0), 0);
  const threshold = getThreshold(entityType);

  if (distinctOwners.size < MIN_DISTINCT_REPORTER_OWNERS || weightedSum < threshold) {
    return null;
  }

  const { data: existing } = await client
    .from("moderation_states")
    .select("hidden")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (existing?.hidden) {
    return {
      hidden: true,
      alreadyHidden: true,
      audit: {
        auto_hide_applied: false,
        already_hidden: true,
        weighted_sum: weightedSum,
        threshold,
        distinct_reporter_owners: distinctOwners.size
      }
    };
  }

  const nowIso = now.toISOString();
  const payload = {
    entity_type: entityType,
    entity_id: entityId,
    hidden: true,
    hidden_at: nowIso,
    hidden_reason: "report_threshold",
    hidden_by: "system",
    updated_at: nowIso
  };

  const { data: moderationState, error: moderationError } = await client
    .from("moderation_states")
    .upsert(payload, { onConflict: "entity_type,entity_id" })
    .select()
    .single();

  if (moderationError) {
    throw new Error(`Failed to upsert moderation state: ${moderationError.message}`);
  }

  if (ctx && typeof ctx === "object") {
    ctx.security = {
      ...(ctx.security && typeof ctx.security === "object" ? ctx.security : {}),
      auto_hide_applied: true,
      hidden_reason: "report_threshold",
      entity_type: entityType,
      entity_id: entityId,
      weighted_sum: weightedSum,
      threshold,
      distinct_reporter_owners: distinctOwners.size
    };
  }

  return {
    hidden: true,
    moderationState,
    audit: {
      auto_hide_applied: true,
      weighted_sum: weightedSum,
      threshold,
      distinct_reporter_owners: distinctOwners.size
    }
  };
}

export async function createReport({
  reporterAgentId,
  reporterOwnerId,
  entityType,
  entityId,
  reasonCode,
  freeText,
  trustScore,
  trustFlags,
  quarantineApplied,
  ctx,
  now = new Date()
}) {
  const client = getSupabaseServiceClient();
  const reportWeight = computeReportWeight({ trustScore, trustFlags, quarantineApplied });
  const freeTextRedacted = freeText ? String(freeText).slice(0, 500) : null;

  const payload = {
    reporter_agent_id: reporterAgentId || null,
    reporter_owner_id: reporterOwnerId,
    entity_type: entityType,
    entity_id: entityId,
    reason_code: reasonCode,
    free_text_redacted: freeTextRedacted,
    report_weight: reportWeight,
    status: "UNCONFIRMED"
  };

  const { data, error } = await client.from("reports").insert(payload).select().single();
  if (error) {
    if (error.code === "23505" || /duplicate key value/i.test(error.message || "")) {
      throw Object.assign(new Error("Duplicate report"), {
        status: 409,
        code: "REPORT_DUPLICATE"
      });
    }
    const mapped = mapSupabaseError(error);
    throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
  }

  if (reportWeight > 0) {
    await maybeApplyAutoHide({
      client,
      entityType,
      entityId,
      now,
      ctx
    });
  }

  return data;
}

export { computeReportWeight };
