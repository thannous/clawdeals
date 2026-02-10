import type { Card, CardAction } from "./types";
import { renderCardPlainText } from "./types";

function safeEncode(value: any) {
  return encodeURIComponent(String(value ?? ""));
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeArgs(args: Record<string, any> | null | undefined) {
  if (!args || typeof args !== "object") return "";
  const parts: string[] = [];
  const keys = Object.keys(args).sort();
  for (const k of keys) {
    const v = (args as any)[k];
    if (v === undefined) continue;
    if (v === null) {
      parts.push(`${safeEncode(k)}=`);
      continue;
    }
    parts.push(`${safeEncode(k)}=${safeEncode(v)}`);
  }
  return parts.join("&");
}

function decodeArgs(raw: string | null | undefined) {
  if (!raw || typeof raw !== "string") return {};
  const out: Record<string, string> = {};
  for (const part of raw.split("&")) {
    if (!part) continue;
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = safeDecode(part.slice(0, idx));
    const v = safeDecode(part.slice(idx + 1));
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

// Telegram callback_data is limited (64 bytes). Keep the encoding compact and stable.
// Format:
// - `cd:<command_id>` (no args)
// - `cd:<command_id>:<action_id>` (no args)
// - `cd:<command_id>:<action_id>:<k=v&...>` (args)
// - `cd:<command_id>:<k=v&...>` (args; no action_id)
export function encodeTelegramCardCallbackData({
  commandId,
  actionId,
  args
}: {
  commandId: string;
  actionId?: string | null;
  args?: Record<string, any> | null;
}) {
  const cmd = String(commandId || "").trim();
  const act = actionId ? String(actionId).trim() : "";
  const argStr = encodeArgs(args);

  let value = `cd:${cmd}`;
  if (act) value += `:${act}`;
  if (argStr) value += `:${argStr}`;

  if (value.length <= 64) return value;

  // Fallback: drop args first, then action_id.
  if (argStr) {
    const noArgs = act ? `cd:${cmd}:${act}` : `cd:${cmd}`;
    if (noArgs.length <= 64) return noArgs;
  }

  const minimal = `cd:${cmd}`;
  if (minimal.length <= 64) return minimal;
  return minimal.slice(0, 64);
}

export function decodeTelegramCardCallbackData(raw: unknown): null | {
  commandId: string;
  actionId: string | null;
  args: Record<string, string>;
} {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("cd:")) return null;
  const rest = raw.slice(3);
  if (!rest) return null;

  const parts = rest.split(":");
  const commandId = parts[0] ? String(parts[0]).trim() : "";
  if (!commandId) return null;

  // `cd:<cmd>`
  if (parts.length === 1) {
    return { commandId, actionId: null, args: {} };
  }

  // If the 2nd part looks like args (contains '='), treat it as args and no action_id.
  const second = parts[1] ? String(parts[1]) : "";
  const looksLikeArgs = second.includes("=");

  if (looksLikeArgs) {
    return { commandId, actionId: null, args: decodeArgs(second) };
  }

  const actionId = second.trim() ? second.trim() : null;

  // `cd:<cmd>:<action>`
  if (parts.length === 2) {
    return { commandId, actionId, args: {} };
  }

  // `cd:<cmd>:<action>:<args>`
  const args = decodeArgs(parts.slice(2).join(":"));
  return { commandId, actionId, args };
}

function groupActionsByRow(actions: CardAction[]) {
  const grouped = new Map<number, CardAction[]>();
  let nextAutoRow = 0;

  for (const action of actions) {
    const row = Number.isInteger(action.row) ? (action.row as number) : nextAutoRow++;
    const existing = grouped.get(row) || [];
    existing.push(action);
    grouped.set(row, existing);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, rowActions]) => rowActions);
}

export function renderCardToTelegram(card: Card): { text: string; replyMarkup: any } {
  const text = renderCardPlainText(card);

  const actions = Array.isArray(card.actions) ? card.actions : [];
  const rows = groupActionsByRow(actions);

  const inlineKeyboard = rows
    .map((row) =>
      row
        .map((a) => {
          const label = String(a.label || "").trim();
          if (!label) return null;

          const url = a.url ? String(a.url).trim() : "";
          if (url) {
            return { text: label, url };
          }

          const commandId = String(a.command_id || "").trim();
          if (!commandId) return null;

          return {
            text: label,
            callback_data: encodeTelegramCardCallbackData({
              commandId,
              actionId: a.action_id || null,
              args: a.args || null
            })
          };
        })
        .filter(Boolean)
    )
    .filter((row) => row.length > 0);

  return {
    text,
    replyMarkup: inlineKeyboard.length ? { inline_keyboard: inlineKeyboard } : null
  };
}

