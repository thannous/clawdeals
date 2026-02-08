import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 30;

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(id);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

type UseDealReasonsOptions = {
  dealId?: string;
};

type FetchReasonsParams = {
  cursor?: string | null;
  append?: boolean;
};

export function useDealReasons({ dealId }: UseDealReasonsOptions = {}) {
  const [direction, setDirection] = useState(null); // null | "up" | "down"
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [fetchState, setFetchState] = useState("idle"); // idle | loading | error | done
  const [loadMoreState, setLoadMoreState] = useState("idle"); // idle | loading
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchReasons = useCallback(async ({ cursor, append }: FetchReasonsParams = {}) => {
    if (!dealId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) {
      setFetchState("loading");
      setError(null);
    } else {
      setLoadMoreState("loading");
    }

    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(PAGE_SIZE));
    if (direction) searchParams.set("direction", direction);
    if (cursor) searchParams.set("cursor", cursor);

    try {
      const url = `/api/console/deals/${dealId}/votes?${searchParams}`;
      const enableRetry = process.env.NODE_ENV !== "production";
      const maxAttempts = enableRetry ? 2 : 1;

      let resp: Response | null = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          resp = await fetch(url, { signal: controller.signal });
        } catch (err) {
          if (!enableRetry || attempt === maxAttempts) throw err;
          if (err?.name === "AbortError") throw err;
          await sleep(500, controller.signal);
          continue;
        }

        if (resp.ok) break;
        const shouldRetry = enableRetry && attempt < maxAttempts && (resp.status === 503 || resp.status === 504);
        if (shouldRetry) {
          await sleep(500, controller.signal);
          continue;
        }
        break;
      }

      if (!resp) throw new Error("Failed to fetch reasons");
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();

      const nextItems = data.items || [];
      if (append) {
        setItems((prev) => [...prev, ...nextItems]);
      } else {
        setItems(nextItems);
      }

      setNextCursor(data.next_cursor || null);
      setFetchState("done");
      setLoadMoreState("idle");
    } catch (err) {
      if (err.name === "AbortError") return;
      setFetchState("error");
      setLoadMoreState("idle");
      setError(err.message);
    }
  }, [dealId, direction]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    fetchReasons({ append: false });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [dealId, direction, fetchReasons]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchReasons({ cursor: nextCursor, append: true });
  }, [nextCursor, loadMoreState, fetchReasons]);

  return {
    direction,
    setDirection,
    items,
    nextCursor,
    fetchState,
    loadMoreState,
    error,
    loadMore
  };
}
