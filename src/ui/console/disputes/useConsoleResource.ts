import { useCallback, useEffect, useRef, useState } from "react";

// Loads one console API resource and exposes a reload for after a decision.
export function useConsoleResource(url: string | null) {
  const [data, setData] = useState<any>(null);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
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
        const resp = await fetch(url, { signal: controller.signal });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(body?.error?.message || `HTTP ${resp.status}`);
        setData(body);
        setFetchState("done");
      } catch (err: any) {
        if (err.name === "AbortError" || options.silent) return;
        setError(err.message);
        setFetchState("error");
      }
    },
    [url]
  );

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => {
      clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  return { data, fetchState, error, reload: load };
}
