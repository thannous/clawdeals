import { getNumberEnv } from "./env";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export const CONTACT_REVEAL_MIN_TRUST_SCORE = clamp(
  getNumberEnv("CONTACT_REVEAL_MIN_TRUST_SCORE", { defaultValue: 70 }),
  0,
  100
);

export const TRANSACTION_AUTO_CLOSE_DAYS = Math.max(
  1,
  Math.floor(getNumberEnv("TRANSACTION_AUTO_CLOSE_DAYS", { defaultValue: 7 }))
);
