type CursorFields = Record<string, unknown>;

export function encodeJsonCursor(cursor: unknown) {
  if (!cursor) return null;
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeJsonCursor<T>(raw: unknown, read: (fields: CursorFields) => T | null) {
  if (!raw || typeof raw !== "string") return null;

  // Existing clients also send padded base64; query parsers can turn "+" into a space.
  const token = raw.trim().replace(/ /g, "+");
  if (token.length % 4 === 1) return { error: "Invalid cursor" };
  let fields: CursorFields;
  try {
    fields = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return { error: "Invalid cursor" };
  }

  const value = fields && typeof fields === "object" ? read(fields) : null;
  return value ? { value } : { error: "Invalid cursor" };
}

export function isCursorTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}
