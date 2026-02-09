import { getNumberEnv } from "./env";

const DEFAULT_STAGE_TTL_SECONDS = 10 * 60;
const DEFAULT_UNDO_WINDOW_SECONDS = 30;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getStagedCommandTtlSeconds() {
  // Keep staging windows human-friendly. Too large increases replay risk; too small hurts UX.
  return clamp(
    getNumberEnv("STAGED_COMMAND_TTL_SECONDS", { defaultValue: DEFAULT_STAGE_TTL_SECONDS }),
    30,
    60 * 60
  );
}

export function getUndoWindowSeconds() {
  return clamp(
    getNumberEnv("UNDO_WINDOW_SECONDS", { defaultValue: DEFAULT_UNDO_WINDOW_SECONDS }),
    5,
    5 * 60
  );
}

