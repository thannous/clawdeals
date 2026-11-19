import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useOwnerSessionGate } from "../auth/useOwnerSessionGate";
import { getJson } from "./orderApi";

type FetchState = "idle" | "loading" | "done" | "error";

// Loads an owner-only resource; anonymous visitors are sent to login first.
function useOwnerResource(url: string | null) {
  const router = useRouter();
  const sessionGate = useOwnerSessionGate();
  const [data, setData] = useState<any>(null);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [error, setError] = useState<{ message: string; status: number | null } | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const authRequired = unauthorized || sessionGate === "anonymous";
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!url) return;
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!options.silent) {
        setFetchState("loading");
        setError(null);
      }

      try {
        setData(await getJson(url, controller.signal));
        setFetchState("done");
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (err.status === 401) {
          setUnauthorized(true);
          return;
        }
        if (options.silent) return;
        setError({ message: err.message, status: err.status ?? null });
        setFetchState("error");
      }
    },
    [url]
  );

  useEffect(() => {
    if (!url || sessionGate === "pending" || sessionGate === "anonymous") return;
    const timer = setTimeout(() => load(), 0);
    return () => {
      clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [url, sessionGate, load]);

  useEffect(() => {
    if (!authRequired) return;
    void router.replace(`/auth/login?next=${encodeURIComponent(router.asPath || "/my/orders")}`);
  }, [authRequired, router]);

  return { data, fetchState, error, reload: load };
}

export function useOrders() {
  const resource = useOwnerResource("/api/v1/owner/escrows");
  return { ...resource, data: (resource.data?.data?.escrows || []) as any[] };
}

export function useOrder(escrowId: string | undefined) {
  return useOwnerResource(escrowId ? `/api/v1/escrows/${encodeURIComponent(escrowId)}` : null);
}
