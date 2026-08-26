import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { redactValue } from "../audit/redaction";
import { processApprovalJobByApprovalId } from "./approval-jobs";
import { deleteCachedInstallationOauthScopes } from "./installation-scopes-cache";
import { enforceBuyMissionOffer } from "../policy/buy-mission-guard";
import { getPolicyOrDefault } from "./policies";
import { evaluatePolicyAction } from "../policy/evaluate";
import { ALLOWED_CURRENCIES } from "../config/deals";

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

function throwIfStaleOfferApproval(error: any, approval: any) {
  if (approval?.action_type !== "offer_over_budget") return;
  const message = String(error?.message || "");
  if (!/offer (?:not found|not counterable)|OFFER_NOT_COUNTERABLE/i.test(message)) return;
  throw Object.assign(new Error("The offer changed before approval could be applied"), {
    status: 409,
    code: "APPROVAL_STALE"
  });
}

function throwContactRevealConsentError(error: any): never {
  const message = String(error?.message || "");
  const known: Array<[RegExp, number, string, string]> = [
    [/APPROVAL_NOT_FOUND/i, 404, "NOT_FOUND", "Approval not found"],
    [/TX_NOT_FOUND/i, 404, "NOT_FOUND", "Approval not found"],
    [/OWNER_CONTACT_MISSING/i, 409, "OWNER_CONTACT_MISSING", "Both owners must verify their contact details"],
    [/CONTACT_REVEAL_FINALIZED/i, 409, "CONTACT_REVEAL_FINALIZED", "Contact reveal is already final"],
    [/CONTACT_REVEAL_NOT_REQUESTED/i, 409, "CONTACT_REVEAL_NOT_REQUESTED", "Contact reveal is not pending"],
    [/APPROVAL_ALREADY_RESOLVED/i, 409, "APPROVAL_ALREADY_RESOLVED", "Approval already resolved"],
    [/INVALID_DECISION/i, 400, "VALIDATION_ERROR", "Invalid approval decision"]
  ];
  for (const [pattern, status, code, publicMessage] of known) {
    if (pattern.test(message)) {
      throw Object.assign(new Error(publicMessage), { status, code });
    }
  }
  mapError(error);
  throw new Error("Unreachable contact reveal consent error");
}

const DIRECT_RESOLVE_ACTION_TYPES = new Set(["scopes.upgrade", "escrow.create", "escrow.confirm_received"]);

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

export async function upsertPendingApproval({
  ownerId,
  actionType,
  actionRef,
  actionRefId,
  actionPayload,
  createdByAgentId,
  now = new Date()
}: {
  ownerId: string;
  actionType: string;
  actionRef?: any;
  actionRefId: string;
  actionPayload?: any;
  createdByAgentId?: string | null;
  now?: Date;
}) {
  const client = getSupabaseServiceClient();
  const redacted = redactValue(actionPayload || {});
  const payload = {
    owner_id: ownerId,
    action_type: actionType,
    action_ref: actionRef || {},
    action_ref_id: actionRefId,
    action_payload_redacted: redacted.value,
    created_by_agent_id: createdByAgentId || null,
    state: "PENDING",
    created_at: now.toISOString(),
    resolved_at: null,
    resolved_by_human_id: null,
    resolved_reason_text: null
  };

  const { data, error } = await client
    .from("approvals")
    .upsert(payload, { onConflict: "owner_id,action_type,action_ref_id" })
    .select("*")
    .single();

  if (error) {
    mapError(error);
  }
  return data;
}

export async function listApprovals({ ownerId, state, limit, cursor, agentId }: any = {}) {
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

  if (agentId) {
    query = query.eq("created_by_agent_id", agentId);
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

const POSTGRES_INT4_MAX = 2_147_483_647;

function missionOfferFields(approval: any) {
  const payload = approval?.action_payload_redacted || {};
  const offer = payload?.offer || payload?.payload || payload;
  const ref = approval?.action_ref || {};
  return {
    missionId: ref.mission_id ? String(ref.mission_id) : null,
    agentId: ref.agent_id ? String(ref.agent_id) : null,
    amount: offer?.amount ?? ref.amount,
    currency: offer?.currency ?? ref.currency,
    expiresAt: offer?.expires_at ?? ref.expires_at
  };
}

export async function editPendingMissionOfferApproval({
  approval,
  ownerId,
  amount,
  now = new Date()
}: {
  approval: any;
  ownerId: string;
  amount: number;
  now?: Date;
}) {
  if (!approval || approval.owner_id !== ownerId) {
    throw Object.assign(new Error("Approval not found"), { status: 404, code: "NOT_FOUND" });
  }
  if (approval.state !== "PENDING") {
    throw Object.assign(new Error("Approval already resolved"), {
      status: 409,
      code: "APPROVAL_ALREADY_RESOLVED"
    });
  }
  if (approval.action_type !== "offer_over_budget") {
    throw Object.assign(new Error("Amount editing is not supported for this approval"), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > POSTGRES_INT4_MAX) {
    throw Object.assign(new Error(`amount must be an integer between 0 and ${POSTGRES_INT4_MAX}`), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const fields = missionOfferFields(approval);
  if (!fields.missionId || !fields.agentId) {
    throw Object.assign(new Error("Amount editing requires a mission-bound approval"), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }
  const currency = String(fields.currency || "").trim().toUpperCase();
  if (!ALLOWED_CURRENCIES.has(currency)) {
    throw Object.assign(new Error("Approval currency is invalid"), {
      status: 409,
      code: "APPROVAL_INVALID"
    });
  }
  const expiresAt = new Date(String(fields.expiresAt || ""));
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    throw Object.assign(new Error("Approval has expired"), {
      status: 409,
      code: "APPROVAL_EXPIRED"
    });
  }

  let mission: any = null;
  let missionDecision = "ALLOW";
  let missionReason: string | null = null;
  try {
    ({ mission } = await enforceBuyMissionOffer({
      missionId: fields.missionId,
      agentId: fields.agentId,
      amount,
      currency,
      now
    }));
  } catch (error: any) {
    // An authenticated owner may explicitly override a mission delegation or
    // budget rule. Missing, inactive, invalid, or expired missions still fail
    // closed because those are stale context rather than approval decisions.
    if (error?.code !== "APPROVAL_REQUIRED") throw error;
    missionDecision = "OWNER_OVERRIDE";
    missionReason = String(error?.details?.reason || "mission_policy");
    mission = {
      hard_budget_max: error?.details?.hard_budget_max ?? null,
      currency: error?.details?.currency ?? currency
    };
  }
  const policyRecord = await getPolicyOrDefault(ownerId);
  const policyDecision = evaluatePolicyAction({
    policy: policyRecord?.policy_json || {},
    action: "offer.create",
    offerAmount: amount,
    offerCurrency: currency
  });
  const currentPayload = approval.action_payload_redacted || {};
  const nextPayload = redactValue({
    ...currentPayload,
    offer: {
      ...(currentPayload.offer || {}),
      amount,
      currency,
      expires_at: expiresAt.toISOString()
    },
    owner_edit: {
      amount,
      mission_decision: missionDecision,
      mission_reason: missionReason,
      policy_decision: policyDecision.decision,
      policy_version: policyDecision.policy_version || null,
      edited_at: now.toISOString()
    }
  }).value;
  const nextRef = {
    ...(approval.action_ref || {}),
    amount,
    currency,
    expires_at: expiresAt.toISOString()
  };

  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("approvals")
    .update({ action_ref: nextRef, action_payload_redacted: nextPayload })
    .eq("approval_id", approval.approval_id)
    .eq("owner_id", ownerId)
    .eq("state", "PENDING")
    .select("*")
    .maybeSingle();
  if (error) mapError(error);
  if (!data) {
    throw Object.assign(new Error("Approval changed while it was being edited"), {
      status: 409,
      code: "APPROVAL_STALE"
    });
  }

  return { approval: data, mission, policyDecision };
}

export async function resolveApproval({ approvalId, ownerId, decision, resolvedBy, reason }: any) {
  const existing = await getApprovalForOwner(approvalId, ownerId);
  if (!existing) {
    throw Object.assign(new Error("Approval not found"), { status: 404, code: "NOT_FOUND" });
  }

  if (existing.action_type === "contact_reveal") {
    throw Object.assign(new Error("Bilateral owner consent is required for contact reveal"), {
      status: 409,
      code: "BILATERAL_CONSENT_REQUIRED"
    });
  }

  if (existing.action_type === "contact_reveal_consent") {
    const client = getSupabaseServiceClient();
    const { data: outcome, error } = await client
      .rpc("resolve_contact_reveal_consent_v1", {
        p_approval_id: approvalId,
        p_owner_id: ownerId,
        p_decision: decision,
        p_reason: reason ?? null
      })
      .single();
    if (error) throwContactRevealConsentError(error);

    const resolved = await getApprovalForOwner(approvalId, ownerId);
    if (!resolved) {
      throw Object.assign(new Error("Approval not found"), { status: 404, code: "NOT_FOUND" });
    }
    return {
      ...resolved,
      tx_id: outcome?.tx_id || existing.action_ref?.tx_id || existing.action_ref_id,
      contact_reveal_state: outcome?.contact_reveal_state || null,
      contact_revealed_at: outcome?.contact_revealed_at || null,
      tx_status: outcome?.tx_status || null,
      became_revealed: outcome?.became_revealed === true
    };
  }

  if (DIRECT_RESOLVE_ACTION_TYPES.has(String(existing.action_type || ""))) {
    const resolved = await resolveApprovalDirect({ approvalId, ownerId, decision, resolvedBy, reason });

    if (resolved?.state === "APPROVED" && resolved?.action_type === "scopes.upgrade") {
      const installationId =
        (resolved?.action_ref?.installation_id ? String(resolved.action_ref.installation_id) : null) ||
        (resolved?.action_ref_id ? String(resolved.action_ref_id) : null);
      if (installationId) {
        await deleteCachedInstallationOauthScopes(installationId);
      }
    }

    if (resolved?.state === "APPROVED" && resolved?.action_type === "escrow.confirm_received") {
      await processApprovalJobByApprovalId(String(resolved.approval_id));
    }

    return resolved;
  }

  const client = getSupabaseServiceClient();
  const rpcArgsWithReason: any = {
    p_approval_id: approvalId,
    p_owner_id: ownerId,
    p_decision: decision,
    p_resolved_by: resolvedBy,
    // Always target the 5-arg resolve_approval() overload (channel.pair support lives there).
    // Keep a fallback to 4-arg for older DBs.
    p_reason: reason ?? null
  };
  const { data, error } = await client.rpc("resolve_approval", rpcArgsWithReason).single();
  if (!error) return data;

  // Fallback: older DBs may not have the p_reason parameter yet.
  if (typeof error.message === "string" && /p_reason/i.test(error.message)) {
    const rpcArgsLegacy: any = {
      p_approval_id: approvalId,
      p_owner_id: ownerId,
      p_decision: decision,
      p_resolved_by: resolvedBy
    };
    const legacy = await client.rpc("resolve_approval", rpcArgsLegacy).single();
    if (legacy.error) {
      throwIfStaleOfferApproval(legacy.error, existing);
      mapError(legacy.error);
    }
    return legacy.data;
  }

  throwIfStaleOfferApproval(error, existing);
  mapError(error);
}

async function resolveApprovalDirect({ approvalId, ownerId, decision, resolvedBy, reason }: any) {
  if (decision !== "APPROVED" && decision !== "DENIED") {
    throw Object.assign(new Error("invalid decision"), { status: 400, code: "VALIDATION_ERROR" });
  }

  const client = getSupabaseServiceClient();
  const patch = {
    state: decision,
    resolved_at: new Date().toISOString(),
    resolved_by_human_id: resolvedBy || null,
    resolved_reason_text: reason ?? null
  };

  const { data, error } = await client
    .from("approvals")
    .update(patch)
    .eq("approval_id", approvalId)
    .eq("owner_id", ownerId)
    .eq("state", "PENDING")
    .select("*")
    .maybeSingle();

  if (error) {
    mapError(error);
  }

  if (data) return data;

  // Race safety: if another resolver won, return current state.
  const current = await getApprovalForOwner(approvalId, ownerId);
  if (!current) {
    throw Object.assign(new Error("Approval not found"), { status: 404, code: "NOT_FOUND" });
  }
  return current;
}

const DEFAULT_APPROVAL_SLA_HOURS = 24;

export function computeApprovalAge(createdAt: string): { hours: number; days: number } {
  const created = new Date(createdAt);
  const now = Date.now();
  const diffMs = now - created.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return { hours, days };
}

export function isApprovalStale(createdAt: string, thresholdHours?: number): boolean {
  const threshold = thresholdHours ?? (Number(process.env.APPROVAL_SLA_HOURS) || DEFAULT_APPROVAL_SLA_HOURS);
  const { hours } = computeApprovalAge(createdAt);
  return hours >= threshold;
}

const BULK_MAX_ITEMS = 50;

export async function bulkResolveApprovals({ approvalIds, decision, resolvedBy, reason }: any) {
  if (!Array.isArray(approvalIds) || approvalIds.length === 0) {
    throw Object.assign(new Error("approval_ids must be a non-empty array"), { status: 400, code: "VALIDATION_ERROR" });
  }
  if (approvalIds.length > BULK_MAX_ITEMS) {
    throw Object.assign(new Error(`Max ${BULK_MAX_ITEMS} approvals per bulk request`), { status: 400, code: "VALIDATION_ERROR" });
  }

  const resolved: any[] = [];
  const errors: any[] = [];

  for (const id of approvalIds) {
    try {
      const approval = await getApproval(id);
      if (!approval) {
        errors.push({ approval_id: id, error: "Not found" });
        continue;
      }
      if (approval.state !== "PENDING") {
        errors.push({ approval_id: id, error: "Already resolved" });
        continue;
      }
      const result = await resolveApproval({
        approvalId: id,
        ownerId: approval.owner_id,
        decision,
        resolvedBy,
        reason
      });
      resolved.push(result);
    } catch (err: any) {
      errors.push({ approval_id: id, error: err.message || "Unknown error" });
    }
  }

  return { resolved, errors };
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
