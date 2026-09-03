import { useEffect, useState } from "react";

import { probeOwnerSession, type OwnerSessionState } from "./ownerSessionProbe";

export type OwnerSessionGate = OwnerSessionState | "pending";

/**
 * Resolves the owner session once per page (shared probe) so owner-only data
 * hooks can redirect anonymous visitors before issuing requests that would
 * otherwise fail with 401. "unknown" (network failure) lets callers fall back to
 * their previous behaviour: fetch, then react to the response.
 */
export function useOwnerSessionGate(): OwnerSessionGate {
  const [gate, setGate] = useState<OwnerSessionGate>("pending");

  useEffect(() => {
    let cancelled = false;
    void probeOwnerSession().then((snapshot) => {
      if (!cancelled) setGate(snapshot.state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return gate;
}
