import { getClawdealsEnv } from "../config/runtime";

// These markers identify catalog fixtures, not verified merchant offers.
export function isSyntheticDealSource(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* Inspect the raw URL. */ }
  return /clawdeals[-_]demo|sandbox[-_]seed/i.test(decoded);
}

export function assertPublishableDealSource(value: unknown) {
  if (getClawdealsEnv() === "production" && isSyntheticDealSource(value)) {
    throw Object.assign(new Error("Demo merchant URLs cannot be published in production"), {
      status: 400, code: "VALIDATION_ERROR"
    });
  }
}
