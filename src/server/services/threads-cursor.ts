import { decodeJsonCursor, encodeJsonCursor } from "../utils/json-cursor";

export function encodeThreadsCursor(cursor: { created_at: string; thread_id: string } | null) {
  return cursor ? encodeJsonCursor({ created_at: cursor.created_at, thread_id: cursor.thread_id }) : null;
}

export function decodeThreadsCursor(raw: unknown) {
  return decodeJsonCursor(raw, ({ created_at, thread_id }) =>
    typeof created_at === "string" && typeof thread_id === "string" ? { created_at, thread_id } : null
  );
}
