import { isUuid } from "../../utils/validators";

export type ParsedCommand =
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "approvals_list" }
  | { kind: "approve"; approvalId: string; confirm: boolean }
  | { kind: "deny"; approvalId: string; reason: string | null; confirm: boolean }
  | { kind: "policies_show" }
  | { kind: "deploy_status" }
  | { kind: "pair" }
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

  if (cmd === "help") return { kind: "help" };
  if (cmd === "status") return { kind: "status" };
  if (cmd === "approvals") return { kind: "approvals_list" };
  if (cmd === "pair") return { kind: "pair" };

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

