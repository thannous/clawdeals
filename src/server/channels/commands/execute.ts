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
import { getAgentIdByOwnerId } from "../../services/agents";
import { listWatchlistsPage } from "../../services/watchlists";
import { buildNotificationsKeyboard } from "../telegram/keyboard";
import { createConfirmation, consumeConfirmation } from "../command-confirmations";
import { CARD_ACTION_IDS, CARD_COMMAND_IDS } from "../cards/ids";
import type { Card } from "../cards/types";
import { renderCardPlainText } from "../cards/types";
import type { ParsedCommand } from "./parser";

type ChannelCtx = {
  channelType: string;
  channelUserId: string;
  channelContextId: string;
  displayName: string | null;
};

type ExecuteResult = {
  text: string;
  card?: Card | null;
  blocked?: boolean;
  identity?: any;
  replyMarkup?: any;
  telemetry?: { event: string; payload: any; outcome?: string };
  telemetryEvents?: { event: string; payload: any; outcome?: string }[];
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
    "- menu (or /menu)",
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

const WATCHLISTS_PAGE_SIZE = 8;

function buildHomeCard(): Card {
  return {
    title: "Clawdeals",
    subtitle: "Menu",
    bullets: ["Navigation via boutons (pas de commandes a memoriser)."],
    actions: [
      {
        action_id: CARD_ACTION_IDS.HOME_WATCHLISTS,
        label: "Watchlists",
        command_id: CARD_COMMAND_IDS.MENU_WATCHLISTS,
        args: { p: 0 },
        row: 0
      },
      {
        action_id: CARD_ACTION_IDS.HOME_MATCHES,
        label: "Matches / alertes",
        command_id: CARD_COMMAND_IDS.MENU_MATCHES,
        row: 1
      },
      {
        action_id: CARD_ACTION_IDS.HOME_PUBLISH,
        label: "Publier une annonce",
        command_id: CARD_COMMAND_IDS.MENU_PUBLISH,
        row: 2
      },
      {
        action_id: CARD_ACTION_IDS.HOME_THREADS,
        label: "Mes threads / negociations",
        command_id: CARD_COMMAND_IDS.MENU_THREADS,
        row: 3
      },
      {
        action_id: CARD_ACTION_IDS.HOME_APPROVALS,
        label: "Approvals",
        command_id: CARD_COMMAND_IDS.MENU_APPROVALS,
        row: 4
      },
      {
        action_id: CARD_ACTION_IDS.HOME_NOTIFICATIONS,
        label: "Notifications",
        command_id: CARD_COMMAND_IDS.MENU_NOTIFICATIONS,
        row: 5
      },
      {
        action_id: CARD_ACTION_IDS.HOME_HELP,
        label: "Help",
        command_id: CARD_COMMAND_IDS.MENU_HELP,
        row: 6
      }
    ]
  };
}

function buildWatchlistsCard({
  page,
  pageSize,
  items,
  hasPrev,
  hasNext
}: {
  page: number;
  pageSize: number;
  items: any[];
  hasPrev: boolean;
  hasNext: boolean;
}): Card {
  const bullets: string[] = [];
  const rows = Array.isArray(items) ? items : [];

  if (rows.length === 0) {
    bullets.push("Aucune watchlist pour le moment.");
  } else {
    for (const wl of rows) {
      const active = wl?.active === true ? "ON" : "OFF";
      const name = typeof wl?.name === "string" && wl.name.trim() ? wl.name.trim() : "(sans nom)";
      const query = typeof wl?.query_text === "string" && wl.query_text.trim() ? wl.query_text.trim() : "";
      const price = typeof wl?.price_max === "number" && Number.isFinite(wl.price_max) ? wl.price_max : null;

      const parts = [`${active}: ${name}`];
      if (query) parts.push(`q=${query}`);
      if (price != null) parts.push(`max=${price}EUR`);
      bullets.push(parts.join(" | "));
    }
  }

  const actions: any[] = [
    {
      action_id: CARD_ACTION_IDS.WATCHLISTS_CREATE,
      label: "Creer une watchlist",
      command_id: CARD_COMMAND_IDS.WATCHLISTS_CREATE,
      row: 0
    },
    {
      action_id: CARD_ACTION_IDS.WATCHLISTS_BACK,
      label: "Retour",
      command_id: CARD_COMMAND_IDS.MENU_HOME,
      row: 1
    }
  ];

  const navRow = 2;
  if (hasPrev) {
    actions.push({
      action_id: CARD_ACTION_IDS.WATCHLISTS_PREV,
      label: "Prec",
      command_id: CARD_COMMAND_IDS.MENU_WATCHLISTS,
      args: { p: Math.max(0, page - 1) },
      row: navRow
    });
  }
  if (hasNext) {
    actions.push({
      action_id: CARD_ACTION_IDS.WATCHLISTS_NEXT,
      label: "Suiv",
      command_id: CARD_COMMAND_IDS.MENU_WATCHLISTS,
      args: { p: page + 1 },
      row: navRow
    });
  }

  return {
    title: "Watchlists",
    subtitle: `Page ${page + 1}`,
    bullets,
    actions,
    entity_ref: { type: "watchlists.page", id: `${page}:${pageSize}` }
  };
}

function buildCreateWatchlistStubCard(): Card {
  const url = joinUrl(getPublicAppUrl(), "/developer/watchlists/new");
  return {
    title: "Creer une watchlist",
    subtitle: "Pas encore disponible dans Telegram. Utilise le web pour la creer.",
    actions: [
      {
        action_id: "watchlists.create.open_web",
        label: "Ouvrir sur le web",
        command_id: CARD_COMMAND_IDS.WATCHLISTS_CREATE,
        url,
        row: 0
      },
      {
        action_id: CARD_ACTION_IDS.CREATE_BACK,
        label: "Retour",
        command_id: CARD_COMMAND_IDS.MENU_WATCHLISTS,
        args: { p: 0 },
        row: 1
      }
    ]
  };
}

function buildComingSoonCard({ title, subtitle }: { title: string; subtitle?: string }) : Card {
  return {
    title,
    subtitle: subtitle || "Bientot disponible.",
    actions: [
      {
        action_id: "menu.back",
        label: "Retour",
        command_id: CARD_COMMAND_IDS.MENU_HOME,
        row: 0
      }
    ]
  };
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

  if (command.kind === "menu") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }

    if (ctx) {
      try {
        const policy = await getPolicyOrDefault(identity.owner_id);
        ctx.policy = {
          ...(ctx.policy || {}),
          action: "chat.menu",
          policy_version: policy?.version ?? null
        };
      } catch {
        // Best-effort.
      }
    }

    const card = buildHomeCard();
    return {
      text: renderCardPlainText(card),
      card,
      identity,
      telemetryEvents: [
        { event: "chat.menu_opened", payload: { card: "home" }, outcome: "SUCCESS" },
        { event: "chat.card_rendered", payload: { card: "home" }, outcome: "SUCCESS" }
      ]
    };
  }

  if (command.kind === "menu_watchlists") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }

    if (ctx) {
      try {
        const policy = await getPolicyOrDefault(identity.owner_id);
        ctx.policy = {
          ...(ctx.policy || {}),
          action: "chat.nav",
          policy_version: policy?.version ?? null
        };
      } catch {
        // Best-effort.
      }
    }

    const agentId = await getAgentIdByOwnerId(identity.owner_id);
    if (!agentId) {
      return { text: "Error: missing agent for this owner.", identity };
    }

    const page = Math.max(0, Number.isInteger(command.page) ? command.page : 0);
    const pageResult = await listWatchlistsPage({
      agentId,
      page,
      pageSize: WATCHLISTS_PAGE_SIZE
    });

    const card = buildWatchlistsCard({
      page: pageResult.page,
      pageSize: pageResult.pageSize,
      items: pageResult.items || [],
      hasPrev: Boolean(pageResult.hasPrev),
      hasNext: Boolean(pageResult.hasNext)
    });

    return {
      text: renderCardPlainText(card),
      card,
      identity,
      telemetryEvents: [
        {
          event: "chat.card_rendered",
          payload: {
            card: "watchlists",
            page: pageResult.page,
            page_size: pageResult.pageSize,
            count: (pageResult.items || []).length
          },
          outcome: "SUCCESS"
        }
      ]
    };
  }

  if (command.kind === "watchlists_create") {
    if (!requiresRole(role, "owner")) {
      return { text: "Forbidden: owner role required.", identity };
    }

    if (ctx) {
      try {
        const policy = await getPolicyOrDefault(identity.owner_id);
        ctx.policy = {
          ...(ctx.policy || {}),
          action: "chat.nav",
          policy_version: policy?.version ?? null
        };
      } catch {
        // Best-effort.
      }
    }

    const card = buildCreateWatchlistStubCard();
    return {
      text: renderCardPlainText(card),
      card,
      identity,
      telemetryEvents: [
        { event: "chat.card_rendered", payload: { card: "watchlists.create", stub: true }, outcome: "SUCCESS" }
      ]
    };
  }

  if (command.kind === "menu_matches") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }
    const card = buildComingSoonCard({ title: "Matches / alertes" });
    return {
      text: renderCardPlainText(card),
      card,
      identity,
      telemetryEvents: [{ event: "chat.card_rendered", payload: { card: "matches" }, outcome: "SUCCESS" }]
    };
  }

  if (command.kind === "menu_publish") {
    if (!requiresRole(role, "owner")) {
      return { text: "Forbidden: owner role required.", identity };
    }
    const card = buildComingSoonCard({ title: "Publier une annonce" });
    return {
      text: renderCardPlainText(card),
      card,
      identity,
      telemetryEvents: [{ event: "chat.card_rendered", payload: { card: "publish" }, outcome: "SUCCESS" }]
    };
  }

  if (command.kind === "menu_threads") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }
    const card = buildComingSoonCard({ title: "Mes threads / negociations" });
    return {
      text: renderCardPlainText(card),
      card,
      identity,
      telemetryEvents: [{ event: "chat.card_rendered", payload: { card: "threads" }, outcome: "SUCCESS" }]
    };
  }

  if (command.kind === "menu_help") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }
    const card: Card = {
      title: "Help",
      subtitle: "Raccourcis",
      bullets: ["menu", "watchlists", "notifications", "approvals", "connect", "help"],
      actions: [
        {
          action_id: "help.back",
          label: "Retour",
          command_id: CARD_COMMAND_IDS.MENU_HOME,
          row: 0
        }
      ]
    };
    return {
      text: renderCardPlainText(card),
      card,
      identity,
      telemetryEvents: [{ event: "chat.card_rendered", payload: { card: "help" }, outcome: "SUCCESS" }]
    };
  }

  if (command.kind === "menu_approvals") {
    if (!requiresRole(role, "viewer")) {
      return { text: "Forbidden: viewer role required.", identity };
    }
    const result = await listApprovals({ ownerId: identity.owner_id, state: "PENDING", limit: 10 });
    const approvals = result.approvals || [];
    const bullets =
      approvals.length === 0
        ? ["Aucune approval en attente."]
        : approvals.slice(0, 10).map((ap: any) => `${ap.approval_id} | ${ap.action_type}`);

    const card: Card = {
      title: "Approvals",
      subtitle: `En attente: ${approvals.length}`,
      bullets,
      actions: [
        {
          action_id: "approvals.back",
          label: "Retour",
          command_id: CARD_COMMAND_IDS.MENU_HOME,
          row: 0
        }
      ]
    };

    return {
      text: renderCardPlainText(card),
      card,
      identity,
      telemetryEvents: [{ event: "chat.card_rendered", payload: { card: "approvals", count: approvals.length }, outcome: "SUCCESS" }]
    };
  }

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
