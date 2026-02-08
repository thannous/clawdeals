import { isUuid } from "../utils/validators";

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(raw: string) {
  // Normalize:
  // - Some tooling decodes '+' as space in query strings.
  // - Accept both base64url and legacy base64.
  let normalized = raw.trim().replace(/ /g, "+");
  normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");

  // Pad to a multiple of 4.
  const padLen = normalized.length % 4;
  if (padLen === 2) normalized += "==";
  else if (padLen === 3) normalized += "=";
  else if (padLen !== 0) {
    throw new Error("invalid_base64");
  }

  return Buffer.from(normalized, "base64").toString("utf8");
}

export function encodeAuditCursor(cursor: any) {
  if (!cursor) return null;
  const payload = JSON.stringify(cursor);
  return base64UrlEncode(payload);
}

export function decodeAuditCursor(raw: any) {
  if (!raw || typeof raw !== "string") return null;

  let decoded;
  try {
    decoded = base64UrlDecode(raw);
  } catch (error) {
    return { error: "Invalid cursor" };
  }

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    return { error: "Invalid cursor" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "Invalid cursor" };
  }

  if (typeof (parsed as any).occurred_at !== "string") {
    return { error: "Invalid cursor" };
  }

  if (!isUuid((parsed as any).id)) {
    return { error: "Invalid cursor" };
  }

  return {
    value: {
      occurred_at: (parsed as any).occurred_at,
      id: (parsed as any).id
    }
  };
}
