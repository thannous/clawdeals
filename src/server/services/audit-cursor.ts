import { decodeJsonCursor, isCursorTimestamp } from "../utils/json-cursor";
import { isUuid } from "../utils/validators";

export { encodeJsonCursor as encodeAuditCursor } from "../utils/json-cursor";

export function decodeAuditCursor(raw: unknown) {
  return decodeJsonCursor(raw, ({ occurred_at, id }) =>
    isCursorTimestamp(occurred_at) && typeof id === "string" && isUuid(id) ? { occurred_at, id } : null
  );
}
