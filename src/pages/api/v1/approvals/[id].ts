import { withApiMiddlewares } from "../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../server/http/response";
import { methodNotAllowed } from "../../../../server/http/methods";
import { errorPayload } from "../../../../server/http/errors";
import { isUuid } from "../../../../server/utils/validators";
import { getApprovalForOwner, resolveApproval } from "../../../../server/services/approvals";
import { safeAuditLog } from "../../../../server/audit/singleton";
import { getListing } from "../../../../server/services/listings";
import { matchListingToWatchlists } from "../../../../server/services/watchlist-matching";

function getHeaderValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function handler(req, res, ctx) {
  if (req.method !== "GET" && req.method !== "POST") {
    return methodNotAllowed(["GET", "POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  // v0 WebMCP uses agent API keys in-browser; allow agent actor if it carries an owner_id in ctx.
  const actorType = ctx?.actor?.type;
  if (actorType !== "owner" && actorType !== "agent") {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }

  const ownerId = ctx?.ownerId || null;
  if (!ownerId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Owner authentication required"));
  }
  if (!isUuid(ownerId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "owner_id must be a UUID"));
  }

  const idParam = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  const rawId = String(idParam || "");
  if (!rawId) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "approval_id is required"));
  }

  const parts = rawId.split(":");
  const approvalId = parts[0] || "";
  const action = parts[1] || null;

  if (!isUuid(approvalId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "approval_id must be a UUID"));
  }

  // GET /v1/approvals/{approval_id}
  if (req.method === "GET") {
    if (ctx) {
      ctx.auditEvent = "approval.viewed";
      ctx.body = { approval_id: approvalId };
    }

    try {
      const approval = await getApprovalForOwner(approvalId, ownerId);
      if (!approval) {
        return jsonResponse(404, errorPayload("NOT_FOUND", "Approval not found"));
      }

      return jsonResponse(200, { data: approval });
    } catch (error) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }
  }

  // POST /v1/approvals/{approval_id}:approve|deny
  if (!action) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown approval action"));
  }

  const idempotencyKey = getHeaderValue(req, "idempotency-key");
  if (!idempotencyKey) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }

  const body = req.body || {};
  const rawNote = body?.note;
  let note: string | null = null;
  if (rawNote !== undefined && rawNote !== null && rawNote !== "") {
    if (typeof rawNote !== "string") {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "note must be a string"));
    }
    const trimmed = rawNote.trim();
    if (trimmed.length > 400) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "note must be 0..400 characters"));
    }
    note = trimmed || null;
  }

  if (action !== "approve" && action !== "deny") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown approval action"));
  }

  const decision = action === "approve" ? "APPROVED" : "DENIED";

  try {
    const existing = await getApprovalForOwner(approvalId, ownerId);
    if (!existing) {
      return jsonResponse(404, errorPayload("NOT_FOUND", "Approval not found"));
    }

    if (existing.state !== "PENDING") {
      if (existing.state === decision) {
        return jsonResponse(200, { data: existing });
      }
      return jsonResponse(409, errorPayload("APPROVAL_ALREADY_RESOLVED", "Approval already resolved"));
    }

    const resolved = await resolveApproval({
      approvalId,
      ownerId,
      decision,
      resolvedBy: ownerId,
      reason: note
    });

    if (resolved.state !== decision) {
      return jsonResponse(409, errorPayload("APPROVAL_ALREADY_RESOLVED", "Approval already resolved"));
    }

    if (ctx) {
      ctx.auditEvent = "approval.resolved";
      ctx.policy = {
        decision: "N_A",
        approval_id: approvalId,
        policy_version: null
      };
    }

    // If this approval executes a redacted message, write an additional audit event
    // `message.redacted` without storing any plaintext message body.
    if (decision === "APPROVED" && existing.action_type === "message.send") {
      const ref: any = existing.action_ref || {};
      const messageRedacted = ref.message_redacted === true;
      if (messageRedacted) {
        await safeAuditLog({
          occurredAt: new Date().toISOString(),
          actor: ctx?.actor || null,
          auth: {
            agent_id: null,
            owner_id: ownerId,
            api_key_id: ctx?.apiKeyId || null,
            api_key_state: ctx?.apiKeyState || null
          },
          request: {
            id: ctx?.requestId || null,
            ip: ctx?.ip || null,
            userAgent: ctx?.userAgent || null,
            method: ctx?.method || null,
            path: ctx?.path || null,
            query: ctx?.query || null
          },
          action: {
            route_group: ctx?.rateLimit?.group || null,
            method: ctx?.method || null,
            path: ctx?.path || null,
            event: "message.redacted"
          },
          security: {},
          policy: ctx?.policy || {},
          payload: {
            approval_id: approvalId,
            thread_id: ref.thread_id || null,
            message_type: ref.message_type || null,
            original_hmac: ref.original_hmac || null,
            redaction_reason: ref.redaction_reason || null
          },
          rateLimit: ctx?.rateLimit || null,
          idempotency: ctx?.idempotency || null,
          outcome: "SUCCESS"
        });
      }
    }

    if (decision === "APPROVED" && existing.action_type === "listing_publish") {
      const listingId = existing.action_ref_id || existing?.action_ref?.listing_id || null;
      if (typeof listingId === "string" && isUuid(listingId)) {
        try {
          const listing = await getListing(listingId);
          if (listing && listing.status === "LIVE") {
            await matchListingToWatchlists({
              listing: {
                listing_id: listing.listing_id,
                title: listing.title,
                category: listing.category,
                condition: listing.condition,
                price_amount: listing.price_amount,
                currency: listing.currency,
                geo_lat: listing.geo_lat ?? null,
                geo_lng: listing.geo_lng ?? null
              }
            });
          }
        } catch (error) {
          console.info("watchlist.match_listing_failed", {
            listing_id: listingId,
            error: error?.message || String(error)
          });
        }
      }
    }

    return jsonResponse(200, { data: resolved });
  } catch (error) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }
}

export default withApiMiddlewares(handler);
