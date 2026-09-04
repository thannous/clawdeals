import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";

import { useOwnerSessionGate } from "../auth/useOwnerSessionGate";

export function useMyWatchlists() {
  const router = useRouter();
  const sessionGate = useOwnerSessionGate();
  const [items, setItems] = useState<any[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/v1/owner/watchlists", {
        credentials: "include",
        cache: "no-store"
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      const body = await response.json();
      setItems(Array.isArray(body?.data?.watchlists) ? body.data.watchlists : []);
      setState("done");
    } catch (cause: any) {
      setError(cause?.message || "Failed to load watchlists");
      setState("error");
    }
  }, []);

  useEffect(() => {
    if (sessionGate === "pending") return;
    if (sessionGate === "anonymous") {
      const next = encodeURIComponent(router.asPath || "/my/watchlists");
      void router.replace(`/auth/login?next=${next}`);
      return;
    }
    void load();
  }, [load, router, sessionGate]);

  const remove = useCallback(async (watchlistId: string) => {
    setRemovingId(watchlistId);
    setError(null);
    try {
      const response = await fetch(`/api/v1/owner/watchlists/${encodeURIComponent(watchlistId)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `${Date.now()}-${watchlistId}` }
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      setItems((current) => current.filter((item) => item.watchlist_id !== watchlistId));
    } catch (cause: any) {
      setError(cause?.message || "Failed to remove watchlist");
    } finally {
      setRemovingId(null);
    }
  }, []);

  return { items, state, error, removingId, load, remove };
}
