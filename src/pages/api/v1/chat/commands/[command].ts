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
import {
  hasExplicitOriginContext,
  ORIGIN_CONTEXT_KIND,
  resolveOriginContext
} from "../../../../../server/policy/authority";

import { handler as watchlistIndexHandler } from "../../watchlists/index";
import { handler as watchlistIdHandler } from "../../watchlists/[watchlist_id]";
import { handler as listingIndexHandler } from "../../listings";
import { handler as listingIdHandler } from "../../listings/[id]";
import { handler as offerCreateHandler } from "../../listings/[id]/offers";
import { handler as offerCounterHandler } from "../../offers/[offer_id]/counter";
import { handler as offerCancelHandler } from "../../offers/[offer_id]/cancel";
import { handler as requestContactRevealHandler } from "../../transactions/[tx_id]/request-contact-reveal";
import { handler as markCompletedHandler } from "../../transactions/[tx_id]/mark-completed";

function getHeaderValue(req: any, name: string) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value;
}

function resolveParam(value: any) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseCommandAction(raw: any) {
  const value = resolveParam(raw);
  if (!value) return { ok: false as const, error: "command is required" };

  const asString = String(value);
  const idx = asString.lastIndexOf(":");
  if (idx <= 0 || idx === asString.length - 1) {
    return { ok: false as const, error: "Invalid command action" };
  }

  const commandId = asString.slice(0, idx);
  const action = asString.slice(idx + 1);
  if (!isUuid(commandId)) {
    return { ok: false as const, error: "command_id must be a UUID" };
  }

  return { ok: true as const, value: { commandId, action } };
}

function parseTimestamp(value: any) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function looksLikeCommandRow(value: any) {
  return value && typeof value === "object" && typeof value.command_id === "string" && value.command_id;
}

function extractPayload(command: any) {
  const pr = command?.payload_redacted;
  if (!pr || typeof pr !== "object") return command?.payload || {};

  // Common shapes:
  // 1) { payload: { ... } } (tests)
  // 2) { action_type, payload: { ... } } (stage service input)
  if (pr.payload && typeof pr.payload === "object") {
    if ((pr.payload as any).payload && typeof (pr.payload as any).payload === "object") {
      return (pr.payload as any).payload;
    }
    return pr.payload;
  }

  return pr;
}

function extractCommandMeta(command: any) {
  const pr = command?.payload_redacted && typeof command.payload_redacted === "object" ? command.payload_redacted : {};
  const originContextRaw = pr.origin_context ?? pr?.payload?.origin_context ?? null;
  const authorityRaw = pr.authority && typeof pr.authority === "object" ? pr.authority : null;

  return {
    originContext: resolveOriginContext({ originContext: originContextRaw }),
    authority:
      authorityRaw && typeof authorityRaw === "object"
        ? {
            decision: typeof authorityRaw.decision === "string" ? authorityRaw.decision : null,
            reason: typeof authorityRaw.reason === "string" ? authorityRaw.reason : null,
            requiresControlDmConfirm: Boolean(authorityRaw.requires_control_dm_confirm)
          }
        : null
  };
}

function computeUndoExpiresAt(command: any, { now = new Date() }: any = {}) {
  const explicit = parseTimestamp(command?.undo_expires_at);
  if (explicit) return explicit;
  const executedAt = parseTimestamp(command?.executed_at);
  if (!executedAt) return null;
  const windowSeconds = getUndoWindowSeconds();
  return new Date(executedAt.getTime() + windowSeconds * 1000);
}

function mapCommand(row: any, { now = new Date() }: any = {}) {
  if (!row) return null;

  const undoExpiresAt = computeUndoExpiresAt(row, { now });
  const undoSupported = Boolean(row.undo_supported);

  let undoState: string | null = null;
  if (undoSupported) {
    if (row.undone_at) undoState = "UNDONE";
    else if (undoExpiresAt && now.getTime() > undoExpiresAt.getTime()) undoState = "EXPIRED";
    else undoState = "AVAILABLE";
  }

  // API view-state: CONFIRMED + approval_id means the action was attempted and is waiting on ops approval.
  const state =
    row.state === "CONFIRMED" && row.approval_id && !row.result_ref_id ? "PENDING_APPROVAL" : row.state;

  return {
    command_id: row.command_id,
    state,
    action_type: row.action_type,
    expires_at: row.expires_at,
    approval_id: row.approval_id || null,
    result_ref:
      row.result_ref_type && row.result_ref_id ? { type: row.result_ref_type, id: row.result_ref_id } : null,
    undo: {
      supported: undoSupported,
      action_type: undoSupported ? row.undo_action_type || null : null,
      expires_at: undoSupported ? (undoExpiresAt ? undoExpiresAt.toISOString() : null) : null,
      state: undoSupported ? undoState : "UNSUPPORTED"
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    confirmed_at: row.confirmed_at,
    executed_at: row.executed_at,
    cancelled_at: row.cancelled_at,
    expired_at: row.expired_at,
    undone_at: row.undone_at
  };
}

function isApprovalRequiredResponse(result: any) {
  const code = result?.body?.error?.code;
  return result?.status === 409 && code === "APPROVAL_REQUIRED";
}

function approvalIdFromError(result: any): string | null {
  const raw = result?.body?.error?.details?.approval_id;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim();
}

function buildExecReq({
  method = "POST",
  headers,
  query,
  body
}: {
  method?: string;
  headers: Record<string, any>;
  query?: Record<string, any>;
  body?: any;
}) {
  return { method, headers, query: query || {}, body: body || {} };
}

async function maybeExpire(command: any, { commandId, agentId, now }: any) {
  const expiresAt = parseTimestamp(command?.expires_at);
  if (!expiresAt) return { ok: true as const, command };
  if (now.getTime() <= expiresAt.getTime()) return { ok: true as const, command };

  if (command?.state === "STAGED" || command?.state === "CONFIRMED") {
    const expired = await markStagedCommandExpired({ commandId, agentId, now });
    if (expired) {
      return { ok: false as const, command: expired };
    }
  }

  return { ok: false as const, command };
}

async function executeAction({ command, commandId, ctx }: any) {
  const payload = extractPayload(command);
  const headers = { "idempotency-key": commandId };

  if (command.action_type === "watchlist.create") {
    const req = buildExecReq({ headers, body: payload });
    return await watchlistIndexHandler(req as any, null as any, { ...ctx });
  }

  if (command.action_type === "listing.create") {
    const req = buildExecReq({ headers, body: payload });
    return await listingIndexHandler(req as any, null as any, { ...ctx });
  }

  if (command.action_type === "offer.create") {
    const listingId = typeof payload?.listing_id === "string" ? payload.listing_id : "";
    const req = buildExecReq({
      headers,
      query: { id: listingId },
      body: {
        thread_id: payload?.thread_id ?? null,
        amount: payload?.amount,
        currency: payload?.currency,
        expires_at: payload?.expires_at
      }
    });
    return await offerCreateHandler(req as any, null as any, { ...ctx });
  }

  if (command.action_type === "offer.counter") {
    const offerId = typeof payload?.offer_id === "string" ? payload.offer_id : "";
    const req = buildExecReq({
      headers,
      query: { offer_id: offerId },
      body: { amount: payload?.amount, currency: payload?.currency, expires_at: payload?.expires_at }
    });
    return await offerCounterHandler(req as any, null as any, { ...ctx });
  }

  if (command.action_type === "contact_reveal.request") {
    const txId = typeof payload?.tx_id === "string" ? payload.tx_id : "";
    const req = buildExecReq({ headers, query: { tx_id: txId }, body: {} });
    return await requestContactRevealHandler(req as any, null as any, { ...ctx });
  }

  if (command.action_type === "transaction.mark_completed") {
    const txId = typeof payload?.tx_id === "string" ? payload.tx_id : "";
    const req = buildExecReq({ headers, query: { tx_id: txId }, body: {} });
    return await markCompletedHandler(req as any, null as any, { ...ctx });
  }

  return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Unsupported action_type"));
}

async function executeUndo({ command, commandId, ctx }: any) {
  const headers = { "idempotency-key": commandId };
  const actionType = typeof command?.undo_action_type === "string" ? command.undo_action_type : null;

  if (actionType === "offer.cancel") {
    const offerId = typeof command?.result_ref_id === "string" ? command.result_ref_id : "";
    const req = buildExecReq({ headers, query: { offer_id: offerId }, body: {} });
    return await offerCancelHandler(req as any, null as any, { ...ctx });
  }

  return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Unsupported undo action"));
}

export async function handler(req: any, _res: any, ctx: any) {
  if (req.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  if (ctx?.authError) {
    return jsonResponse(ctx.authError.status || 401, errorPayload(ctx.authError.code, ctx.authError.message));
  }

  if (!ctx?.agentId) {
    return jsonResponse(401, errorPayload("UNAUTHORIZED", "Agent authentication required"));
  }

  const parsed = parseCommandAction(req.query?.command);
  if (!parsed.ok) {
    return jsonResponse(400, errorPayload("VALIDATION_ERROR", parsed.error));
  }

  const { commandId, action } = parsed.value;
  if (!["confirm", "cancel", "undo"].includes(action)) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown command action"));
  }

  const now = new Date();
  let command: any;
  try {
    command = await getStagedCommandForAgent({ commandId, agentId: ctx.agentId });
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }

  if (!command) {
    return jsonResponse(404, errorPayload("NOT_FOUND", "Command not found"));
  }

  // Opportunistically expire if the staging window passed.
  try {
    const expireResult: any = await maybeExpire(command, { commandId, agentId: ctx.agentId, now });
    if (!expireResult.ok) {
      command = expireResult.command;
      if (ctx) {
        ctx.auditEvent = "chat.command_expired";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action };
        ctx.outcome = { type: "BLOCKED", reason: "expired" };
      }
      return jsonResponse(409, errorPayload("COMMAND_EXPIRED", "Command expired", { command_id: commandId }));
    }
    command = expireResult.command;
  } catch (error: any) {
    return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
  }

  if (action === "confirm") {
    if (!hasExplicitOriginContext(req.body?.origin_context)) {
      return jsonResponse(400, errorPayload("ORIGIN_CONTEXT_REQUIRED", "origin_context is required"));
    }

    const commandMeta = extractCommandMeta(command);
    const requestOriginContext = resolveOriginContext({
      originContext: req.body?.origin_context
    });

    if (ctx) {
      ctx.body = {
        command_id: commandId,
        action,
        origin_context: requestOriginContext
      };
    }

    if (
      (command.state === "STAGED" || command.state === "CONFIRMED") &&
      commandMeta.authority?.requiresControlDmConfirm &&
      requestOriginContext.kind !== ORIGIN_CONTEXT_KIND.CONTROL_DM
    ) {
      if (ctx) {
        ctx.auditEvent = "chat.command_confirmed";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = {
          command_id: commandId,
          action,
          origin_context: requestOriginContext,
          staged_origin_context: commandMeta.originContext
        };
        ctx.outcome = { type: "BLOCKED", reason: "control_dm_confirm_required" };
      }

      return jsonResponse(
        409,
        errorPayload("CONTROL_DM_CONFIRM_REQUIRED", "Confirm this action from Control DM", {
          command_id: commandId,
          required_origin_context: ORIGIN_CONTEXT_KIND.CONTROL_DM,
          origin_context: requestOriginContext,
          staged_origin_context: commandMeta.originContext
        })
      );
    }

    const idempotencyKey = getHeaderValue(req, "idempotency-key");
    if (!idempotencyKey) {
      return jsonResponse(400, errorPayload("VALIDATION_ERROR", "Idempotency-Key is required"));
    }
    if (String(idempotencyKey) !== commandId) {
      return jsonResponse(
        400,
        errorPayload("VALIDATION_ERROR", "Idempotency-Key must equal command_id", { command_id: commandId })
      );
    }

    if (command.state === "CANCELLED") {
      if (ctx) {
        ctx.auditEvent = "chat.command_confirmed";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action };
        ctx.outcome = { type: "BLOCKED", reason: "cancelled" };
      }
      return jsonResponse(409, errorPayload("COMMAND_CANCELLED", "Command was cancelled", { command_id: commandId }));
    }

    if (command.state === "EXECUTED") {
      return jsonResponse(200, mapCommand(command, { now }));
    }

    if (command.state !== "STAGED" && command.state !== "CONFIRMED") {
      return jsonResponse(
        409,
        errorPayload("COMMAND_NOT_CONFIRMABLE", "Command cannot be confirmed in current state", {
          command_id: commandId,
          state: command.state
        })
      );
    }

    // Ensure the STAGED -> CONFIRMED transition actually happened before executing side effects.
    // If the update no-ops (race with cancel/expire), re-fetch and abort rather than executing.
    try {
      if (command.state === "STAGED") {
        const confirmed = await confirmStagedCommand({ commandId, agentId: ctx.agentId, now });
        if (looksLikeCommandRow(confirmed)) {
          command = confirmed;
        } else {
          const latest = await getStagedCommandForAgent({ commandId, agentId: ctx.agentId });
          if (!latest) {
            return jsonResponse(404, errorPayload("NOT_FOUND", "Command not found"));
          }
          command = latest;

          if (command.state === "CANCELLED") {
            if (ctx) {
              ctx.auditEvent = "chat.command_confirmed";
              ctx.auditEntityType = "staged_command";
              ctx.auditEntityId = commandId;
              ctx.body = { command_id: commandId, action };
              ctx.outcome = { type: "BLOCKED", reason: "cancelled" };
            }
            return jsonResponse(
              409,
              errorPayload("COMMAND_CANCELLED", "Command was cancelled", { command_id: commandId })
            );
          }

          if (command.state === "EXPIRED") {
            if (ctx) {
              ctx.auditEvent = "chat.command_expired";
              ctx.auditEntityType = "staged_command";
              ctx.auditEntityId = commandId;
              ctx.body = { command_id: commandId, action };
              ctx.outcome = { type: "BLOCKED", reason: "expired" };
            }
            return jsonResponse(
              409,
              errorPayload("COMMAND_EXPIRED", "Command expired", { command_id: commandId })
            );
          }

          if (command.state === "EXECUTED") {
            return jsonResponse(200, mapCommand(command, { now }));
          }

          if (command.state !== "CONFIRMED") {
            return jsonResponse(
              409,
              errorPayload("COMMAND_NOT_CONFIRMABLE", "Command cannot be confirmed in current state", {
                command_id: commandId,
                state: command.state
              })
            );
          }
        }
      }
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }

    const execCtx = { ...ctx };
    const execResult: any = await executeAction({ command, commandId, ctx: execCtx });

    if (isApprovalRequiredResponse(execResult)) {
      const approvalId = approvalIdFromError(execResult);
      if (approvalId) {
        try {
          await markStagedCommandPendingApproval({ commandId, agentId: ctx.agentId, approvalId, now });
        } catch (error: any) {
          return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
        }
      }

      if (ctx) {
        ctx.auditEvent = "chat.command_confirmed";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action, state: "PENDING_APPROVAL", approval_id: approvalId };
        ctx.outcome = { type: "STAGED", reason: "approval_required" };
      }

      return jsonResponse(
        202,
        mapCommand(
          {
            ...command,
            state: "CONFIRMED",
            approval_id: approvalId || null
          },
          { now }
        )
      );
    }

    if (typeof execResult?.status === "number" && execResult.status >= 200 && execResult.status < 300) {
      // If the action succeeded, persist result refs + undo metadata.
      let resultRefType: string | null = null;
      let resultRefId: string | null = null;
      let undoSupported = false;
      let undoActionType: string | null = null;
      let undoExpiresAt: Date | null = null;

      if (command.action_type === "offer.create") {
        resultRefType = "offer";
        resultRefId = typeof execResult?.body?.offer_id === "string" ? execResult.body.offer_id : null;
        undoSupported = true;
        undoActionType = "offer.cancel";
        undoExpiresAt = new Date(now.getTime() + getUndoWindowSeconds() * 1000);
      }

      try {
        const executed = await markStagedCommandExecuted({
          commandId,
          agentId: ctx.agentId,
          resultRefType,
          resultRefId,
          undoSupported,
          undoActionType,
          undoExpiresAt,
          now
        });
        if (looksLikeCommandRow(executed)) command = executed;
      } catch (error: any) {
        return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
      }

      if (ctx) {
        ctx.auditEvent = "chat.command_executed";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action, state: "EXECUTED", result_ref_id: resultRefId };
        ctx.outcome = { type: "EXECUTED", reason: "executed" };
      }

      return jsonResponse(200, mapCommand(command, { now }));
    }

    // Fall back to the action handler's response (preserve status + payload).
    if (ctx) {
      ctx.auditEvent = "chat.command_confirmed";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action, state: command.state };
    }
    return jsonResponse(execResult?.status || 500, execResult?.body || errorPayload("ERROR", "Action failed"));
  }

  if (action === "cancel") {
    if (command.state === "CANCELLED") {
      if (ctx) {
        ctx.auditEvent = "chat.command_cancelled";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action, state: command.state };
      }
      return jsonResponse(200, mapCommand(command, { now }));
    }

    if (command.state !== "STAGED") {
      return jsonResponse(
        409,
        errorPayload("COMMAND_NOT_CANCELLABLE", "Command cannot be cancelled in current state", {
          command_id: commandId,
          state: command.state
        })
      );
    }

    try {
      const cancelled = await cancelStagedCommand({ commandId, agentId: ctx.agentId, now });
      if (looksLikeCommandRow(cancelled)) command = cancelled;
    } catch (error: any) {
      return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
    }

    if (ctx) {
      ctx.auditEvent = "chat.command_cancelled";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action, state: command.state };
    }

    return jsonResponse(200, mapCommand(command, { now }));
  }

  if (action === "undo") {
    if (command.state !== "EXECUTED") {
      return jsonResponse(
        409,
        errorPayload("COMMAND_NOT_EXECUTED", "Command cannot be undone in current state", {
          command_id: commandId,
          state: command.state
        })
      );
    }

    if (command.undone_at) {
      if (ctx) {
        ctx.auditEvent = "chat.command_undone";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action, state: command.state };
      }
      return jsonResponse(200, mapCommand(command, { now }));
    }

    if (!command.undo_supported) {
      return jsonResponse(409, errorPayload("UNDO_NOT_SUPPORTED", "Undo is not supported for this command", { command_id: commandId }));
    }

    const undoExpiresAt = computeUndoExpiresAt(command, { now });
    if (!undoExpiresAt) {
      return jsonResponse(409, errorPayload("UNDO_NOT_AVAILABLE", "Undo window is unavailable", { command_id: commandId }));
    }

    if (now.getTime() > undoExpiresAt.getTime()) {
      if (ctx) {
        ctx.auditEvent = "chat.command_undone";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action, state: command.state };
        ctx.outcome = { type: "BLOCKED", reason: "undo_expired" };
      }
      return jsonResponse(
        409,
        errorPayload("UNDO_EXPIRED", "Undo window expired", { command_id: commandId, undo_expires_at: undoExpiresAt.toISOString() })
      );
    }

    const undoCtx = { ...ctx };
    const undoResult: any = await executeUndo({ command, commandId, ctx: undoCtx });

    if (typeof undoResult?.status === "number" && undoResult.status >= 200 && undoResult.status < 300) {
      try {
        const undone = await markStagedCommandUndone({ commandId, agentId: ctx.agentId, now });
        if (looksLikeCommandRow(undone)) command = undone;
      } catch (error: any) {
        return jsonResponse(error.status || 500, errorPayload(error.code || "ERROR", error.message));
      }

      if (ctx) {
        ctx.auditEvent = "chat.command_undone";
        ctx.auditEntityType = "staged_command";
        ctx.auditEntityId = commandId;
        ctx.body = { command_id: commandId, action, state: command.state };
      }

      return jsonResponse(200, mapCommand(command, { now }));
    }

    if (ctx) {
      ctx.auditEvent = "chat.command_undone";
      ctx.auditEntityType = "staged_command";
      ctx.auditEntityId = commandId;
      ctx.body = { command_id: commandId, action, state: command.state };
    }

    return jsonResponse(undoResult?.status || 500, undoResult?.body || errorPayload("ERROR", "Undo failed"));
  }

  return jsonResponse(404, errorPayload("NOT_FOUND", "Unknown command action"));
}

export default withApiMiddlewares(handler, { routeGroup: "chat.commands.action" });
