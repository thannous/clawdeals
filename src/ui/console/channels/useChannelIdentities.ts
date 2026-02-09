import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";

const PAGE_SIZE = 100;
const DEFAULT_STATE = "PENDING";

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function parseFiltersFromQuery(query: Record<string, unknown>) {
  const state = resolveQueryParam(query?.state) || DEFAULT_STATE;
  const channelType = resolveQueryParam(query?.channel_type) || "";
  return { state, channelType };
}

export function useChannelIdentities() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [state, setStateVal] = useState(() => {
    if (!routerReady) return DEFAULT_STATE;
    return parseFiltersFromQuery(router.query).state;
  });
  const [channelType, setChannelTypeVal] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).channelType;
  });

  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  const [items, setItems] = useState<any[]>([]);
  const [fetchState, setFetchState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    const parsed = parseFiltersFromQuery(router.query);
    setStateVal(parsed.state);
    setChannelTypeVal(parsed.channelType);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (st: string, ct: string) => {
      const query: Record<string, string> = {};
      if (st && st !== DEFAULT_STATE) query.state = st;
      if (ct) query.channel_type = ct;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  const fetchItems = useCallback(async (params: any) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(PAGE_SIZE));
    if (params.state) searchParams.set("state", params.state);
    if (params.channelType) searchParams.set("channel_type", params.channelType);

    try {
      const resp = await fetch(`/api/console/channels?${searchParams}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setItems(data.items || []);
      setFetchState("done");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ state, channelType });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, state, channelType, fetchItems]);

  const setState = useCallback(
    (val: string) => {
      setStateVal(val);
      setItems([]);
      syncUrl(val, channelType);
    },
    [channelType, syncUrl]
  );

  const setChannelType = useCallback(
    (val: string) => {
      setChannelTypeVal(val);
      setItems([]);
      syncUrl(state, val);
    },
    [state, syncUrl]
  );

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ state, channelType });
  }, [routerReady, isInitializedFromQuery, state, channelType, fetchItems]);

  return {
    items,
    state,
    setState,
    channelType,
    setChannelType,
    fetchState,
    error,
    refetch
  };
}

