import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 20;
const MAX_OWNER_AGENTS = 200;

function mapError(error: any): never {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), {
    status: mapped.status,
    code: mapped.code
  });
}

function isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeLimit(value: any): number {
  if (value === undefined || value === null) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw Object.assign(new Error(`limit must be between 1 and ${MAX_LIMIT}`), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }
  return parsed;
}

function mapPolicyDecision(row: any) {
  const policy = isPlainObject(row?.policy) ? row.policy : {};
  const requestId = typeof row?.request_id === "string" && row.request_id ? row.request_id : null;
  return {
    decision_id: String(row.id),
    ts: row?.occurred_at ? String(row.occurred_at) : null,
    agent_id: row?.actor?.id ? String(row.actor.id) : null,
    action: row?.action?.event ? String(row.action.event) : row?.action?.path ? String(row.action.path) : "unknown",
    entity_type: row?.action?.entity_type ? String(row.action.entity_type) : null,
    entity_id: row?.action?.entity_id ? String(row.action.entity_id) : null,
    outcome: row?.outcome ? String(row.outcome) : null,
    decision: String(policy.decision),
    policy_version: Number.isInteger(policy.policy_version) ? policy.policy_version : null,
    approval_id: typeof policy.approval_id === "string" && policy.approval_id ? policy.approval_id : null,
    request_id: requestId,
    receipt_url: requestId ? `/api/v1/owner/policy-decisions?request_id=${encodeURIComponent(requestId)}` : null
  };
}

/**
 * Returns decisions made by the authenticated owner's policy. Legacy audit
 * rows without policy.owner_id fall back to current agent ownership.
 */
export async function listPolicyDecisionsForOwner({
  ownerId,
  limit = DEFAULT_LIMIT,
  requestId = null
}: {
  ownerId: string;
  limit?: number;
  requestId?: string | null;
}) {
  if (!ownerId) {
    throw Object.assign(new Error("ownerId is required"), {
      status: 400,
      code: "VALIDATION_ERROR"
    });
  }

  const resolvedLimit = normalizeLimit(limit);
  const client = getSupabaseServiceClient();
  const { data: ownerAgents, error: ownerAgentsError } = await client
    .from("agents")
    .select("id")
    .eq("owner_id", ownerId)
    .limit(MAX_OWNER_AGENTS);

  if (ownerAgentsError) mapError(ownerAgentsError);

  const ownerAgentIds = new Set(
    (Array.isArray(ownerAgents) ? ownerAgents : [])
      .map((row: any) => (typeof row?.id === "string" ? row.id : ""))
      .filter(Boolean)
  );

  const createDecisionQuery = () =>
    client
      .from("audit_logs")
      .select("id,occurred_at,actor,action,outcome,request_id,policy")
      .not("policy->>decision", "is", null)
      .neq("policy->>decision", "N_A")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false });

  let modernQuery = createDecisionQuery().eq("policy->>owner_id", ownerId);
  if (requestId) modernQuery = modernQuery.eq("request_id", requestId);

  let legacyQuery =
    ownerAgentIds.size > 0
      ? createDecisionQuery().is("policy->>owner_id", null).in("actor->>id", Array.from(ownerAgentIds))
      : null;
  if (legacyQuery && requestId) legacyQuery = legacyQuery.eq("request_id", requestId);

  const [modernResult, legacyResult] = await Promise.all([
    modernQuery.limit(resolvedLimit),
    legacyQuery ? legacyQuery.limit(resolvedLimit) : Promise.resolve({ data: [], error: null })
  ]);

  if (modernResult.error) mapError(modernResult.error);
  if (legacyResult.error) mapError(legacyResult.error);

  const auditRows = [
    ...(Array.isArray(modernResult.data) ? modernResult.data : []),
    ...(Array.isArray(legacyResult.data) ? legacyResult.data : [])
  ];

  return auditRows
    .filter((row: any) => {
      const policyOwnerId = isPlainObject(row?.policy) ? row.policy.owner_id : null;
      if (typeof policyOwnerId === "string" && policyOwnerId) return policyOwnerId === ownerId;
      return row?.actor?.type === "agent" && ownerAgentIds.has(String(row?.actor?.id || ""));
    })
    .filter((row: any) => {
      const decision = isPlainObject(row?.policy) ? row.policy.decision : null;
      return typeof decision === "string" && decision.trim() !== "" && decision !== "N_A";
    })
    .sort((left: any, right: any) => {
      const byTime = String(right?.occurred_at || "").localeCompare(String(left?.occurred_at || ""));
      if (byTime !== 0) return byTime;
      return String(right?.id || "").localeCompare(String(left?.id || ""));
    })
    .filter(
      (row: any, index: number, rows: any[]) => rows.findIndex((candidate) => candidate?.id === row?.id) === index
    )
    .slice(0, resolvedLimit)
    .map(mapPolicyDecision);
}
