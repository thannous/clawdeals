function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(raw: string) {
  let normalized = raw.trim().replace(/ /g, "+");
  normalized = normalized.replace(/-/g, "+").replace(/_/g, "/");

  const padLen = normalized.length % 4;
  if (padLen === 2) normalized += "==";
  else if (padLen === 3) normalized += "=";
  else if (padLen !== 0) {
    throw new Error("invalid_base64");
  }

  return Buffer.from(normalized, "base64").toString("utf8");
}

export function encodeMessagesCursor(cursor: any) {
  if (!cursor) return null;
  const payload = JSON.stringify({
    created_at: cursor.created_at,
    message_id: cursor.message_id
  });
  return base64UrlEncode(payload);
}

export function decodeMessagesCursor(raw: any) {
  if (!raw || typeof raw !== "string") return null;

  let decoded;
  try {
    decoded = base64UrlDecode(raw);
  } catch {
    return { error: "Invalid cursor" };
  }

  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return { error: "Invalid cursor" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "Invalid cursor" };
  }
  if (typeof parsed.created_at !== "string" || typeof parsed.message_id !== "string") {
    return { error: "Invalid cursor" };
  }

  return {
    value: {
      created_at: parsed.created_at,
      message_id: parsed.message_id
    }
  };
}
