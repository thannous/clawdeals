import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";

const PAGE_SIZE = 50;
const DEFAULT_STATE = "PENDING";

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export function useMyApprovals() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [state, setStateVal] = useState(() => {
    if (!routerReady) return DEFAULT_STATE;
    return resolveQueryParam(router.query?.state) || DEFAULT_STATE;
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
    setStateVal(resolveQueryParam(router.query?.state) || DEFAULT_STATE);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (st: string) => {
      const query: Record<string, string> = {};
      if (st && st !== DEFAULT_STATE) query.state = st;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  const fetchItems = useCallback(async (params: { state: string; cursor?: string }, append = false) => {
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
    if (params.state) searchParams.set("state", params.state);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/v1/approvals?${searchParams}`, { signal: controller.signal });

      if (resp.status === 401) {
        const next = encodeURIComponent(router.asPath || "/my/approvals");
        void router.replace(`/auth/login?next=${next}`);
        return;
      }

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const approvals = data?.data?.approvals || [];
      const cursor = data?.data?.next_cursor || null;

      if (append) {
        setItems((prev) => [...prev, ...approvals]);
      } else {
        setItems(approvals);
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
    fetchItems({ state });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, state, fetchItems]);

  const setState = useCallback(
    (val: string | null) => {
      const resolved = val || DEFAULT_STATE;
      setStateVal(resolved);
      setItems([]);
      setNextCursor(null);
      syncUrl(resolved);
    },
    [syncUrl]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ state, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, state, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ state });
  }, [routerReady, isInitializedFromQuery, state, fetchItems]);

  return {
    items,
    state, setState,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
