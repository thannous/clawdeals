import { useCallback, useEffect, useRef, useState } from "react";
import { trackDealViewed } from "./telemetry";

export function useDealDetail({ dealId } = {}) {
  const [deal, setDeal] = useState(null);
  const [fetchState, setFetchState] = useState("idle"); // idle | loading | error | done
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchDeal = useCallback(async () => {
    if (!dealId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    try {
      const resp = await fetch(`/api/console/deals/${dealId}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setDeal(data.deal || null);
      setFetchState("done");
      trackDealViewed({ dealId });
    } catch (err) {
      if (err.name === "AbortError") return;
      setFetchState("error");
      setError(err.message);
    }
  }, [dealId]);

  useEffect(() => {
    fetchDeal();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchDeal]);

  return {
    deal,
    fetchState,
    error,
    refetch: fetchDeal
  };
}

