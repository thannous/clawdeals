import { withApiMiddlewares } from "../../../../../server/middleware/with-api-middlewares";
import { jsonResponse } from "../../../../../server/http/response";
import { methodNotAllowed } from "../../../../../server/http/methods";
import { errorPayload } from "../../../../../server/http/errors";
import { isUuid } from "../../../../../server/utils/validators";
import { getUndoWindowSeconds } from "../../../../../server/config/chat-commands";
import {
  cancelStagedCommand,
  confirmStagedCommand,
  getStagedCommandForAgent,
  markStagedCommandExecuted,
  markStagedCommandExpired,
  markStagedCommandPendingApproval,
  markStagedCommandUndone
} from "../../../../../server/services/staged-commands";

import { handler as watchlistsHandler } from "../../watchlists/index";
import { handler as watchlistDetailHandler } from "../../watchlists/[watchlist_id]";
import { handler as listingsCreateHandler } from "../../listings";
import { handler as listingDetailHandler } from "../../listings/[id]";
import { handler as offerCreateHandler } from "../../listings/[id]/offers";
import { handler as offerCounterHandler } from "../../offers/[offer_id]/counter";
import { handler as offerCancelHandler } from "../../offers/[offer_id]/cancel";
import { handler as contactRevealRequestHandler } from "../../transactions/[tx_id]/request-contact-reveal";
import { handler as markCompletedHandler } from "../../transactions/[tx_id]/mark-completed";

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseCommandParam(raw: any) {
  const value = resolveParam(raw);
  const str = value ? String(value) : "";
  const idx = str.lastIndexOf(":");
  if (idx <= 0) return { ok: false as const, error: "Invalid command" };
  const commandId = str.slice(0, idx);
  const action = str.slice(idx + 1);
  if (!isUuid(commandId)) return { ok: false as const, error: "command_id must be a UUID" };
  if (!action) return { ok: false as const, error: "action is required" };
  return { ok: true as const, value: { commandId, action } };
}

function isIsoDate(value: any) {
  if (typeof value !== "string" || !value) return false;
  const d = new Date(value);
  return Number.isFinite(d.getTime());
}

function buildUndoInfo(command: any, { now = new Date() } = {}) {
  if (!command?.undo_supported) return null;
  const expiresAt = command.undo_expires_at;
  const undoneAt = command.undone_at;
  const isExpired = !expiresAt || !isIsoDate(expiresAt) ? true : new Date(expiresAt).getTime() < now.getTime();
  return {
    supported: true,
    action_type: command.undo_action_type || null,
    expires_at: expiresAt || null,
    state: undoneAt ? "UNDONE" : isExpired ? "EXPIRED" : "AVAILABLE"
  };
}

function requireIdempotencyKeyEqualsCommandId(req: any, commandId: string) {
  const key = getHeaderValue(req, "idempotency-key");
  if (!key) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
  }
  if (String(key) !== String(commandId)) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key must equal command_id"));
  }
  return null;
}

async function executeAction({ actionType, payload, commandId, ctx }: any) {
  const headers = { "idempotency-key": commandId };

  if (actionType === "watchlist.create") {
    const req: any = { method: "POST", headers, query: {}, body: payload };
    return watchlistsHandler(req, null, ctx);
  }

  if (actionType === "listing.create") {
    const req: any = { method: "POST", headers, query: {}, body: payload };
    return listingsCreateHandler(req, null, ctx);
  }

  if (actionType === "offer.create") {
    const listingId = payload?.listing_id;
    const req: any = {
      method: "POST",
      headers,
      query: { id: listingId },
      body: {
        thread_id: payload?.thread_id ?? null,
        amount: payload?.amount,
        currency: payload?.currency,
        expires_at: payload?.expires_at
      }
    };
    return offerCreateHandler(req, null, ctx);
  }

  if (actionType === "offer.counter") {
    const offerId = payload?.offer_id;
    const req: any = {
      method: "POST",
      headers,
      query: { offer_id: offerId },
      body: {
        amount: payload?.amount,
        currency: payload?.currency,
        expires_at: payload?.expires_at
      }
    };
    return offerCounterHandler(req, null, ctx);
  }

  if (actionType === "contact_reveal.request") {
    const txId = payload?.tx_id;
    const req: any = { method: "POST", headers, query: { tx_id: txId }, body: {} };
    return contactRevealRequestHandler(req, null, ctx);
  }

  if (actionType === "transaction.mark_completed") {
    const txId = payload?.tx_id;
    const req: any = { method: "POST", headers, query: { tx_id: txId }, body: {} };
    return markCompletedHandler(req, null, ctx);
  }

  return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Unsupported action_type"));
}

async function executeUndo({ command, commandId, ctx }: any) {
  const headers = { "idempotency-key": commandId };

  if (command.undo_action_type === "watchlist.deactivate") {
    const watchlistId = command.result_ref_id;
    const req: any = { method: "PATCH", headers, query: { watchlist_id: watchlistId }, body: { active: false } };
    return watchlistDetailHandler(req, null, ctx);
  }

  if (command.undo_action_type === "listing.removed") {
    const listingId = command.result_ref_id;
    const req: any = { method: "PATCH", headers, query: { id: listingId }, body: { status: "REMOVED" } };
    return listingDetailHandler(req, null, ctx);
  }

  if (command.undo_action_type === "offer.cancel") {
    const offerId = command.result_ref_id;
    const req: any = { method: "POST", headers, query: { offer_id: offerId }, body: {} };
    return offerCancelHandler(req, null, ctx);
  }

  return jsonResponse(409, errorPayload("UNDO_NOT_SUPPORTED", "Undo not supported"));
}

export async function handler(req: any, res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const parsed = parseCommandParam(req.query?.command);
  if (!parsed.ok) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
  }
  const { commandId, action } = parsed.value;

  if (action !== "confirm" && action !== "cancel" && action !== "undo") {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown command action"));
  }

  // All actions should be idempotent and keyed by the stable command_id.
  const idemErr = requireIdempotencyKeyEqualsCommandId(req, commandId);
  if (idemErr) return idemErr;

  const command = await getStagedCommandForAgent({ commandId, agentId: ctx.agentId });
  if (!command) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Command not found"));
  }

  const now = new Date();

  if (action === "cancel") {
    if (ctx) {
      ctx.auditEvent = "chat.command_cancelled";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action: "cancel", action_type: command.action_type };
    }

    if (command.state !== "STAGED") {
      return jsonResponse(
        409,
        errorPayload("COMMAND_NOT_CANCELLABLE", "Command not cancellable", { state: command.state })
      );
    }

    const cancelled = await cancelStagedCommand({ commandId, agentId: ctx.agentId, now });
    if (!cancelled) {
      return jsonResponse(
        409,
        errorPayload("COMMAND_NOT_CANCELLABLE", "Command not cancellable", { state: command.state })
      );
    }

    return jsonResponse(200, {
      command_id: cancelled.command_id,
      state: cancelled.state,
      action_type: cancelled.action_type
    });
  }

  if (action === "undo") {
    if (ctx) {
      ctx.auditEvent = "chat.command_undone";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action: "undo", action_type: command.action_type };
    }

    if (command.state !== "EXECUTED") {
      return jsonResponse(
        409,
        errorPayload("COMMAND_NOT_UNDOABLE", "Command not undoable", { state: command.state })
      );
    }

    if (!command.undo_supported) {
      return jsonResponse(409, errorPayload("UNDO_NOT_SUPPORTED", "Undo not supported"));
    }

    if (command.undone_at) {
      return jsonResponse(409, errorPayload("UNDO_ALREADY_USED", "Undo already used"));
    }

    if (!command.undo_expires_at || !isIsoDate(command.undo_expires_at)) {
      return jsonResponse(409, errorPayload("UNDO_EXPIRED", "Undo expired"));
    }

    const undoExpiry = new Date(command.undo_expires_at);
    if (now.getTime() > undoExpiry.getTime()) {
      return jsonResponse(409, errorPayload("UNDO_EXPIRED", "Undo expired"));
    }

    const undoResult: any = await executeUndo({ command, commandId, ctx });
    if (undoResult.status >= 400) {
      return undoResult;
    }

    const updated = await markStagedCommandUndone({ commandId, agentId: ctx.agentId, now });
    if (!updated) {
      return jsonResponse(409, errorPayload("UNDO_ALREADY_USED", "Undo already used"));
    }

    return jsonResponse(200, {
      command_id: commandId,
      state: updated.state,
      undone_at: updated.undone_at,
      undo: buildUndoInfo(updated, { now }),
      result: undoResult.body || null
    });
  }

  // confirm
  if (command.state === "CANCELLED") {
    if (ctx) {
      ctx.auditEvent = "chat.command_confirmed";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action: "confirm", action_type: command.action_type };
      ctx.outcome = { type: "BLOCKED", reason: "cancelled" };
    }
    return jsonResponse(409, errorPayload("COMMAND_CANCELLED", "Command cancelled"));
  }

  if (command.state === "EXPIRED") {
    if (ctx) {
      ctx.auditEvent = "chat.command_confirmed";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action: "confirm", action_type: command.action_type };
      ctx.outcome = { type: "BLOCKED", reason: "expired" };
    }
    return jsonResponse(409, errorPayload("COMMAND_EXPIRED", "Command expired"));
  }

  if (command.state === "EXECUTED") {
    if (ctx) {
      ctx.auditEvent = "chat.command_executed";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action: "confirm", action_type: command.action_type };
    }

    return jsonResponse(200, {
      command_id: commandId,
      state: command.state,
      action_type: command.action_type,
      result_ref: command.result_ref_id ? { type: command.result_ref_type || null, id: command.result_ref_id } : null,
      approval_id: command.approval_id || null,
      undo: buildUndoInfo(command, { now })
    });
  }

  const expiresAt = command.expires_at;
  if (command.state === "STAGED" && (!expiresAt || !isIsoDate(expiresAt) || new Date(expiresAt).getTime() < now.getTime())) {
    await markStagedCommandExpired({ commandId, agentId: ctx.agentId, now });
    if (ctx) {
      ctx.auditEvent = "chat.command_confirmed";
      ctx.outcome = { type: "BLOCKED", reason: "expired" };
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action: "confirm", action_type: command.action_type };
    }
    return jsonResponse(409, errorPayload("COMMAND_EXPIRED", "Command expired"));
  }

  if (command.state === "STAGED") {
    await confirmStagedCommand({ commandId, agentId: ctx.agentId, now });
  }

  // If a previous confirm attempt created an approval, do not re-execute.
  if (command.state === "CONFIRMED" && command.approval_id) {
    if (ctx) {
      ctx.auditEvent = "chat.command_confirmed";
      ctx.outcome = { type: "BLOCKED", reason: "policy" };
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = {
        command_id: commandId,
        action: "confirm",
        action_type: command.action_type,
        approval_id: command.approval_id
      };
    }
    return jsonResponse(202, {
      command_id: commandId,
      state: "PENDING_APPROVAL",
      action_type: command.action_type,
      approval_id: command.approval_id
    });
  }

  const payloadEnvelope = command.payload_redacted || {};
  const actionType = command.action_type;
  const payload = payloadEnvelope.payload || {};

  const result: any = await executeAction({ actionType, payload, commandId, ctx });

  const approvalIdFromCtx = ctx?.policy?.approval_id || null;
  const approvalIdFromBody =
    result?.body?.approval_id ||
    result?.body?.data?.approval_id ||
    result?.body?.error?.details?.approval_id ||
    null;
  const approvalId = approvalIdFromBody || approvalIdFromCtx || null;

  if (result.status >= 400) {
    // Approval-required flows return 409 but also create an approval.
    if (approvalId && (result?.body?.error?.code === "APPROVAL_REQUIRED" || result.status === 409)) {
      await markStagedCommandPendingApproval({ commandId, agentId: ctx.agentId, approvalId, now });
      if (ctx) {
        ctx.auditEvent = "chat.command_confirmed";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action: "confirm", action_type: actionType, approval_id: approvalId };
      }
      return jsonResponse(202, {
        command_id: commandId,
        state: "PENDING_APPROVAL",
        action_type: actionType,
        approval_id: approvalId,
        message: "Pending approval"
      });
    }

    if (ctx) {
      ctx.auditEvent = "chat.command_executed";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action: "confirm", action_type: actionType };
    }
    return result;
  }

  let resultRefType: string | null = null;
  let resultRefId: string | null = null;
  if (actionType === "watchlist.create") {
    resultRefType = "watchlist";
    resultRefId = result?.body?.watchlist_id || null;
  } else if (actionType === "listing.create") {
    resultRefType = "listing";
    resultRefId = result?.body?.listing_id || null;
  } else if (actionType === "offer.create" || actionType === "offer.counter") {
    resultRefType = "offer";
    resultRefId = result?.body?.offer_id || null;
  } else if (actionType === "contact_reveal.request" || actionType === "transaction.mark_completed") {
    resultRefType = "transaction";
    resultRefId = result?.body?.tx_id || null;
  }

  let undoSupported = false;
  let undoActionType: string | null = null;
  if (
    resultRefId &&
    (actionType === "watchlist.create" ||
      actionType === "listing.create" ||
      actionType === "offer.create" ||
      actionType === "offer.counter")
  ) {
    undoSupported = true;
    undoActionType =
      actionType === "watchlist.create"
        ? "watchlist.deactivate"
        : actionType === "listing.create"
          ? "listing.removed"
          : "offer.cancel";
  }

  const undoExpiresAt = undoSupported ? new Date(now.getTime() + getUndoWindowSeconds() * 1000) : null;

  const executed = await markStagedCommandExecuted({
    commandId,
    agentId: ctx.agentId,
    approvalId,
    resultRefType,
    resultRefId,
    undoSupported,
    undoActionType,
    undoExpiresAt,
    now
  });

  if (!executed) {
    if (ctx) {
      ctx.auditEvent = "chat.command_executed";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action: "confirm", action_type: actionType };
    }
    return jsonResponse(result.status, result.body || {});
  }

  if (ctx) {
    ctx.auditEvent = "chat.command_executed";
    ctx.auditEntityType = "staged_command";
    ctx.auditEntityId = commandId;
    ctx.body = {
      command_id: commandId,
      action: "confirm",
      action_type: actionType,
      approval_id: approvalId,
      result_ref: resultRefId ? { type: resultRefType, id: resultRefId } : null,
      undo_supported: Boolean(undoSupported),
      undo_expires_at: undoExpiresAt ? undoExpiresAt.toISOString() : null
    };
  }

  return jsonResponse(200, {
    command_id: commandId,
    state: executed.state,
    action_type: actionType,
    approval_id: approvalId,
    result_ref: resultRefId ? { type: resultRefType, id: resultRefId } : null,
    undo: buildUndoInfo(executed, { now }),
    result: result.body || null,
    next_steps: undoSupported ? ["Undo available for a short time"] : []
  });
}

export default withApiMiddlewares(handler);

