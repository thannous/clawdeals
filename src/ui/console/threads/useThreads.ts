import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { trackThreadsViewed, trackThreadsFilterChanged } from "./telemetry";

const PAGE_SIZE = 50;

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function parseFiltersFromQuery(query: Record<string, unknown>) {
  const listingId = resolveQueryParam(query?.listing_id) || "";
  const buyerAgentId = resolveQueryParam(query?.buyer_agent_id) || "";
  const sellerAgentId = resolveQueryParam(query?.seller_agent_id) || "";
  const status = resolveQueryParam(query?.status) || null;
  return { listingId, buyerAgentId, sellerAgentId, status };
}

export function useThreads() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [listingId, setListingIdState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).listingId;
  });
  const [buyerAgentId, setBuyerAgentIdState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).buyerAgentId;
  });
  const [sellerAgentId, setSellerAgentIdState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).sellerAgentId;
  });
  const [status, setStatusState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).status;
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
    setListingIdState(parsed.listingId);
    setBuyerAgentIdState(parsed.buyerAgentId);
    setSellerAgentIdState(parsed.sellerAgentId);
    setStatusState(parsed.status);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (lid: string, bid: string, sid: string, st: string | null) => {
      const query: Record<string, string> = {};
      if (lid) query.listing_id = lid;
      if (bid) query.buyer_agent_id = bid;
      if (sid) query.seller_agent_id = sid;
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
    if (params.listingId) searchParams.set("listing_id", params.listingId);
    if (params.buyerAgentId) searchParams.set("buyer_agent_id", params.buyerAgentId);
    if (params.sellerAgentId) searchParams.set("seller_agent_id", params.sellerAgentId);
    if (params.status) searchParams.set("status", params.status);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/console/threads?${searchParams}`, { signal: controller.signal });
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
      trackThreadsViewed({ count: (data.items || []).length });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ listingId, buyerAgentId, sellerAgentId, status });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, listingId, buyerAgentId, sellerAgentId, status, fetchItems]);

  const setListingId = useCallback(
    (val: string) => {
      setListingIdState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(val, buyerAgentId, sellerAgentId, status);
      trackThreadsFilterChanged({ listingId: val });
    },
    [buyerAgentId, sellerAgentId, status, syncUrl]
  );

  const setBuyerAgentId = useCallback(
    (val: string) => {
      setBuyerAgentIdState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(listingId, val, sellerAgentId, status);
      trackThreadsFilterChanged({ buyerAgentId: val });
    },
    [listingId, sellerAgentId, status, syncUrl]
  );

  const setSellerAgentId = useCallback(
    (val: string) => {
      setSellerAgentIdState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(listingId, buyerAgentId, val, status);
      trackThreadsFilterChanged({ sellerAgentId: val });
    },
    [listingId, buyerAgentId, status, syncUrl]
  );

  const setStatus = useCallback(
    (val: string | null) => {
      setStatusState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(listingId, buyerAgentId, sellerAgentId, val);
      trackThreadsFilterChanged({ status: val });
    },
    [listingId, buyerAgentId, sellerAgentId, syncUrl]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ listingId, buyerAgentId, sellerAgentId, status, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, listingId, buyerAgentId, sellerAgentId, status, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ listingId, buyerAgentId, sellerAgentId, status });
  }, [routerReady, isInitializedFromQuery, listingId, buyerAgentId, sellerAgentId, status, fetchItems]);

  return {
    items,
    listingId, setListingId,
    buyerAgentId, setBuyerAgentId,
    sellerAgentId, setSellerAgentId,
    status, setStatus,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
