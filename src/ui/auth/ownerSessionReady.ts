const SESSION_READY_RETRY_DELAYS_MS = [0, 60, 120, 240, 480];

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForOwnerSessionReady(options: { attempts?: number } = {}) {
  const attempts = Math.max(1, Math.min(SESSION_READY_RETRY_DELAYS_MS.length, Number(options.attempts || 0) || SESSION_READY_RETRY_DELAYS_MS.length));
  const delays = SESSION_READY_RETRY_DELAYS_MS.slice(0, attempts);

  for (const delayMs of delays) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const resp = await fetch("/api/v1/auth/me", {
        method: "GET",
        cache: "no-store"
      });
      if (resp.ok) {
        return true;
      }
      if (resp.status === 401) {
        // Unauthorized is terminal for this probe window; retrying only spams logs.
        return false;
      }
    } catch {
      // Best-effort only. Keep retrying for transient network or hydration races.
    }
  }

  return false;
}
