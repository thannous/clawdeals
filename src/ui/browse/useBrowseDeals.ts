import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { getPublicApiBaseUrl, joinUrl } from "../../shared/urls";

const DEFAULT_SORT = "new";
const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

function resolveParam(value: unknown): string {
  if (Array.isArray(value)) return value[0] || "";
  return (value as string) || "";
}

function parseBrowseFiltersFromQuery(query: any) {
  const sortRaw = resolveParam(query?.sort);
  const sort =
    sortRaw === "new" || sortRaw === "temp" || sortRaw === "trend"
      ? sortRaw
      : DEFAULT_SORT;
  const q = resolveParam(query?.q);
  const status = resolveParam(query?.status);
  return { sort, q, status };
}

export function useBrowseDeals({
  initialDeals,
  initialNextCursor,
}: {
  initialDeals: any[];
  initialNextCursor: string | null;
}) {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [sort, setSortState] = useState(() => {
    if (!routerReady) return DEFAULT_SORT;
    return parseBrowseFiltersFromQuery(router.query).sort;
  });
  const [q, setQState] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).q;
  });
  const [debouncedQ, setDebouncedQ] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).q;
  });
  const [status, setStatusState] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).status;
  });

  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  // Hydrate with SSR data — skip the first client-side fetch
  const isHydratedRef = useRef(true);
  const [deals, setDeals] = useState(initialDeals);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [fetchState, setFetchState] = useState<string>("done");
  const [loadMoreState, setLoadMoreState] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debouncedQRef = useRef(debouncedQ);

  useEffect(() => {
    debouncedQRef.current = debouncedQ;
  }, [debouncedQ]);

  // Sync from URL once router is ready
  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    const parsed = parseBrowseFiltersFromQuery(router.query);
    setSortState(parsed.sort);
    setQState(parsed.q);
    setDebouncedQ(parsed.q);
    setStatusState(parsed.status);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  // Sync state to URL
  const syncUrl = useCallback(
    (newSort: string, newQ: string, newStatus: string) => {
      const query: Record<string, string> = {};
      if (newSort && newSort !== DEFAULT_SORT) query.sort = newSort;
      if (newQ) query.q = newQ;
      if (newStatus) query.status = newStatus;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  // Fetch deals from public API
  const fetchDeals = useCallback(async (params: any, append = false) => {
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
    searchParams.set("sort", params.sort);
    searchParams.set("limit", String(PAGE_SIZE));
    if (params.q) searchParams.set("q", params.q);
    if (params.status) searchParams.set("status", params.status);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    const apiBase = getPublicApiBaseUrl();
    const endpoint = apiBase
      ? joinUrl(apiBase, `/api/v1/public/deals?${searchParams}`)
      : `/api/v1/public/deals?${searchParams}`;

    try {
      const resp = await fetch(endpoint, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      if (append) {
        setDeals((prev) => [...prev, ...(data.data || [])]);
      } else {
        setDeals(data.data || []);
      }
      setNextCursor(data.next_cursor || null);
      setFetchState("done");
      setLoadMoreState("idle");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  // Fetch on filter changes (skip first render — we have SSR data)
  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    if (isHydratedRef.current) {
      isHydratedRef.current = false;
      return;
    }
    fetchDeals({ sort, q: debouncedQ, status });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, sort, debouncedQ, status, fetchDeals]);

  // Setters with URL sync
  const setSort = useCallback(
    (newSort: string) => {
      setSortState(newSort);
      setDeals([]);
      setNextCursor(null);
      syncUrl(newSort, q, status);
    },
    [q, status, syncUrl]
  );

  const setQ = useCallback(
    (newQ: string) => {
      setQState(newQ);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (debouncedQRef.current !== newQ) {
          setDeals([]);
          setNextCursor(null);
          setDebouncedQ(newQ);
        }
        syncUrl(sort, newQ, status);
      }, SEARCH_DEBOUNCE_MS);
    },
    [sort, status, syncUrl]
  );

  const setStatus = useCallback(
    (newStatus: string) => {
      setStatusState(newStatus);
      setDeals([]);
      setNextCursor(null);
      syncUrl(sort, q, newStatus);
    },
    [sort, q, syncUrl]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchDeals(
      { sort, q: debouncedQ, status, cursor: nextCursor },
      true
    );
  }, [nextCursor, loadMoreState, sort, debouncedQ, status, fetchDeals]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchDeals({ sort, q: debouncedQ, status });
  }, [routerReady, isInitializedFromQuery, sort, debouncedQ, status, fetchDeals]);

  return {
    deals,
    sort,
    setSort,
    q,
    setQ,
    status,
    setStatus,
    nextCursor,
    fetchState,
    loadMoreState,
    error,
    loadMore,
    refetch,
  };
}
