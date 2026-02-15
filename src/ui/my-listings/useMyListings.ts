import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";

const PAGE_SIZE = 50;

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export function useMyListings() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [status, setStatusState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return resolveQueryParam(router.query?.status) || null;
  });
  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);
  const [authRequired, setAuthRequired] = useState(false);

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [loadMoreState, setLoadMoreState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    setStatusState(resolveQueryParam(router.query?.status) || null);
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

  const fetchItems = useCallback(async (params: any, append = false) => {
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
      const resp = await fetch(`/api/v1/owner/listings?${searchParams}`, { signal: controller.signal });

      if (resp.status === 401) {
        setAuthRequired(true);
        setFetchState("done");
        return;
      }

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const listings = data?.data?.listings || [];
      if (append) {
        setItems((prev) => [...prev, ...listings]);
      } else {
        setItems(listings);
      }
      setNextCursor(data?.data?.next_cursor || null);
      setFetchState("done");
      setLoadMoreState("idle");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ status });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, status, fetchItems]);

  useEffect(() => {
    if (!authRequired) return;
    const next = encodeURIComponent(router.asPath || "/my/listings");
    void router.replace(`/auth/login?next=${next}`);
  }, [authRequired, router]);

  const setStatus = useCallback(
    (val: string | null) => {
      setStatusState(val);
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
    items, status, setStatus,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
