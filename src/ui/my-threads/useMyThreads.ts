import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";

const PAGE_SIZE = 50;

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export function useMyThreads() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [status, setStatusVal] = useState<string | null>(() => {
    if (!routerReady) return null;
    return resolveQueryParam(router.query?.status) || null;
  });

  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [loadMoreState, setLoadMoreState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    setStatusVal(resolveQueryParam(router.query?.status) || null);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (st: string | null) => {
      const query: Record<string, string> = {};
      if (st) query.status = st;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  const fetchItems = useCallback(async (params: { status: string | null; cursor?: string }, append = false) => {
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
    if (params.status) searchParams.set("status", params.status);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/v1/owner/threads?${searchParams}`, { signal: controller.signal });

      if (resp.status === 401) {
        const next = encodeURIComponent(router.asPath || "/my/threads");
        void router.replace(`/auth/login?next=${next}`);
        return;
      }

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const threads = data?.data?.threads || [];
      const cursor = data?.data?.next_cursor || null;

      if (append) {
        setItems((prev) => [...prev, ...threads]);
      } else {
        setItems(threads);
      }
      setNextCursor(cursor);
      setFetchState("done");
      setLoadMoreState("idle");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, [router]);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ status });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, status, fetchItems]);

  const setStatus = useCallback(
    (val: string | null) => {
      setStatusVal(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(val);
    },
    [syncUrl]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ status, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, status, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ status });
  }, [routerReady, isInitializedFromQuery, status, fetchItems]);

  return {
    items,
    status, setStatus,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
