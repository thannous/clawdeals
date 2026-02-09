import { isUuid } from "../../utils/validators";
import { listApprovals, getApprovalForOwner, resolveApproval } from "../../services/approvals";
import { getPolicyOrDefault } from "../../services/policies";
import { getOpsStatusSnapshot } from "../../services/ops-status";
import {
  findActiveIdentity,
  revokePairing,
  startPairing,
  touchLastSeen
} from "../../services/channel-identities";
import { createConfirmation, consumeConfirmation } from "../command-confirmations";
import type { ParsedCommand } from "./parser";

type ChannelCtx = {
  channelType: string;
  channelUserId: string;
  channelContextId: string;
  displayName: string | null;
};

const TELEGRAM_MAX_LEN = 3500;

function formatDate(value: string | null | undefined): string {
  if (!value) return "\u2014";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function truncate(text: string, maxLen = TELEGRAM_MAX_LEN) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 20)}\n...(truncated)`;
}

function roleRank(role: string) {
  if (role === "owner") return 3;
  if (role === "approver") return 2;
  return 1;
}

function requiresRole(role: string, required: string) {
  return roleRank(role) >= roleRank(required);
}

export function buildHelpText() {
  return [
    "Commands:",
    "- help",
    "- status",
    "- approvals | approvals list",
    "- approve <approval_id> (then: approve <approval_id> confirm)",
    "- deny <approval_id> [reason] (then: deny <approval_id> confirm)",
    "- policies show",
    "- deploy status",
    "- pair",
    "- unpair <channel_identity_id> (then: unpair <channel_identity_id> confirm)",
    "",
    "Security:",
    "- Sensitive actions require confirm.",
    "- Unknown users must run `pair` first."
  ].join("\n");
}

function notAllowlistedText() {
  return [
    "Blocked: not allowlisted.",
    "",
    "Send `pair` to start pairing, then approve it in the console (/console/channels)."
  ].join("\n");
}

export async function executeChannelCommand({
  ownerId,
  channel,
  command,
  ctx
}: {
  ownerId: string;
  channel: ChannelCtx;
  command: ParsedCommand;
  ctx: any;
}): Promise<{ text: string; blocked?: boolean; identity?: any }> {
  if (command.kind === "help" || command.kind === "unknown") {
    return { text: buildHelpText() };
  }

  if (command.kind === "pair") {
    const result: any = await startPairing({
      ownerId,
      channelType: channel.channelType,
      channelUserId: channel.channelUserId,
      channelContextId: channel.channelContextId,
      displayName: channel.displayName
    });

    if (result.alreadyActive) {
      const role = result.identity?.role || "viewer";
      return { text: `Already paired. role=${role} state=ACTIVE`, identity: result.identity };
    }

    const expires = result.expiresAt ? formatDate(result.expiresAt.toISOString()) : "\u2014";
    return {
      text: truncate(
        [
          "Pairing started.",
          `Code: ${result.code}`,
          `Expires: ${expires}`,
          "",
          "Open the console and approve the pairing request: /console/channels"
        ].join("\n")
      ),
      identity: result.identity
    };
  }

  const identity: any = await findActiveIdentity({
    ownerId,
    channelType: channel.channelType,
    channelUserId: channel.channelUserId,
    channelContextId: channel.channelContextId
  });

  if (!identity) {
    return { text: notAllowlistedText(), blocked: true };
  }

  if (ctx) {
    ctx.ownerId = identity.owner_id;
    ctx.actor = { type: "owner", id: identity.owner_id };
    ctx.security = {
      ...(ctx.security || {}),
      channel_identity_id: identity.channel_identity_id,
      role: identity.role
    };
  }

  await touchLastSeen({ ownerId, channelIdentityId: identity.channel_identity_id });

  const role = identity.role || "viewer";

  if (command.kind === "status") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }
    const snapshot = getOpsStatusSnapshot();
    const approvals = await listApprovals({ ownerId: identity.owner_id, state: "PENDING", limit: 5 });
    const lines = approvals.approvals?.map((ap: any) => `- ${ap.approval_id} ${ap.action_type}`).slice(0, 5) || [];

    return {
      text: truncate(
        [
          "CLAWDEALS status",
          `env: ${snapshot.env || "\u2014"}`,
          `commit: ${snapshot.commit_sha || "\u2014"}`,
          "",
          `pending approvals: ${approvals.approvals?.length || 0}`,
          ...lines
        ].join("\n")
      ),
      identity
    };
  }

  if (command.kind === "deploy_status") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }
    const snapshot = getOpsStatusSnapshot();
    return {
      text: truncate(
        [
          "Deploy status",
          `env: ${snapshot.env || "\u2014"}`,
          `commit: ${snapshot.commit_sha || "\u2014"}`,
          `now: ${snapshot.now || "\u2014"}`
        ].join("\n")
      ),
      identity
    };
  }

  if (command.kind === "approvals_list") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }
    const result = await listApprovals({ ownerId: identity.owner_id, state: "PENDING", limit: 10 });
    const approvals = result.approvals || [];
    if (approvals.length === 0) {
      return { text: "No pending approvals.", identity };
    }
    const lines = approvals.map((ap: any) => `- ${ap.approval_id} ${ap.action_type} ${ap.action_ref_id}`);
    return { text: truncate(["Pending approvals:", ...lines].join("\n")), identity };
  }

  if (command.kind === "policies_show") {
    if (!requiresRole(role, "owner")) {
      return { text: "Forbidden: owner role required.", identity };
    }
    const policy = await getPolicyOrDefault(identity.owner_id);
    const payload = JSON.stringify(policy.policy_json || {}, null, 2);
    return { text: truncate(["Current policy:", payload].join("\n")), identity };
  }

  if (command.kind === "unpair") {
    if (!requiresRole(role, "owner")) {
      return { text: "Forbidden: owner role required.", identity };
    }
    const targetId = command.channelIdentityId;
    if (!isUuid(targetId)) return { text: "Invalid channel_identity_id", identity };

    if (!command.confirm) {
      await createConfirmation({
        channelIdentityId: identity.channel_identity_id,
        action: "unpair",
        targetId,
        payload: { targetId }
      });
      return {
        text: truncate(
          [
            "Unpair requested.",
            `Target: ${targetId}`,
            "",
            `Confirm with: unpair ${targetId} confirm`
          ].join("\n")
        ),
        identity
      };
    }

    const pending = await consumeConfirmation({
      channelIdentityId: identity.channel_identity_id,
      action: "unpair",
      targetId
    });
    if (!pending) {
      return { text: `No pending confirmation. Run: unpair ${targetId}`, identity };
    }

    await revokePairing({
      ownerId,
      channelIdentityId: targetId,
      revokedBy: identity.owner_id
    });

    return { text: `Unpaired: ${targetId}`, identity };
  }

  if (command.kind === "approve") {
    if (!requiresRole(role, "approver")) {
      return { text: "Forbidden: approver role required.", identity };
    }
    const approvalId = command.approvalId;
    if (!isUuid(approvalId)) return { text: "Invalid approval_id", identity };

    if (!command.confirm) {
      const approval = await getApprovalForOwner(approvalId, identity.owner_id);
      if (!approval) return { text: "Approval not found", identity };
      if (approval.state !== "PENDING") {
        return { text: `Approval state=${approval.state}`, identity };
      }

      await createConfirmation({
        channelIdentityId: identity.channel_identity_id,
        action: "approve",
        targetId: approvalId,
        payload: { approvalId }
      });

      return {
        text: truncate(
          [
            "Approve requested.",
            `approval_id: ${approvalId}`,
            `action: ${approval.action_type}`,
            "",
            `Confirm with: approve ${approvalId} confirm`
          ].join("\n")
        ),
        identity
      };
    }

    const pending = await consumeConfirmation({
      channelIdentityId: identity.channel_identity_id,
      action: "approve",
      targetId: approvalId
    });
    if (!pending) {
      return { text: `No pending confirmation. Run: approve ${approvalId}`, identity };
    }

    const existing = await getApprovalForOwner(approvalId, identity.owner_id);
    if (!existing) return { text: "Approval not found", identity };
    if (existing.state !== "PENDING") return { text: `Approval state=${existing.state}`, identity };

    const resolved = await resolveApproval({
      approvalId,
      ownerId: identity.owner_id,
      decision: "APPROVED",
      resolvedBy: identity.owner_id
    });

    return { text: `Approved: ${resolved.approval_id}`, identity };
  }

  if (command.kind === "deny") {
    if (!requiresRole(role, "approver")) {
      return { text: "Forbidden: approver role required.", identity };
    }

    const approvalId = command.approvalId;
    if (!isUuid(approvalId)) return { text: "Invalid approval_id", identity };

    if (!command.confirm) {
      const approval = await getApprovalForOwner(approvalId, identity.owner_id);
      if (!approval) return { text: "Approval not found", identity };
      if (approval.state !== "PENDING") {
        return { text: `Approval state=${approval.state}`, identity };
      }

      await createConfirmation({
        channelIdentityId: identity.channel_identity_id,
        action: "deny",
        targetId: approvalId,
        payload: { approvalId, reason: command.reason || null }
      });

      const reasonLine = command.reason ? `reason: ${command.reason}` : null;
      return {
        text: truncate(
          [
            "Deny requested.",
            `approval_id: ${approvalId}`,
            `action: ${approval.action_type}`,
            reasonLine,
            "",
            `Confirm with: deny ${approvalId} confirm`
          ].filter(Boolean).join("\n")
        ),
        identity
      };
    }

    const pending: any = await consumeConfirmation({
      channelIdentityId: identity.channel_identity_id,
      action: "deny",
      targetId: approvalId
    });
    if (!pending) {
      return { text: `No pending confirmation. Run: deny ${approvalId}`, identity };
    }

    const existing = await getApprovalForOwner(approvalId, identity.owner_id);
    if (!existing) return { text: "Approval not found", identity };
    if (existing.state !== "PENDING") return { text: `Approval state=${existing.state}`, identity };

    const resolved = await resolveApproval({
      approvalId,
      ownerId: identity.owner_id,
      decision: "DENIED",
      resolvedBy: identity.owner_id
    });

    const reason = pending.reason || command.reason || null;
    return { text: truncate(`Denied: ${resolved.approval_id}${reason ? `\nreason: ${reason}` : ""}`), identity };
  }

  return { text: buildHelpText(), identity };
}
