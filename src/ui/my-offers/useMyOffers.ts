import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";

const PAGE_SIZE = 50;

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export function useMyOffers() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [status, setStatusVal] = useState<string | null>(() => {
    if (!routerReady) return null;
    return resolveQueryParam(router.query?.status) || null;
  });
  const [agentId, setAgentIdVal] = useState<string | null>(() => {
    if (!routerReady) return null;
    return resolveQueryParam(router.query?.agent_id) || null;
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
    setAgentIdVal(resolveQueryParam(router.query?.agent_id) || null);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (st: string | null, aid: string | null) => {
      const query: Record<string, string> = {};
      if (st) query.status = st;
      if (aid) query.agent_id = aid;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  const [authRequired, setAuthRequired] = useState(false);

  const fetchItems = useCallback(async (params: { status: string | null; agentId?: string | null; cursor?: string }, append = false) => {
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
    if (params.agentId) searchParams.set("agent_id", params.agentId);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/v1/owner/offers?${searchParams}`, { signal: controller.signal });

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
      const offers = data?.data?.offers || [];
      const cursor = data?.data?.next_cursor || null;

      if (append) {
        setItems((prev) => [...prev, ...offers]);
      } else {
        setItems(offers);
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
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    const timer = setTimeout(() => fetchItems({ status, agentId }), 0);
    return () => {
      clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, status, agentId, fetchItems]);

  useEffect(() => {
    if (!authRequired) return;
    const next = encodeURIComponent(router.asPath || "/my/offers");
    void router.replace(`/auth/login?next=${next}`);
  }, [authRequired, router]);

  const setStatus = useCallback(
    (val: string | null) => {
      setStatusVal(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(val, agentId);
    },
    [syncUrl, agentId]
  );

  const setAgentId = useCallback(
    (val: string | null) => {
      setAgentIdVal(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(status, val);
    },
    [syncUrl, status]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ status, agentId, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, status, agentId, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ status, agentId });
  }, [routerReady, isInitializedFromQuery, status, agentId, fetchItems]);

  return {
    items,
    status, setStatus,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
