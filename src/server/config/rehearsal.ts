/** Server-only, non-expiring safety switch. Never infer permission from credentials.
 * Unset/empty/0/false is normal operation. Any other value is fail-closed,
 * including misspellings of true. Do not expose a client-controlled override.
 */
export function isRehearsalMode(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.CLAWDEALS_REHEARSAL_MODE?.trim().toLowerCase();
  return Boolean(value && value !== "0" && value !== "false");
}

export function assertRehearsalEffectAllowed(effect: string): void {
  if (isRehearsalMode()) {
    throw Object.assign(new Error(`Rehearsal blocks ${effect}`), {
      status: 503, code: "REHEARSAL_EFFECT_BLOCKED"
    });
  }
}

export function assertRehearsalNeonBackend(backend: string): void {
  if (isRehearsalMode() && backend !== "neon") {
    throw Object.assign(new Error("Rehearsal requires an explicit Neon backend; Supabase fallback is forbidden"), {
      status: 503, code: "REHEARSAL_BACKEND_REQUIRED"
    });
  }
}

/** The public values are build-time constants in Next bundles, not credentials. */
export function isRehearsalConfigurationReady(): boolean {
  return !isRehearsalMode() || (
    process.env.CLAWDEALS_DATABASE_BACKEND === "neon" &&
    process.env.NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND === "neon" &&
    process.env.CLAWDEALS_AUTH_BACKEND === "neon" &&
    process.env.NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND === "neon" &&
    process.env.NEXT_PUBLIC_CLAWDEALS_REHEARSAL_MODE === "true"
  );
}
