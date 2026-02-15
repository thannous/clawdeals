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
    setStateVal(resolveQueryParam(router.query?.state) || DEFAULT_STATE);
    setAgentIdVal(resolveQueryParam(router.query?.agent_id) || null);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (st: string, aid: string | null) => {
      const query: Record<string, string> = {};
      if (st && st !== DEFAULT_STATE) query.state = st;
      if (aid) query.agent_id = aid;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  const [authRequired, setAuthRequired] = useState(false);

  const fetchItems = useCallback(async (params: { state: string; agentId?: string | null; cursor?: string }, append = false) => {
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
    if (params.agentId) searchParams.set("agent_id", params.agentId);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/v1/approvals?${searchParams}`, { signal: controller.signal });

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
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    const timer = setTimeout(() => fetchItems({ state, agentId }), 0);
    return () => {
      clearTimeout(timer);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, state, agentId, fetchItems]);

  useEffect(() => {
    if (!authRequired) return;
    const next = encodeURIComponent(router.asPath || "/my/approvals");
    void router.replace(`/auth/login?next=${next}`);
  }, [authRequired, router]);

  const setState = useCallback(
    (val: string | null) => {
      const resolved = val || DEFAULT_STATE;
      setStateVal(resolved);
      setItems([]);
      setNextCursor(null);
      syncUrl(resolved, agentId);
    },
    [syncUrl, agentId]
  );

  const setAgentId = useCallback(
    (val: string | null) => {
      setAgentIdVal(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(state, val);
    },
    [syncUrl, state]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ state, agentId, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, state, agentId, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ state, agentId });
  }, [routerReady, isInitializedFromQuery, state, agentId, fetchItems]);

  return {
    items,
    state, setState,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
