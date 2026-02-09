import crypto from "node:crypto";

import { getSupabaseServiceClient } from "../db/supabase";
import { mapSupabaseError } from "./supabase-errors";
import { redactValue } from "../audit/redaction";

function mapError(error: any) {
  const mapped = mapSupabaseError(error);
  throw Object.assign(new Error(mapped.message), { status: mapped.status, code: mapped.code });
}

export type StagedCommandState = "STAGED" | "CONFIRMED" | "EXECUTED" | "CANCELLED" | "EXPIRED";

export async function createStagedCommand({
  ownerId,
  agentId,
  channelIdentityId,
  actionType,
  payload,
  expiresAt,
  now = new Date()
}: any) {
  if (!ownerId) {
    throw Object.assign(new Error("ownerId is required"), { status: 400, code: "VALIDATION_ERROR" });
  }
  if (!agentId) {
    throw Object.assign(new Error("agentId is required"), { status: 400, code: "VALIDATION_ERROR" });
  }
  if (!actionType) {
    throw Object.assign(new Error("actionType is required"), { status: 400, code: "VALIDATION_ERROR" });
  }
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw Object.assign(new Error("expiresAt is required"), { status: 400, code: "VALIDATION_ERROR" });
  }

  const client = getSupabaseServiceClient();
  const commandId = crypto.randomUUID();
  const redacted = redactValue(payload || {});
  const nowIso = now.toISOString();

  const row = {
    command_id: commandId,
    owner_id: ownerId,
    agent_id: agentId,
    channel_identity_id: channelIdentityId || null,
    action_type: actionType,
    payload_redacted: redacted.value,
    state: "STAGED" as StagedCommandState,
    expires_at: expiresAt.toISOString(),
    updated_at: nowIso
  };

  const { data, error } = await client.from("staged_commands").insert(row).select("*").single();
  if (error) mapError(error);
  return data;
}

export async function getStagedCommand(commandId: string) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client.from("staged_commands").select("*").eq("command_id", commandId).maybeSingle();
  if (error) mapError(error);
  return data || null;
}

export async function getStagedCommandForAgent({ commandId, agentId }: any) {
  const client = getSupabaseServiceClient();
  const { data, error } = await client
    .from("staged_commands")
    .select("*")
    .eq("command_id", commandId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) mapError(error);
  return data || null;
}

export async function markStagedCommandExpired({ commandId, agentId, now = new Date() }: any) {
  const client = getSupabaseServiceClient();
  const nowIso = now.toISOString();
  const { data, error } = await client
    .from("staged_commands")
    .update({
      state: "EXPIRED",
      expired_at: nowIso,
      updated_at: nowIso
    })
    .eq("command_id", commandId)
    .eq("agent_id", agentId)
    .in("state", ["STAGED", "CONFIRMED"])
    .select("*")
    .maybeSingle();
  if (error) mapError(error);
  return data || null;
}

export async function cancelStagedCommand({ commandId, agentId, now = new Date() }: any) {
  const client = getSupabaseServiceClient();
  const nowIso = now.toISOString();
  const { data, error } = await client
    .from("staged_commands")
    .update({
      state: "CANCELLED",
      cancelled_at: nowIso,
      updated_at: nowIso
    })
    .eq("command_id", commandId)
    .eq("agent_id", agentId)
    .eq("state", "STAGED")
    .select("*")
    .maybeSingle();
  if (error) mapError(error);
  return data || null;
}

export async function confirmStagedCommand({ commandId, agentId, now = new Date() }: any) {
  const client = getSupabaseServiceClient();
  const nowIso = now.toISOString();
  const { data, error } = await client
    .from("staged_commands")
    .update({
      state: "CONFIRMED",
      confirmed_at: nowIso,
      updated_at: nowIso
    })
    .eq("command_id", commandId)
    .eq("agent_id", agentId)
    .eq("state", "STAGED")
    .select("*")
    .maybeSingle();
  if (error) mapError(error);
  return data || null;
}

export async function markStagedCommandExecuted({
  commandId,
  agentId,
  approvalId,
  resultRefType,
  resultRefId,
  undoSupported,
  undoActionType,
  undoExpiresAt,
  now = new Date()
}: any) {
  const client = getSupabaseServiceClient();
  const nowIso = now.toISOString();
  const payload: any = {
    state: "EXECUTED",
    executed_at: nowIso,
    updated_at: nowIso,
    approval_id: approvalId || null,
    result_ref_type: resultRefType || null,
    result_ref_id: resultRefId || null,
    undo_supported: Boolean(undoSupported),
    undo_action_type: undoActionType || null,
    undo_expires_at: undoExpiresAt ? undoExpiresAt.toISOString() : null
  };

  const { data, error } = await client
    .from("staged_commands")
    .update(payload)
    .eq("command_id", commandId)
    .eq("agent_id", agentId)
    .in("state", ["STAGED", "CONFIRMED"])
    .select("*")
    .maybeSingle();

  if (error) mapError(error);
  return data || null;
}

export async function markStagedCommandPendingApproval({ commandId, agentId, approvalId, now = new Date() }: any) {
  const client = getSupabaseServiceClient();
  const nowIso = now.toISOString();
  const { data, error } = await client
    .from("staged_commands")
    .update({
      state: "CONFIRMED",
      approval_id: approvalId || null,
      updated_at: nowIso
    })
    .eq("command_id", commandId)
    .eq("agent_id", agentId)
    .in("state", ["STAGED", "CONFIRMED"])
    .select("*")
    .maybeSingle();
  if (error) mapError(error);
  return data || null;
}

export async function markStagedCommandUndone({ commandId, agentId, now = new Date() }: any) {
  const client = getSupabaseServiceClient();
  const nowIso = now.toISOString();
  const { data, error } = await client
    .from("staged_commands")
    .update({
      undone_at: nowIso,
      updated_at: nowIso
    })
    .eq("command_id", commandId)
    .eq("agent_id", agentId)
    .eq("state", "EXECUTED")
    .is("undone_at", null)
    .select("*")
    .maybeSingle();
  if (error) mapError(error);
  return data || null;
}

