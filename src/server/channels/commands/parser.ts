import { isUuid } from "../../utils/validators";
import { CARD_COMMAND_IDS } from "../cards/ids";
import { decodeTelegramCardCallbackData } from "../cards/telegram";

export type ParsedCommand =
  | { kind: "help" }
  | { kind: "start"; pairToken: string | null }
  | { kind: "status" }
  | { kind: "menu" }
  | { kind: "menu_matches" }
  | { kind: "menu_publish" }
  | { kind: "menu_threads" }
  | { kind: "menu_approvals" }
  | { kind: "menu_help" }
  | { kind: "menu_watchlists"; page: number }
  | { kind: "watchlists_create" }
  | { kind: "approvals_list" }
  | { kind: "approve"; approvalId: string; confirm: boolean }
  | { kind: "deny"; approvalId: string; reason: string | null; confirm: boolean }
  | { kind: "policies_show" }
  | { kind: "deploy_status" }
  | { kind: "connect" }
  | { kind: "notifications_menu" }
  | { kind: "notifications_mode"; mode: "REALTIME" | "DIGEST_HOURLY" | "DIGEST_DAILY" | "SILENT" }
  | { kind: "notifications_quiet_off" }
  | { kind: "notifications_quiet_set"; start: string; end: string }
  | { kind: "notifications_tz"; timezone: string }
  | { kind: "notifications_types_toggle"; eventType: string }
  | { kind: "notifications_strong_price"; maxPriceEur: number | null }
  | { kind: "notifications_strong_trust"; minSellerTrustScore: number | null }
  | { kind: "unpair"; channelIdentityId: string; confirm: boolean }
  | { kind: "unknown"; raw: string };

function normalizeCommandToken(token: string) {
  let t = token.trim();
  if (t.startsWith("/")) t = t.slice(1);
  const at = t.indexOf("@");
  if (at !== -1) t = t.slice(0, at);
  return t.toLowerCase();
}

function readArgValue(parts: string[], key: string): string | null {
  const k = String(key || "").trim().toLowerCase();
  if (!k) return null;
  for (const p of parts) {
    const raw = String(p || "").trim();
    if (!raw) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) continue;
    const left = raw.slice(0, eq).trim().toLowerCase();
    if (left !== k) continue;
    const value = raw.slice(eq + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function readArgInt(parts: string[], key: string, fallback = 0): number {
  const raw = readArgValue(parts, key);
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function parseCommand(raw: unknown): ParsedCommand {
  if (typeof raw !== "string") {
    return { kind: "unknown", raw: "" };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "unknown", raw: "" };

  const decoded = decodeTelegramCardCallbackData(trimmed);
  if (decoded) {
    const cmd = decoded.commandId;
    const args = decoded.args || {};
    if (cmd === CARD_COMMAND_IDS.MENU_HOME) return { kind: "menu" };
    if (cmd === CARD_COMMAND_IDS.MENU_WATCHLISTS) {
      const p = Number.parseInt(String(args.p ?? "0"), 10);
      return { kind: "menu_watchlists", page: Number.isFinite(p) ? Math.max(0, p) : 0 };
    }
    if (cmd === CARD_COMMAND_IDS.WATCHLISTS_CREATE) return { kind: "watchlists_create" };
    if (cmd === CARD_COMMAND_IDS.MENU_APPROVALS) return { kind: "menu_approvals" };
    if (cmd === CARD_COMMAND_IDS.MENU_NOTIFICATIONS) return { kind: "notifications_menu" };
    if (cmd === CARD_COMMAND_IDS.MENU_HELP) return { kind: "menu_help" };
    if (cmd === CARD_COMMAND_IDS.MENU_MATCHES) return { kind: "menu_matches" };
    if (cmd === CARD_COMMAND_IDS.MENU_PUBLISH) return { kind: "menu_publish" };
    if (cmd === CARD_COMMAND_IDS.MENU_THREADS) return { kind: "menu_threads" };

    // Stable callbacks for notifications (avoid parsing fragile text payloads).
    if (cmd === "notifications.menu") return { kind: "notifications_menu" };
    if (cmd === "notifications.mode") {
      const raw = normalizeCommandToken(String(args.m || ""));
      if (raw === "realtime") return { kind: "notifications_mode", mode: "REALTIME" };
      if (raw === "digest_hourly" || raw === "hourly") return { kind: "notifications_mode", mode: "DIGEST_HOURLY" };
      if (raw === "digest_daily" || raw === "daily") return { kind: "notifications_mode", mode: "DIGEST_DAILY" };
      if (raw === "silent") return { kind: "notifications_mode", mode: "SILENT" };
      return { kind: "unknown", raw: trimmed };
    }
    if (cmd === "notifications.quiet.off") return { kind: "notifications_quiet_off" };
    if (cmd === "notifications.quiet.set") {
      const start = String(args.s || "").trim();
      const end = String(args.e || "").trim();
      if (start && end) return { kind: "notifications_quiet_set", start, end };
      return { kind: "unknown", raw: trimmed };
    }
    if (cmd === "notifications.tz") {
      const tz = String(args.tz || "").trim();
      if (!tz) return { kind: "unknown", raw: trimmed };
      return { kind: "notifications_tz", timezone: tz };
    }
    if (cmd === "notifications.types.toggle") {
      const t = String(args.t || "").trim();
      if (!t) return { kind: "unknown", raw: trimmed };
      return { kind: "notifications_types_toggle", eventType: t };
    }
    if (cmd === "notifications.strong.price") {
      const raw = String(args.p || "").trim();
      if (!raw) return { kind: "unknown", raw: trimmed };
      if (normalizeCommandToken(raw) === "off") return { kind: "notifications_strong_price", maxPriceEur: null };
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return { kind: "unknown", raw: trimmed };
      return { kind: "notifications_strong_price", maxPriceEur: n };
    }
    if (cmd === "notifications.strong.trust") {
      const raw = String(args.tr || "").trim();
      if (!raw) return { kind: "unknown", raw: trimmed };
      if (normalizeCommandToken(raw) === "off") return { kind: "notifications_strong_trust", minSellerTrustScore: null };
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { kind: "unknown", raw: trimmed };
      return { kind: "notifications_strong_trust", minSellerTrustScore: n };
    }

    return { kind: "unknown", raw: trimmed };
  }

  const parts = trimmed.split(/\s+/);
  const cmd = normalizeCommandToken(parts[0]);

  if (cmd === "start") {
    const token = parts[1] ? String(parts[1]).trim().slice(0, 200) : null;
    return { kind: "start", pairToken: token || null };
  }
  if (cmd === "help") return { kind: "help" };
  if (cmd === "status") return { kind: "status" };
  if (cmd === "menu" || cmd === "menu.home") return { kind: "menu" };
  if (cmd === "menu.matches") return { kind: "menu_matches" };
  if (cmd === "menu.publish") return { kind: "menu_publish" };
  if (cmd === "menu.threads") return { kind: "menu_threads" };
  if (cmd === "menu.approvals") return { kind: "menu_approvals" };
  if (cmd === "menu.help") return { kind: "menu_help" };
  if (cmd === "menu.watchlists") {
    const p = readArgInt(parts.slice(1), "p", 0);
    return { kind: "menu_watchlists", page: Math.max(0, p) };
  }
  if (cmd === "watchlists.create") return { kind: "watchlists_create" };
  if (cmd === "approvals") return { kind: "approvals_list" };
  if (cmd === "connect") return { kind: "connect" };
  if (cmd === "pair") return { kind: "connect" };
  if (cmd === "notif" || cmd === "notifications") {
    const sub = normalizeCommandToken(parts[1] || "");
    if (!sub) return { kind: "notifications_menu" };

    if (sub === "mode") {
      const raw = normalizeCommandToken(parts[2] || "");
      if (raw === "realtime") return { kind: "notifications_mode", mode: "REALTIME" };
      if (raw === "digest_hourly" || raw === "hourly") return { kind: "notifications_mode", mode: "DIGEST_HOURLY" };
      if (raw === "digest_daily" || raw === "daily") return { kind: "notifications_mode", mode: "DIGEST_DAILY" };
      if (raw === "silent") return { kind: "notifications_mode", mode: "SILENT" };
      return { kind: "unknown", raw: trimmed };
    }

    if (sub === "quiet") {
      const a = parts[2] ? String(parts[2]).trim() : "";
      const b = parts[3] ? String(parts[3]).trim() : "";
      if (normalizeCommandToken(a) === "off") return { kind: "notifications_quiet_off" };
      if (a && b) return { kind: "notifications_quiet_set", start: a, end: b };
      return { kind: "unknown", raw: trimmed };
    }

    if (sub === "tz") {
      const tz = parts[2] ? String(parts[2]).trim() : "";
      if (!tz) return { kind: "unknown", raw: trimmed };
      return { kind: "notifications_tz", timezone: tz };
    }

    if (sub === "types") {
      const action = normalizeCommandToken(parts[2] || "");
      const t = parts[3] ? String(parts[3]).trim() : "";
      if (action === "toggle" && t) return { kind: "notifications_types_toggle", eventType: t };
      return { kind: "unknown", raw: trimmed };
    }

    if (sub === "strong") {
      const which = normalizeCommandToken(parts[2] || "");
      const raw = parts[3] ? String(parts[3]).trim() : "";

      if (which === "price") {
        if (!raw) return { kind: "unknown", raw: trimmed };
        if (normalizeCommandToken(raw) === "off") return { kind: "notifications_strong_price", maxPriceEur: null };
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) return { kind: "unknown", raw: trimmed };
        return { kind: "notifications_strong_price", maxPriceEur: n };
      }

      if (which === "trust") {
        if (!raw) return { kind: "unknown", raw: trimmed };
        if (normalizeCommandToken(raw) === "off") return { kind: "notifications_strong_trust", minSellerTrustScore: null };
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || n < 0 || n > 100) return { kind: "unknown", raw: trimmed };
        return { kind: "notifications_strong_trust", minSellerTrustScore: n };
      }

      return { kind: "unknown", raw: trimmed };
    }

    return { kind: "unknown", raw: trimmed };
  }

  if (cmd === "deploy") {
    if (normalizeCommandToken(parts[1] || "") === "status") {
      return { kind: "deploy_status" };
    }
    return { kind: "unknown", raw: trimmed };
  }

  if (cmd === "policies") {
    if (normalizeCommandToken(parts[1] || "") === "show") {
      return { kind: "policies_show" };
    }
    return { kind: "unknown", raw: trimmed };
  }

  if (cmd === "approve") {
    const approvalId = parts[1] || "";
    if (!isUuid(approvalId)) return { kind: "unknown", raw: trimmed };
    const confirm = normalizeCommandToken(parts[2] || "") === "confirm";
    return { kind: "approve", approvalId, confirm };
  }

  if (cmd === "deny") {
    const approvalId = parts[1] || "";
    if (!isUuid(approvalId)) return { kind: "unknown", raw: trimmed };
    const last = normalizeCommandToken(parts[parts.length - 1] || "");
    const confirm = last === "confirm";
    const reasonTokens = parts.slice(2, confirm ? -1 : undefined);
    const reason = reasonTokens.length ? reasonTokens.join(" ").trim() : null;
    return { kind: "deny", approvalId, reason: reason || null, confirm };
  }

  if (cmd === "unpair") {
    const channelIdentityId = parts[1] || "";
    if (!isUuid(channelIdentityId)) return { kind: "unknown", raw: trimmed };
    const confirm = normalizeCommandToken(parts[2] || "") === "confirm";
    return { kind: "unpair", channelIdentityId, confirm };
  }

  return { kind: "unknown", raw: trimmed };
}
