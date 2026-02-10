import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

function buildServiceError(message, status = 500, code = "ERROR", meta?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (meta && typeof meta === "object") {
    Object.assign(error, meta);
  }
  return error;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw buildServiceError(mapped.message, mapped.status, mapped.code);
}

const DEAL_EDITABLE_STATUSES = new Set(["NEW"]);

function assertDealEditable({ existing, agentId, now }: any = {}) {
  if (!existing) {
    throw buildServiceError("Deal not found", 404, "DEAL_NOT_FOUND");
  }

  if (existing.creator_agent_id !== agentId) {
    throw buildServiceError("Only the creating agent can edit this deal", 403, "FORBIDDEN", {
      isBlocked: true,
      reason: "authz"
    });
  }

  if (!DEAL_EDITABLE_STATUSES.has(existing.status)) {
    throw buildServiceError("Deal is not editable in its current status", 409, "DEAL_NOT_EDITABLE", {
      isBlocked: true,
      reason: "status",
      deal_status: existing.status
    });
  }

  const votesUp = Number(existing.votes_up || 0);
  const votesDown = Number(existing.votes_down || 0);
  if (votesUp > 0 || votesDown > 0) {
    throw buildServiceError("Deal is not editable after receiving votes", 409, "DEAL_NOT_EDITABLE", {
      isBlocked: true,
      reason: "votes"
    });
  }

  // Enforce the NEW window (pre-activation) to avoid bait-and-switch after activation.
  if (existing.new_until) {
    const nowMs = now.getTime();
    const newUntilMs = new Date(existing.new_until).getTime();
    if (Number.isFinite(newUntilMs) && nowMs >= newUntilMs) {
      throw buildServiceError("Deal is not editable after activation window", 409, "DEAL_NOT_EDITABLE", {
        isBlocked: true,
        reason: "new_window"
      });
    }
  }
}

export async function getDealForUpdate({ dealId }: any = {}) {
  if (!dealId || typeof dealId !== "string") {
    throw buildServiceError("dealId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("deals")
    .select(
      "deal_id,title,source_url,price,currency,expires_at,status,temperature,votes_up,votes_down,tags,created_at,new_until,creator_agent_id"
    )
    .eq("deal_id", dealId)
    .maybeSingle();

  if (error) {
    mapError(error);
  }

  if (!data) {
    throw buildServiceError("Deal not found", 404, "DEAL_NOT_FOUND");
  }

  return data;
}

export async function applyDealUpdate({
  dealId,
  agentId,
  patch,
  now = new Date(),
  existing: existingOverride
}: any = {}) {
  if (!dealId || typeof dealId !== "string") {
    throw buildServiceError("dealId is required", 400, "VALIDATION_ERROR");
  }
  if (!agentId || typeof agentId !== "string") {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw buildServiceError("patch must be an object", 400, "VALIDATION_ERROR");
  }

  // Only allow a whitelisted set of fields to be updated.
  const allowedKeys = new Set(["title", "price", "currency", "expires_at", "tags"]);
  const nowIso = now.toISOString();
  const payload: any = { updated_at: nowIso };
  for (const [key, value] of Object.entries(patch)) {
    if (!allowedKeys.has(key)) continue;
    payload[key] = value;
  }

  // Guard against accidental empty updates.
  if (Object.keys(payload).length === 1) {
    throw buildServiceError("At least one field is required", 400, "VALIDATION_ERROR");
  }

  const existing = existingOverride || (await getDealForUpdate({ dealId }));
  assertDealEditable({ existing, agentId, now });

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("deals")
    .update(payload)
    .eq("deal_id", dealId)
    .eq("creator_agent_id", agentId)
    .eq("status", "NEW")
    // Enforce "not editable after votes / activation window" atomically at write time.
    .eq("votes_up", 0)
    .eq("votes_down", 0)
    .gt("new_until", nowIso)
    .select(
      "deal_id,title,source_url,price,currency,expires_at,status,temperature,votes_up,votes_down,tags,created_at"
    )
    .maybeSingle();

  if (error) {
    mapError(error);
  }

  // If the update didn't match (e.g., raced with lifecycle NEW->ACTIVE), return a consistent error.
  if (!data) {
    // Re-read to surface the most accurate reason for rejection.
    const refreshed = await getDealForUpdate({ dealId });
    assertDealEditable({ existing: refreshed, agentId, now });
    throw buildServiceError("Deal is not editable", 409, "DEAL_NOT_EDITABLE", { isBlocked: true, reason: "race" });
  }

  return data;
}
