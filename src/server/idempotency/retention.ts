import { deleteExpiredIdempotency } from "./store";

export async function runIdempotencyRetention({ now = new Date() } = {}) {
  return deleteExpiredIdempotency({ now });
}
