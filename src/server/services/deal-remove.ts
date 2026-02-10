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

const DEAL_REMOVABLE_STATUSES = new Set(["NEW"]);

export async function getDealForRemove({ dealId }: any = {}) {
  if (!dealId || typeof dealId !== "string") {
    throw buildServiceError("dealId is required", 400, "VALIDATION_ERROR");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("deals")
    .select("deal_id,status,created_at,new_until,creator_agent_id,votes_up,votes_down")
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

export async function removeDeal({
  dealId,
  agentId,
  now = new Date(),
  existing: existingOverride
}: any = {}) {
  if (!dealId || typeof dealId !== "string") {
    throw buildServiceError("dealId is required", 400, "VALIDATION_ERROR");
  }
  if (!agentId || typeof agentId !== "string") {
    throw buildServiceError("agentId is required", 400, "VALIDATION_ERROR");
  }

  const existing = existingOverride || (await getDealForRemove({ dealId }));

  if (existing.creator_agent_id !== agentId) {
    throw buildServiceError("Only the creating agent can remove this deal", 403, "FORBIDDEN", {
      isBlocked: true,
      reason: "authz"
    });
  }

  if (!DEAL_REMOVABLE_STATUSES.has(existing.status)) {
    throw buildServiceError("Deal is not removable in its current status", 409, "DEAL_NOT_REMOVABLE", {
      isBlocked: true,
      reason: "status",
      deal_status: existing.status
    });
  }

  const votesUp = Number(existing.votes_up || 0);
  const votesDown = Number(existing.votes_down || 0);
  if (votesUp > 0 || votesDown > 0) {
    throw buildServiceError("Deal is not removable after receiving votes", 409, "DEAL_NOT_REMOVABLE", {
      isBlocked: true,
      reason: "votes"
    });
  }

  if (existing.new_until) {
    const nowMs = now.getTime();
    const newUntilMs = new Date(existing.new_until).getTime();
    if (Number.isFinite(newUntilMs) && nowMs >= newUntilMs) {
      throw buildServiceError("Deal is not removable after activation window", 409, "DEAL_NOT_REMOVABLE", {
        isBlocked: true,
        reason: "new_window"
      });
    }
  }

  const nowIso = now.toISOString();
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("deals")
    .update({
      status: "REMOVED",
      updated_at: nowIso
    })
    .eq("deal_id", dealId)
    .eq("creator_agent_id", agentId)
    .eq("status", "NEW")
    .select("deal_id,status,updated_at")
    .maybeSingle();

  if (error) {
    mapError(error);
  }

  if (!data) {
    throw buildServiceError("Deal is not removable", 409, "DEAL_NOT_REMOVABLE", { isBlocked: true, reason: "race" });
  }

  return data;
}
