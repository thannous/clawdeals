export type OwnerSessionState = "authenticated" | "anonymous" | "unknown";

export type OwnerSessionSnapshot = {
  state: OwnerSessionState;
  ownerId: string | null;
};

const PROBE_TTL_MS = 5_000;

let cached: { snapshot: OwnerSessionSnapshot; at: number } | null = null;
let inflight: Promise<OwnerSessionSnapshot> | null = null;

async function requestSnapshot(): Promise<OwnerSessionSnapshot> {
  try {
    const resp = await fetch("/api/v1/auth/session", { method: "GET", cache: "no-store", credentials: "include" });
    if (!resp.ok) {
      return { state: "unknown", ownerId: null };
    }
    const body = await resp.json().catch(() => null);
    const authenticated = body?.data?.authenticated;
    if (authenticated === true) {
      return { state: "authenticated", ownerId: body?.data?.owner_id ? String(body.data.owner_id) : null };
    }
    if (authenticated === false) {
      return { state: "anonymous", ownerId: null };
    }
    // Unexpected payload shape: do not block callers on it.
    return { state: "unknown", ownerId: null };
  } catch {
    return { state: "unknown", ownerId: null };
  }
}

/**
 * Probes the owner session through `/api/v1/auth/session`, which answers 200 for
 * anonymous visitors. Results are shared across callers for a few seconds so a
 * page with several owner hooks issues a single request before deciding to
 * fetch data or redirect to login.
 */
export function probeOwnerSession(options: { fresh?: boolean } = {}): Promise<OwnerSessionSnapshot> {
  if (!options.fresh && cached && Date.now() - cached.at < PROBE_TTL_MS) {
    return Promise.resolve(cached.snapshot);
  }
  if (inflight) return inflight;

  inflight = requestSnapshot()
    .then((snapshot) => {
      if (snapshot.state !== "unknown") {
        cached = { snapshot, at: Date.now() };
      }
      return snapshot;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function invalidateOwnerSessionProbe() {
  cached = null;
}
