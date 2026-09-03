import { invalidateOwnerSessionProbe, probeOwnerSession } from "./ownerSessionProbe";

const SESSION_READY_RETRY_DELAYS_MS = [0, 60, 120, 240, 480];

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Session bridging just wrote the cookie: drop any cached "anonymous" answer.
function resetProbeCache() {
  invalidateOwnerSessionProbe();
}

export async function waitForOwnerSessionReady(options: { attempts?: number } = {}) {
  const attempts = Math.max(1, Math.min(SESSION_READY_RETRY_DELAYS_MS.length, Number(options.attempts || 0) || SESSION_READY_RETRY_DELAYS_MS.length));
  const delays = SESSION_READY_RETRY_DELAYS_MS.slice(0, attempts);
  resetProbeCache();

  for (const delayMs of delays) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const snapshot = await probeOwnerSession({ fresh: true });
    if (snapshot.state === "authenticated") {
      return true;
    }
    if (snapshot.state === "anonymous") {
      // Anonymous is terminal for this probe window; retrying only spams logs.
      invalidateOwnerSessionProbe();
      return false;
    }
    // "unknown" is a transient network or hydration race: keep retrying.
  }

  return false;
}
