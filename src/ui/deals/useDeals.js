import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { trackDealsViewed } from "./telemetry";

const DEFAULT_SORT = "new";
const DEFAULT_STATUSES = ["NEW", "ACTIVE"];
const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

function resolveQueryParam(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseCsvQueryValues(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseDealsFiltersFromQuery(query) {
  const sortRaw = resolveQueryParam(query?.sort);
  const sortCandidate = sortRaw ? String(sortRaw) : DEFAULT_SORT;
  const sort =
    sortCandidate === "new" || sortCandidate === "temp" || sortCandidate === "trend"
      ? sortCandidate
      : DEFAULT_SORT;

  let statuses = parseCsvQueryValues(query?.status).map((value) => value.toUpperCase());
  if (sort === "temp" || sort === "trend") {
    statuses = ["ACTIVE"];
  } else if (!statuses.length) {
    statuses = DEFAULT_STATUSES;
  }

  const tags = parseCsvQueryValues(query?.tags);
  const qRaw = resolveQueryParam(query?.q);
  const q = qRaw ? String(qRaw) : "";

  return { sort, statuses, tags, q };
}

export function useDeals() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  // Initialize from URL query params
  const [sort, setSortState] = useState(() => {
    if (!routerReady) return DEFAULT_SORT;
    return parseDealsFiltersFromQuery(router.query).sort;
  });
  const [statuses, setStatusesState] = useState(() => {
    if (!routerReady) return DEFAULT_STATUSES;
    return parseDealsFiltersFromQuery(router.query).statuses;
  });
  const [tags, setTagsState] = useState(() => {
    if (!routerReady) return [];
    return parseDealsFiltersFromQuery(router.query).tags;
  });
  const [q, setQState] = useState(() => {
    if (!routerReady) return "";
    return parseDealsFiltersFromQuery(router.query).q;
  });
  // Debounced query used for fetching. This avoids wiping results after a successful fetch.
  const [debouncedQ, setDebouncedQ] = useState(() => {
    if (!routerReady) return "";
    return parseDealsFiltersFromQuery(router.query).q;
  });

  // When using the Next.js pages router, `router.query` can be empty on first render.
  // Initialize state from the query only once it's ready, and only then start fetching.
  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  const [deals, setDeals] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [fetchState, setFetchState] = useState("idle"); // idle | loading | error | done
  const [loadMoreState, setLoadMoreState] = useState("idle"); // idle | loading
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const debouncedQRef = useRef(debouncedQ);

  useEffect(() => {
    debouncedQRef.current = debouncedQ;
  }, [debouncedQ]);

  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    const parsed = parseDealsFiltersFromQuery(router.query);
    setSortState(parsed.sort);
    setStatusesState(parsed.statuses);
    setTagsState(parsed.tags);
    setQState(parsed.q);
    setDebouncedQ(parsed.q);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  // Sync state to URL
  const syncUrl = useCallback((newSort, newStatuses, newQ, newTags) => {
    const query = {};
    if (newSort && newSort !== DEFAULT_SORT) query.sort = newSort;
    if (newStatuses?.length && JSON.stringify(newStatuses) !== JSON.stringify(DEFAULT_STATUSES)) {
      query.status = newStatuses.join(",");
    }
    if (newQ) query.q = newQ;
    if (newTags?.length) query.tags = newTags.join(",");
    router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
  }, [router]);

  // Fetch deals
  const fetchDeals = useCallback(async (params, append = false) => {
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
    if (params.statuses?.length) params.statuses.forEach(s => searchParams.append("status", s));
    if (params.q) searchParams.set("q", params.q);
    if (params.tags?.length) params.tags.forEach(t => searchParams.append("tags", t));
    searchParams.set("limit", String(PAGE_SIZE));
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/console/deals?${searchParams}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      if (append) {
        setDeals(prev => [...prev, ...(data.items || [])]);
      } else {
        setDeals(data.items || []);
      }
      setNextCursor(data.next_cursor || null);
      setFetchState("done");
      setLoadMoreState("idle");

      trackDealsViewed({
        sort: params.sort,
        statuses: params.statuses,
        tags: params.tags,
        q: params.q,
        pageSize: PAGE_SIZE
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  // Initial fetch + refetch on filter change
  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchDeals({ sort, statuses, q: debouncedQ, tags });
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [routerReady, isInitializedFromQuery, sort, statuses, debouncedQ, tags, fetchDeals]);

  // Setters with URL sync
  const setSort = useCallback((newSort) => {
    setSortState(newSort);
    // Sort constraint: temp/trend force ACTIVE only
    const newStatuses = (newSort === "temp" || newSort === "trend") ? ["ACTIVE"] : DEFAULT_STATUSES;
    setStatusesState(newStatuses);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDebouncedQ(q);
    setDeals([]);
    setNextCursor(null);
    syncUrl(newSort, newStatuses, q, tags);
  }, [q, tags, syncUrl]);

  const setStatuses = useCallback((newStatuses) => {
    setStatusesState(newStatuses);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDebouncedQ(q);
    setDeals([]);
    setNextCursor(null);
    syncUrl(sort, newStatuses, q, tags);
  }, [sort, q, tags, syncUrl]);

  const setTags = useCallback((newTags) => {
    setTagsState(newTags);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setDebouncedQ(q);
    setDeals([]);
    setNextCursor(null);
    syncUrl(sort, statuses, q, newTags);
  }, [sort, statuses, q, syncUrl]);

  const setQ = useCallback((newQ) => {
    setQState(newQ);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Only clear + refetch when the effective query actually changes.
      // Otherwise we'd wipe the list and not trigger a new fetch.
      if (debouncedQRef.current !== newQ) {
        setDeals([]);
        setNextCursor(null);
        setDebouncedQ(newQ);
      }
      syncUrl(sort, statuses, newQ, tags);
    }, SEARCH_DEBOUNCE_MS);
  }, [sort, statuses, tags, syncUrl]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchDeals({ sort, statuses, q: debouncedQ, tags, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, sort, statuses, debouncedQ, tags, fetchDeals]);

  // Update deals list after a vote (replace the deal in-place)
  const updateDealInList = useCallback((updatedDeal) => {
    setDeals(prev => prev.map(d =>
      d.deal_id === updatedDeal.deal_id ? { ...d, ...updatedDeal } : d
    ));
  }, []);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchDeals({ sort, statuses, q: debouncedQ, tags });
  }, [routerReady, isInitializedFromQuery, sort, statuses, debouncedQ, tags, fetchDeals]);

  return {
    deals, sort, setSort, statuses, setStatuses, tags, setTags, q, setQ,
    nextCursor, fetchState, loadMoreState, error, loadMore, updateDealInList,
    refetch
  };
}
