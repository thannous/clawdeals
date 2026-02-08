import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { trackApprovalsViewed, trackApprovalsFilterChanged } from "./telemetry";

const PAGE_SIZE = 50;
const DEFAULT_STATE = "PENDING";

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function parseFiltersFromQuery(query: Record<string, unknown>) {
  const state = resolveQueryParam(query?.state) || DEFAULT_STATE;
  const actionType = resolveQueryParam(query?.action_type) || null;
  const agentId = resolveQueryParam(query?.agent_id) || "";
  return { state, actionType, agentId };
}

export function useApprovals() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [state, setStateVal] = useState(() => {
    if (!routerReady) return DEFAULT_STATE;
    return parseFiltersFromQuery(router.query).state;
  });
  const [actionType, setActionTypeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).actionType;
  });
  const [agentId, setAgentIdState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).agentId;
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
    const parsed = parseFiltersFromQuery(router.query);
    setStateVal(parsed.state);
    setActionTypeState(parsed.actionType);
    setAgentIdState(parsed.agentId);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (st: string, at: string | null, aid: string) => {
      const query: Record<string, string> = {};
      if (st && st !== DEFAULT_STATE) query.state = st;
      if (at) query.action_type = at;
      if (aid) query.agent_id = aid;
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
    if (params.state) searchParams.set("state", params.state);
    if (params.actionType) searchParams.set("action_type", params.actionType);
    if (params.agentId) searchParams.set("agent_id", params.agentId);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/console/approvals?${searchParams}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (append) {
        setItems((prev) => [...prev, ...(data.items || [])]);
      } else {
        setItems(data.items || []);
      }
      setNextCursor(data.next_cursor || null);
      setFetchState("done");
      setLoadMoreState("idle");
      trackApprovalsViewed({ state: params.state, count: (data.items || []).length });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ state, actionType, agentId });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, state, actionType, agentId, fetchItems]);

  const setState = useCallback(
    (val: string) => {
      setStateVal(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(val, actionType, agentId);
      trackApprovalsFilterChanged({ state: val });
    },
    [actionType, agentId, syncUrl]
  );

  const setActionType = useCallback(
    (val: string | null) => {
      setActionTypeState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(state, val, agentId);
      trackApprovalsFilterChanged({ actionType: val });
    },
    [state, agentId, syncUrl]
  );

  const setAgentId = useCallback(
    (val: string) => {
      setAgentIdState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(state, actionType, val);
      trackApprovalsFilterChanged({ agentId: val });
    },
    [state, actionType, syncUrl]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ state, actionType, agentId, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, state, actionType, agentId, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ state, actionType, agentId });
  }, [routerReady, isInitializedFromQuery, state, actionType, agentId, fetchItems]);

  return {
    items,
    state, setState,
    actionType, setActionType,
    agentId, setAgentId,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
