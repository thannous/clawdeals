import { decodeJsonCursor, encodeJsonCursor } from "../utils/json-cursor";

export function encodeMessagesCursor(cursor: { created_at: string; message_id: string } | null) {
  return cursor ? encodeJsonCursor({ created_at: cursor.created_at, message_id: cursor.message_id }) : null;
}

export function decodeMessagesCursor(raw: unknown) {
  return decodeJsonCursor(raw, ({ created_at, message_id }) =>
    typeof created_at === "string" && typeof message_id === "string" ? { created_at, message_id } : null
  );
}
