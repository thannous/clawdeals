import { useCallback, useEffect, useRef, useState } from "react";

export function useRiskRules() {
  const [items, setItems] = useState<any[]>([]);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchItems = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    try {
      const response = await fetch("/api/console/risk-rules", { signal: controller.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${response.status}`);
      }
      const body = await response.json();
      setItems(Array.isArray(body?.items) ? body.items : []);
      setFetchState("done");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "Failed to load risk rules");
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    fetchItems();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchItems]);

  return {
    items,
    fetchState,
    error,
    refetch: fetchItems
  };
}

