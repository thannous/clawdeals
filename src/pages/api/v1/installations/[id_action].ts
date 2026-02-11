import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { API_KEY_GRACE_SECONDS } from "../../../../server/utils/api-keys";
import { getSupabaseServiceClient } from "../../../../server/db/supabase";
import { mapSupabaseError } from "../../../../server/services/supabase-errors";
import { revokeInstallationForOwner, getInstallationById } from "../../../../server/services/agent-installations";
import { rotateInstallationApiKeyForOwner } from "../../../../server/services/api-keys";
import { createApproval } from "../../../../server/services/approvals";
import {
  V1_SCOPES_DEFAULT,
  V1_SCOPES_UPGRADE_ONLY,
  normalizeRequestedScopes,
  sortScopesStable
} from "../../../../shared/scopes/v1";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  if (value === null || value === undefined) return null;
  return value;
}

function resolveHeader(req: any, name: string) {
  const value = req?.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeReason(value: any) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return { error: "reason must be a string" };
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return { error: "reason must be at most 200 characters" };
  return trimmed;
}

function buildServiceError(message: string, status = 500, code = "ERROR", details?: any) {
  const error: any = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function mapSupabaseServiceError(error: any) {
  const mapped = mapSupabaseError(error);
  return buildServiceError(mapped.message, mapped.status, mapped.code);
}

function parseRequestedScopes(body: any) {
  const requested = body?.requested_scopes ?? body?.requestedScopes ?? [];
  if (requested === null || requested === undefined) return [];
  return requested;
}

function parseGraceSeconds(body: any) {
  const raw = body?.grace_seconds ?? body?.graceSeconds;
  if (raw === null || raw === undefined || raw === "") {
    return { value: API_KEY_GRACE_SECONDS };
  }

  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 0) {
      return { error: "grace_seconds must be an integer greater than or equal to 0" };
    }
    return { value: raw };
  }

  if (typeof raw === "string") {
    const normalized = raw.trim();
    if (!/^\d+$/.test(normalized)) {
      return { error: "grace_seconds must be an integer greater than or equal to 0" };
    }

    const parsed = Number(normalized);
    if (!Number.isSafeInteger(parsed)) {
      return { error: "grace_seconds must be an integer greater than or equal to 0" };
    }

    return { value: parsed };
  }

  return { error: "grace_seconds must be an integer greater than or equal to 0" };
}

function isResolvedApprovalState(state: any) {
  return state === "APPROVED" || state === "DENIED" || state === "EXPIRED" || state === "CANCELLED";
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  const idAction = String(resolveParam(req.query?.id_action) || "");
  const [installationId, action] = idAction.split(":");
  if (!installationId || !action) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }
  if (!isUuid(installationId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "installation_id must be a UUID"));
  }
  if (action !== "revoke" && action !== "rotate" && action !== "scopes-upgrade") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown action"));
  }

  const idemKey = resolveHeader(req, "idempotency-key");
  if (!idemKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  // POST /v1/installations/{id}:revoke
  if (action === "revoke") {
    if (ctx?.actor?.type !== "owner") {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
    }

    const ownerId = ctx?.ownerId || null;
    if (!ownerId) {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
    }
    if (!isUuid(ownerId)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
    }

    const body = req.body || {};
    const normalizedReason = normalizeReason(body.reason);
    if (normalizedReason && typeof normalizedReason === "object" && "error" in normalizedReason) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", normalizedReason.error));
    }
    const reason = typeof normalizedReason === "string" ? normalizedReason : null;

    if (ctx) {
      ctx.auditEvent = "installation.revoked";
      ctx.auditEntityType = "installation";
      ctx.auditEntityId = installationId;
      ctx.security = {
        installation_id: installationId,
        reason
      };
    }

    try {
      const revoked: any = await revokeInstallationForOwner({
        ownerId,
        installationId,
        reason,
        now: new Date()
      });

      return jsonResponse(200, {
        installation_id: revoked.installation_id,
        status: "REVOKED",
        revoked_at: revoked.revoked_at
      });
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  // POST /v1/installations/{id}:rotate
  if (action === "rotate") {
    if (ctx?.actor?.type !== "owner") {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
    }

    const ownerId = ctx?.ownerId || null;
    if (!ownerId) {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
    }
    if (!isUuid(ownerId)) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
    }

    const body = req.body || {};
    const parsedGraceSeconds = parseGraceSeconds(body);
    if (parsedGraceSeconds && typeof parsedGraceSeconds === "object" && "error" in parsedGraceSeconds) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsedGraceSeconds.error));
    }
    const graceSeconds = Number(parsedGraceSeconds.value);

    if (ctx) {
      ctx.auditEvent = "installation.key_rotated";
      ctx.auditEntityType = "installation";
      ctx.auditEntityId = installationId;
      ctx.security = {
        installation_id: installationId,
        grace_seconds: graceSeconds
      };
    }

    try {
      const rotated = await rotateInstallationApiKeyForOwner({
        ownerId,
        installationId,
        graceSeconds
      });

      if (ctx) {
        ctx.security = {
          ...(ctx.security || {}),
          api_key_id: rotated.apiKeyId,
          previous_api_key_id: rotated.previousApiKeyId
        };
      }

      return jsonResponse(
        200,
        {
          installation_id: installationId,
          api_key_id: rotated.apiKeyId,
          api_key: rotated.apiKey,
          rotated_at: rotated.rotatedAt.toISOString(),
          previous_api_key_id: rotated.previousApiKeyId,
          grace_seconds: rotated.graceSeconds
        },
        { "Cache-Control": "no-store" }
      );
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
    }
  }

  // POST /v1/installations/{id}:scopes-upgrade
  try {
    const actorType = ctx?.actor?.type;
    if (actorType !== "owner" && actorType !== "agent") {
      return jsonResponse(401, errorPayload("UNAUTHORIZED", "Authentication required"));
    }

    const installation = await getInstallationById(installationId);
    if (!installation) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Installation not found"));
    }

    const installationOwnerId = installation.owner_id ? String(installation.owner_id) : null;
    const installationAgentId = installation.agent_id ? String(installation.agent_id) : null;

    if (actorType === "owner") {
      const ownerId = ctx?.ownerId || null;
      if (!ownerId) {
        return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
      }
      if (!isUuid(ownerId)) {
        return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
      }
      if (!installationOwnerId || ownerId !== installationOwnerId) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Installation not found"));
      }
    }

    if (actorType === "agent") {
      const agentId = ctx?.agentId || null;
      if (!agentId) {
        return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
      }
      // Agent can only request upgrades for its own installation-scoped credentials.
      if (!ctx?.installationId || String(ctx.installationId) !== installationId) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Installation not found"));
      }
      if (installationAgentId && String(agentId) !== installationAgentId) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Installation not found"));
      }
    }

    if (!installationOwnerId || !isUuid(installationOwnerId)) {
      return jsonResponse(409, errorPayload("INSTALLATION_OWNER_REQUIRED", "Installation owner is missing"));
    }

    const body = req.body || {};
    const parsedRequested = parseRequestedScopes(body);
    if (
      parsedRequested !== undefined &&
      parsedRequested !== null &&
      !Array.isArray(parsedRequested) &&
      typeof parsedRequested !== "string"
    ) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "requested_scopes must be an array"));
    }

    const normalized = normalizeRequestedScopes(parsedRequested);
    if (normalized.unknown.length > 0) {
      return jsonResponse(
        400,
        errorPayload("VALIDATION_ERROR", "Unknown scope(s) requested", {
          unknown_scopes: normalized.unknown
        })
      );
    }

    const currentScopes = Array.isArray(installation.oauth_scopes) ? installation.oauth_scopes : [];
    const current = new Set(sortScopesStable(currentScopes));
    const upgradeOnly = new Set(V1_SCOPES_UPGRADE_ONLY);
    const defaultSet = new Set(V1_SCOPES_DEFAULT);

    const requestedUpgradeOnly = sortScopesStable(
      normalized.normalized.filter((s) => upgradeOnly.has(s) && !defaultSet.has(s))
    );
    const missingUpgradeOnly = requestedUpgradeOnly.filter((s) => !current.has(s));

    if (ctx) {
      ctx.auditEvent = "installation.scopes_upgrade_requested";
      ctx.auditEntityType = "installation";
      ctx.auditEntityId = installationId;
      ctx.security = {
        ...(ctx.security || {}),
        installation_id: installationId,
        requested_scopes: requestedUpgradeOnly,
        missing_scopes: missingUpgradeOnly
      };
    }

    if (missingUpgradeOnly.length === 0) {
      return jsonResponse(200, {
        oauth_scopes: sortScopesStable(currentScopes)
      });
    }

    // Reuse a single approval row per installation; refresh it if previously resolved.
    const client = getSupabaseServiceClient();
    const { data: existing, error: existingError } = await client
      .from("approvals")
      .select("*")
      .eq("owner_id", installationOwnerId)
      .eq("action_type", "scopes.upgrade")
      .eq("action_ref_id", installationId)
      .maybeSingle();
    if (existingError) {
      throw mapSupabaseServiceError(existingError);
    }

    const nowIso = new Date().toISOString();
    let approval: any = null;

    if (!existing) {
      approval = await createApproval({
        ownerId: installationOwnerId,
        actionType: "scopes.upgrade",
        actionRef: {
          installation_id: installationId,
          agent_id: installationAgentId || null
        },
        actionRefId: installationId,
        actionPayload: {
          requested_scopes: missingUpgradeOnly,
          current_scopes: sortScopesStable(currentScopes)
        },
        createdByAgentId: actorType === "agent" ? (ctx?.agentId || null) : null
      });
    } else {
      const prevRequested = Array.isArray(existing?.action_payload_redacted?.requested_scopes)
        ? existing.action_payload_redacted.requested_scopes
        : [];
      const merged = sortScopesStable([...prevRequested, ...missingUpgradeOnly]);
      const wasResolved = isResolvedApprovalState(existing.state);

      const patch: any = {
        action_ref: {
          ...(existing.action_ref || {}),
          installation_id: installationId,
          agent_id: installationAgentId || null
        },
        action_payload_redacted: {
          ...(existing.action_payload_redacted || {}),
          requested_scopes: merged,
          current_scopes: sortScopesStable(currentScopes)
        },
        created_by_agent_id: actorType === "agent" ? (ctx?.agentId || null) : existing.created_by_agent_id || null,
        state: "PENDING"
      };

      if (wasResolved) {
        patch.resolved_at = null;
        patch.resolved_by_human_id = null;
        patch.resolved_reason_text = null;
        patch.created_at = nowIso;
      }

      const { data: updated, error: updateError } = await client
        .from("approvals")
        .update(patch)
        .eq("approval_id", existing.approval_id)
        .eq("owner_id", installationOwnerId)
        .select("*")
        .maybeSingle();

      if (updateError) {
        throw mapSupabaseServiceError(updateError);
      }

      approval = updated || existing;
    }

    const requestedFinal = Array.isArray(approval?.action_payload_redacted?.requested_scopes)
      ? approval.action_payload_redacted.requested_scopes
      : missingUpgradeOnly;

    return jsonResponse(202, {
      status: "PENDING_APPROVAL",
      approval_id: approval.approval_id,
      requested_scopes: sortScopesStable(requestedFinal),
      current_scopes: sortScopesStable(currentScopes)
    });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message, error.details));
  }
}

export default withApiMiddlewares(handler);
