import { isUuid } from "../../utils/validators";

export type ParsedCommand =
  | { kind: "help" }
  | { kind: "start"; pairToken: string | null }
  | { kind: "status" }
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

export function parseCommand(raw: unknown): ParsedCommand {
  if (typeof raw !== "string") {
    return { kind: "unknown", raw: "" };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "unknown", raw: "" };

  const parts = trimmed.split(/\s+/);
  const cmd = normalizeCommandToken(parts[0]);

  if (cmd === "start") {
    const token = parts[1] ? String(parts[1]).trim().slice(0, 200) : null;
    return { kind: "start", pairToken: token || null };
  }
  if (cmd === "help") return { kind: "help" };
  if (cmd === "status") return { kind: "status" };
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
