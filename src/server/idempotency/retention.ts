import { assertRehearsalEffectAllowed } from "../config/rehearsal";
import { deleteExpiredIdempotency } from "./store";

export async function runIdempotencyRetention({ now = new Date() } = {}) {
  assertRehearsalEffectAllowed("idempotency/retention");
  return deleteExpiredIdempotency({ now });
}
