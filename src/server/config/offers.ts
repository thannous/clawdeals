import { getNumberEnv } from "./env";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const OFFERS_TTL_MIN_SECONDS = 10 * MINUTE;
export const OFFERS_TTL_MAX_SECONDS = 7 * DAY;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Max time an offer may stay open from creation. Used to validate `expires_at`.
// Env-overridable but clamped to [10min, 7d] to prevent unsafe configs.
export const OFFERS_TTL_WINDOW_SECONDS = clamp(
  getNumberEnv("OFFERS_TTL_WINDOW_SECONDS", { defaultValue: OFFERS_TTL_MAX_SECONDS }),
  OFFERS_TTL_MIN_SECONDS,
  OFFERS_TTL_MAX_SECONDS
);

