import { isUuid } from "../../utils/validators";
import { listApprovals, getApprovalForOwner, resolveApproval } from "../../services/approvals";
import { getPolicyOrDefault } from "../../services/policies";
import { getOpsStatusSnapshot } from "../../services/ops-status";
import {
  findActiveIdentityByChannel,
  findPendingIdentityByChannel,
  revokePairing,
  touchLastSeen
} from "../../services/channel-identities";
import { createPairToken, consumePairToken } from "../../services/pairing-tokens";
import { pairChannelIdentityForOwner } from "../../services/channel-pairing";
import { getPublicAppUrl, joinUrl } from "../../../shared/urls";
import { rateLimitMiddleware } from "../../rate-limit/middleware";
import {
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
  NOTIFICATION_EVENT_TYPES
} from "../../services/notification-preferences";
import { buildNotificationsKeyboard } from "../telegram/keyboard";
import { createConfirmation, consumeConfirmation } from "../command-confirmations";
import type { ParsedCommand } from "./parser";

type ChannelCtx = {
  channelType: string;
  channelUserId: string;
  channelContextId: string;
  displayName: string | null;
};

type ExecuteResult = {
  text: string;
  blocked?: boolean;
  identity?: any;
  replyMarkup?: any;
  telemetry?: { event: string; payload: any; outcome?: string };
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
    "- connect (alias: pair)",
    "- unpair <channel_identity_id> (then: unpair <channel_identity_id> confirm)",
    "",
    "Pairing:",
    "- Web -> Telegram: click Connect Telegram in the console, then press Start.",
    "- Telegram -> Web: send `connect` to get a web link.",
    "",
    "Security:",
    "- Sensitive actions require confirm.",
    "- Write commands require pairing (CHANNEL_NOT_PAIRED)."
  ].join("\n");
}

function notPairedText() {
  return [
    "CHANNEL_NOT_PAIRED",
    "Blocked: this Telegram account is not paired.",
    "",
    "Send `connect` (alias: `pair`) to get a web link, then confirm pairing.",
    "If you started from the web console, click Connect Telegram again and press Start."
  ].join("\n");
}

function pendingApprovalText() {
  return [
    "CHANNEL_NOT_PAIRED",
    "Blocked: pairing is pending approval.",
    "",
    "Approve the request in the console: /console/approvals"
  ].join("\n");
}

function buildConnectReplyMarkup(pairUrl: string) {
  return {
    inline_keyboard: [[{ text: "Associer mon compte", url: pairUrl }]]
  };
}

function parseTimeHHMM(value: string) {
  const m = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number.parseInt(m[1], 10);
  const mm = Number.parseInt(m[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function formatQuietHours(prefs: any) {
  if (!prefs?.quiet_enabled) return "OFF";
  const s = Number.isInteger(prefs.quiet_start_min) ? prefs.quiet_start_min : null;
  const e = Number.isInteger(prefs.quiet_end_min) ? prefs.quiet_end_min : null;
  if (s == null || e == null) return "ON";
  const sh = String(Math.floor(s / 60)).padStart(2, "0");
  const sm = String(s % 60).padStart(2, "0");
  const eh = String(Math.floor(e / 60)).padStart(2, "0");
  const em = String(e % 60).padStart(2, "0");
  return `ON (${sh}:${sm}-${eh}:${em})`;
}

function formatStrongFilters(prefs: any) {
  const strong = prefs?.filters && typeof prefs.filters === "object" ? prefs.filters.strong : null;
  const maxPrice = strong && typeof strong === "object" ? strong.max_price_eur : null;
  const minTrust = strong && typeof strong === "object" ? strong.min_seller_trust_score : null;
  const parts = [];
  if (typeof maxPrice === "number" && Number.isFinite(maxPrice)) parts.push(`price<=${maxPrice}EUR`);
  if (Number.isInteger(minTrust)) parts.push(`trust>=${minTrust}`);
  return parts.length ? parts.join(" OR ") : "OFF";
}

function buildNotificationsText(prefs: any) {
  const mode = typeof prefs?.mode === "string" ? prefs.mode : "DIGEST_HOURLY";
  const tz = typeof prefs?.timezone === "string" ? prefs.timezone : "UTC";
  const eventTypes = Array.isArray(prefs?.event_types) ? prefs.event_types : ["watchlist_match"];
  const types = eventTypes.length ? eventTypes.join(", ") : "\u2014";

  return [
    "Notifications settings",
    `- mode: ${mode}`,
    `- timezone: ${tz}`,
    `- quiet hours: ${formatQuietHours(prefs)}`,
    `- types: ${types}`,
    `- strong: ${formatStrongFilters(prefs)}`,
    "",
    "Commands:",
    "- notif (show menu)",
    "- notif mode realtime|digest_hourly|digest_daily|silent",
    "- notif quiet off | notif quiet 22:00 08:00",
    "- notif tz <IANA timezone>",
    `- notif types toggle <${NOTIFICATION_EVENT_TYPES.join("|")}>`,
    "- notif strong price <EUR|off>",
    "- notif strong trust <0..100|off>"
  ].join("\n");
}

function formatTokenError(err: any) {
  const code = err?.code || "ERROR";
  if (code === "PAIR_TOKEN_EXPIRED") {
    return [
      "PAIR_TOKEN_EXPIRED",
      "This pairing token has expired.",
      "",
      "Restart pairing from the web console (Connect Telegram) or send `connect` to get a new link."
    ].join("\n");
  }
  if (code === "PAIR_TOKEN_USED") {
    return [
      "PAIR_TOKEN_USED",
      "This pairing token was already used.",
      "",
      "Restart pairing from the web console (Connect Telegram) or send `connect` to get a new link."
    ].join("\n");
  }
  if (code === "PAIR_TOKEN_INVALID") {
    return [
      "PAIR_TOKEN_INVALID",
      "Invalid pairing token.",
      "",
      "Restart pairing from the web console (Connect Telegram) or send `connect` to get a new link."
    ].join("\n");
  }
  if (code === "CHANNEL_ALREADY_PAIRED") {
    return [
      "CHANNEL_ALREADY_PAIRED",
      "This Telegram account is already paired to another owner.",
      "",
      "If you need to transfer ownership, revoke the existing pairing first."
    ].join("\n");
  }
  return `Error: ${err?.message || "Unexpected error"}`;
}

export async function executeChannelCommand({
  channel,
  command,
  ctx
}: {
  channel: ChannelCtx;
  command: ParsedCommand;
  ctx: any;
}): Promise<ExecuteResult> {
  if (command.kind === "help" || command.kind === "unknown") {
    return { text: buildHelpText() };
  }

  // Telegram deep-link entrypoint.
  if (command.kind === "start") {
    if (!command.pairToken) {
      return { text: buildHelpText() };
    }

    try {
      const consumed: any = await consumePairToken({
        pairToken: command.pairToken,
        expectedType: "WEB_TO_CHANNEL",
        now: new Date()
      });

      const ownerId = consumed.owner_id;
      if (!ownerId) {
        return { text: "PAIR_TOKEN_INVALID\nInvalid pairing token." };
      }

      const result = await pairChannelIdentityForOwner({
        ownerId,
        channelType: channel.channelType,
        channelUserId: channel.channelUserId,
        channelContextId: channel.channelContextId,
        displayName: channel.displayName,
        now: new Date()
      });

      if (ctx) {
        ctx.ownerId = ownerId;
        ctx.actor = { type: "owner", id: ownerId };
        ctx.policy = {
          ...(ctx.policy || {}),
          action: "channel.pair",
          state: result.state
        };
      }

      const text =
        result.state === "PAIRED"
          ? "Paired: PAIRED"
          : "Paired: PENDING_APPROVAL\nApprove it in /console/approvals to enable write commands.";

      return { text, identity: result.identity };
    } catch (error: any) {
      return { text: truncate(formatTokenError(error)) };
    }
  }

  // Telegram-first entrypoint.
  if (command.kind === "connect") {
    const token = await createPairToken({
      tokenType: "CHANNEL_TO_WEB",
      channelType: channel.channelType,
      channelUserId: channel.channelUserId,
      channelContextId: channel.channelContextId,
      displayName: channel.displayName,
      now: new Date()
    });

    const pairUrl = joinUrl(getPublicAppUrl(), `/pair?token=${encodeURIComponent(token.pair_token)}`);
    const expires = formatDate(token.expires_at);

    return {
      text: truncate(
        [
          "Connect your Clawdeals account:",
          pairUrl,
          `Expires: ${expires}`,
          "",
          "If pairing requires approval, the channel will be PENDING_APPROVAL until approved."
        ].join("\n")
      ),
      replyMarkup: buildConnectReplyMarkup(pairUrl)
    };
  }

  // All other commands require an ACTIVE pairing.
  const identity: any = await findActiveIdentityByChannel({
    channelType: channel.channelType,
    channelUserId: channel.channelUserId,
    channelContextId: channel.channelContextId
  });

  if (!identity) {
    const pending: any = await findPendingIdentityByChannel({
      channelType: channel.channelType,
      channelUserId: channel.channelUserId,
      channelContextId: channel.channelContextId
    });

    if (pending) {
      return { text: pendingApprovalText(), blocked: true, identity: pending };
    }

    return { text: notPairedText(), blocked: true };
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

  await touchLastSeen({ ownerId: identity.owner_id, channelIdentityId: identity.channel_identity_id });

  const role = identity.role || "viewer";

  if (
    command.kind === "notifications_menu" ||
    command.kind === "notifications_mode" ||
    command.kind === "notifications_quiet_off" ||
    command.kind === "notifications_quiet_set" ||
    command.kind === "notifications_tz" ||
    command.kind === "notifications_types_toggle" ||
    command.kind === "notifications_strong_price" ||
    command.kind === "notifications_strong_trust"
  ) {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }

    const ownerId = identity.owner_id;

    const prefs = await getOrCreateNotificationPreferences({
      ownerId,
      channelIdentityId: identity.channel_identity_id,
      now: new Date()
    });

    if (command.kind === "notifications_menu") {
      return { text: truncate(buildNotificationsText(prefs)), replyMarkup: buildNotificationsKeyboard(prefs), identity };
    }

    // Writes are rate limited per owner.
    try {
      const rl: any = await rateLimitMiddleware(null, {
        routeGroup: "notifications.prefs.update",
        ownerId,
        env: process.env
      });
      if (rl && rl.status === 429) {
        return { text: "Rate limited. Try again later.", identity };
      }
    } catch {
      // Fail-open.
    }

    let patch: any = {};
    let change: any = {};

    if (command.kind === "notifications_mode") {
      patch.mode = command.mode;
      change.mode = command.mode;
    } else if (command.kind === "notifications_quiet_off") {
      patch.quiet_enabled = false;
      patch.quiet_start_min = null;
      patch.quiet_end_min = null;
      change.quiet = "OFF";
    } else if (command.kind === "notifications_quiet_set") {
      const startMin = parseTimeHHMM(command.start);
      const endMin = parseTimeHHMM(command.end);
      if (startMin == null || endMin == null) {
        return { text: "Invalid quiet hours. Use HH:MM HH:MM (ex: notif quiet 22:00 08:00).", identity };
      }
      patch.quiet_enabled = true;
      patch.quiet_start_min = startMin;
      patch.quiet_end_min = endMin;
      change.quiet = `${command.start}-${command.end}`;
    } else if (command.kind === "notifications_tz") {
      patch.timezone = command.timezone;
      change.timezone = command.timezone;
    } else if (command.kind === "notifications_types_toggle") {
      const t = String(command.eventType || "").trim().toLowerCase();
      const allowed = new Set(NOTIFICATION_EVENT_TYPES);
      if (!allowed.has(t as any)) {
        return { text: `Invalid event type. Allowed: ${NOTIFICATION_EVENT_TYPES.join(", ")}`, identity };
      }
      const current = Array.isArray(prefs.event_types) ? prefs.event_types.map((x: any) => String(x).trim().toLowerCase()) : [];
      const set = new Set(current);
      if (set.has(t)) set.delete(t);
      else set.add(t);
      patch.event_types = Array.from(set);
      change.event_types = patch.event_types;
    } else if (command.kind === "notifications_strong_price") {
      const strong = prefs.filters && typeof prefs.filters === "object" ? (prefs.filters as any).strong : {};
      const nextStrong: any = { ...(strong && typeof strong === "object" ? strong : {}) };
      nextStrong.max_price_eur = command.maxPriceEur === null ? null : command.maxPriceEur;
      patch.filters = { strong: nextStrong };
      change.strong_max_price_eur = command.maxPriceEur;
    } else if (command.kind === "notifications_strong_trust") {
      const strong = prefs.filters && typeof prefs.filters === "object" ? (prefs.filters as any).strong : {};
      const nextStrong: any = { ...(strong && typeof strong === "object" ? strong : {}) };
      nextStrong.min_seller_trust_score = command.minSellerTrustScore === null ? null : command.minSellerTrustScore;
      patch.filters = { strong: nextStrong };
      change.strong_min_seller_trust_score = command.minSellerTrustScore;
    }

    const updated = await updateNotificationPreferences({ ownerId, patch });

    return {
      text: truncate(buildNotificationsText(updated)),
      replyMarkup: buildNotificationsKeyboard(updated),
      identity,
      telemetry: { event: "notifications.preference_updated", payload: { changes: change }, outcome: "SUCCESS" }
    };
  }

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
        text: truncate(["Unpair requested.", `Target: ${targetId}`, "", `Confirm with: unpair ${targetId} confirm`].join("\n")),
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
      ownerId: identity.owner_id,
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
          ]
            .filter(Boolean)
            .join("\n")
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
