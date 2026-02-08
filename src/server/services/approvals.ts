import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { redactValue } from "../audit/redaction";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export function encodeApprovalCursor(cursor) {
  if (!cursor) return null;
  const payload = JSON.stringify({
    created_at: cursor.created_at,
    approval_id: cursor.approval_id
  });
  return Buffer.from(payload, "utf8").toString("base64");
}

export function decodeApprovalCursor(raw) {
  if (!raw || typeof raw !== "string") return null;
  let decoded;
  try {
    decoded = Buffer.from(raw, "base64").toString("utf8");
  } catch (error) {
    return { error: "Invalid cursor" };
  }
  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    return { error: "Invalid cursor" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { error: "Invalid cursor" };
  }
  if (typeof parsed.created_at !== "string" || typeof parsed.approval_id !== "string") {
    return { error: "Invalid cursor" };
  }
  return {
    value: {
      created_at: parsed.created_at,
      approval_id: parsed.approval_id
    }
  };
}

function formatFilterValue(value) {
  if (typeof value !== "string") return String(value);
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function mapError(error) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export async function createApproval({
  ownerId,
  actionType,
  actionRef,
  actionRefId,
  actionPayload,
  createdByAgentId
}) {
  const client = getSupabaseServiceClient();
  const redacted = redactValue(actionPayload || {});
  const payload = {
    owner_id: ownerId,
    action_type: actionType,
    action_ref: actionRef || {},
    action_ref_id: actionRefId,
    action_payload_redacted: redacted.value,
    created_by_agent_id: createdByAgentId || null
  };

  const { data, error } = await client.from("approvals").insert(payload).select("*").single();
  if (error) {
    if (error.message && /duplicate key value/i.test(error.message)) {
      const existing = await client
        .from("approvals")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("action_type", actionType)
        .eq("action_ref_id", actionRefId)
        .maybeSingle();
      if (existing.error) {
        mapError(existing.error);
      }
      if (existing.data) {
        return existing.data;
      }
    }
    mapError(error);
  }
  return data;
}

export async function listApprovals({ ownerId, state, limit, cursor }: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;
  let query = client
    .from("approvals")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .order("approval_id", { ascending: false })
    .limit(pageLimit + 1);

  if (state) {
    query = query.eq("state", state);
  }

  if (cursor?.created_at && cursor?.approval_id) {
    const createdAt = formatFilterValue(cursor.created_at);
    const approvalId = formatFilterValue(cursor.approval_id);
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},approval_id.lt.${approvalId})`
    );
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const approvals = data || [];
  const hasMore = approvals.length > pageLimit;
  const items = hasMore ? approvals.slice(0, pageLimit) : approvals;
  const nextCursor = hasMore
    ? encodeApprovalCursor({
        created_at: items[items.length - 1].created_at,
        approval_id: items[items.length - 1].approval_id
      })
    : null;

  return { approvals: items, nextCursor };
}

export async function getApproval(approvalId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("approvals").select("*").eq("approval_id", approvalId).maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function getApprovalForOwner(approvalId, ownerId) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("approvals")
    .select("*")
    .eq("approval_id", approvalId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) {
    mapError(error);
  }
  return data || null;
}

export async function resolveApproval({ approvalId, ownerId, decision, resolvedBy }) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .rpc("resolve_approval", {
      p_approval_id: approvalId,
      p_owner_id: ownerId,
      p_decision: decision,
      p_resolved_by: resolvedBy
    })
    .single();
  if (error) {
    mapError(error);
  }
  return data;
}

export async function cancelPendingListingPublishApproval({ ownerId, listingId, now = new Date() }: any = {}) {
  if (!ownerId || typeof ownerId !== "string") {
    throw Object.assign(new Error("ownerId is required"), { status: 400, code: "VALIDATION_ERROR" });
  }
  if (!listingId || typeof listingId !== "string") {
    throw Object.assign(new Error("listingId is required"), { status: 400, code: "VALIDATION_ERROR" });
  }

  const client = getSupabaseServiceClient();
  const { data: existing, error: existingError } = await client
    .from("approvals")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("action_type", "listing_publish")
    .eq("action_ref_id", listingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    mapError(existingError);
  }
  if (!existing) return null;
  if (existing.state !== "PENDING") return existing;

  const { data, error } = await client
    .from("approvals")
    .update({
      state: "CANCELLED",
      resolved_at: now.toISOString(),
      resolved_by_human_id: null
    })
    .eq("approval_id", existing.approval_id)
    .eq("owner_id", ownerId)
    .eq("state", "PENDING")
    .select("*")
    .maybeSingle();

  if (error) {
    mapError(error);
  }

  // In case of a race (another resolver updated the row), fall back to the last observed state.
  return data || existing;
}

export async function listAllApprovals({ state, actionType, createdByAgentId, limit, cursor }: any = {}) {
  const client = getSupabaseServiceClient();
  const pageLimit = limit ?? DEFAULT_LIMIT;
  let query = client
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false })
    .order("approval_id", { ascending: false })
    .limit(pageLimit + 1);

  if (state) {
    query = query.eq("state", state);
  }

  if (actionType) {
    query = query.eq("action_type", actionType);
  }

  if (createdByAgentId) {
    query = query.eq("created_by_agent_id", createdByAgentId);
  }

  if (cursor?.created_at && cursor?.approval_id) {
    const createdAt = formatFilterValue(cursor.created_at);
    const approvalId = formatFilterValue(cursor.approval_id);
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},approval_id.lt.${approvalId})`
    );
  }

  const { data, error } = await query;
  if (error) {
    mapError(error);
  }

  const approvals = data || [];
  const hasMore = approvals.length > pageLimit;
  const items = hasMore ? approvals.slice(0, pageLimit) : approvals;
  const nextCursor = hasMore
    ? encodeApprovalCursor({
        created_at: items[items.length - 1].created_at,
        approval_id: items[items.length - 1].approval_id
      })
    : null;

  return { approvals: items, nextCursor };
}

export { MAX_LIMIT as APPROVALS_MAX_LIMIT };
