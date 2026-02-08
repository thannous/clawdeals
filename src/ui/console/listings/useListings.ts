import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { trackListingsViewed, trackListingsFilterChanged } from "./telemetry";

const DEFAULT_SORT = "recent";
const DEFAULT_STATUS: string | null = null;
const DEFAULT_CONDITION: string | null = null;
const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

const LISTING_STATUS_VALUES = new Set([
  "DRAFT",
  "PENDING_APPROVAL",
  "LIVE",
  "RESERVED",
  "CONTACT_REVEALED",
  "COMPLETED",
  "REMOVED",
  "EXPIRED",
]);

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function parseFiltersFromQuery(query: Record<string, unknown>) {
  const sortRaw = resolveQueryParam(query?.sort);
  const sortCandidate = sortRaw ? String(sortRaw) : DEFAULT_SORT;
  const sort =
    sortCandidate === "recent" || sortCandidate === "price_asc" || sortCandidate === "price_desc"
      ? sortCandidate
      : DEFAULT_SORT;

  const statusRaw = resolveQueryParam(query?.status) || DEFAULT_STATUS;
  let status = statusRaw;
  // Backwards-compat for pre-enum UI values.
  if (status === "ACTIVE") status = "LIVE";
  if (status === "SOLD") status = "COMPLETED";
  if (status && !LISTING_STATUS_VALUES.has(status)) status = DEFAULT_STATUS;

  const condition = resolveQueryParam(query?.condition) || DEFAULT_CONDITION;
  const q = resolveQueryParam(query?.q) || "";
  const priceMin = resolveQueryParam(query?.price_min) || "";
  const priceMax = resolveQueryParam(query?.price_max) || "";

  return { sort, status, condition, q, priceMin, priceMax };
}

export function useListings() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [sort, setSortState] = useState(() => {
    if (!routerReady) return DEFAULT_SORT;
    return parseFiltersFromQuery(router.query).sort;
  });
  const [status, setStatusState] = useState<string | null>(() => {
    if (!routerReady) return DEFAULT_STATUS;
    return parseFiltersFromQuery(router.query).status;
  });
  const [condition, setConditionState] = useState<string | null>(() => {
    if (!routerReady) return DEFAULT_CONDITION;
    return parseFiltersFromQuery(router.query).condition;
  });
  const [q, setQState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).q;
  });
  const [debouncedQ, setDebouncedQ] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).q;
  });
  const [priceMin, setPriceMinState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).priceMin;
  });
  const [priceMax, setPriceMaxState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).priceMax;
  });

  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [loadMoreState, setLoadMoreState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debouncedQRef = useRef(debouncedQ);

  useEffect(() => {
    debouncedQRef.current = debouncedQ;
  }, [debouncedQ]);

  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    const parsed = parseFiltersFromQuery(router.query);
    setSortState(parsed.sort);
    setStatusState(parsed.status);
    setConditionState(parsed.condition);
    setQState(parsed.q);
    setDebouncedQ(parsed.q);
    setPriceMinState(parsed.priceMin);
    setPriceMaxState(parsed.priceMax);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (s: string, st: string | null, cond: string | null, search: string, pMin: string, pMax: string) => {
      const query: Record<string, string> = {};
      if (s && s !== DEFAULT_SORT) query.sort = s;
      if (st) query.status = st;
      if (cond) query.condition = cond;
      if (search) query.q = search;
      if (pMin) query.price_min = pMin;
      if (pMax) query.price_max = pMax;
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
    searchParams.set("sort", params.sort);
    searchParams.set("limit", String(PAGE_SIZE));
    if (params.status) searchParams.set("status", params.status);
    if (params.condition) searchParams.set("condition", params.condition);
    if (params.q) searchParams.set("q", params.q);
    if (params.priceMin) searchParams.set("price_min", params.priceMin);
    if (params.priceMax) searchParams.set("price_max", params.priceMax);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/console/listings?${searchParams}`, { signal: controller.signal });
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

      trackListingsViewed({ sort: params.sort, status: params.status, count: (data.items || []).length });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ sort, status, condition, q: debouncedQ, priceMin, priceMax });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, sort, status, condition, debouncedQ, priceMin, priceMax, fetchItems]);

  const setSort = useCallback(
    (newSort: string) => {
      setSortState(newSort);
      setItems([]);
      setNextCursor(null);
      syncUrl(newSort, status, condition, q, priceMin, priceMax);
      trackListingsFilterChanged({ sort: newSort });
    },
    [status, condition, q, priceMin, priceMax, syncUrl]
  );

  const setStatus = useCallback(
    (newStatus: string | null) => {
      setStatusState(newStatus);
      setItems([]);
      setNextCursor(null);
      syncUrl(sort, newStatus, condition, q, priceMin, priceMax);
      trackListingsFilterChanged({ status: newStatus });
    },
    [sort, condition, q, priceMin, priceMax, syncUrl]
  );

  const setCondition = useCallback(
    (newCondition: string | null) => {
      setConditionState(newCondition);
      setItems([]);
      setNextCursor(null);
      syncUrl(sort, status, newCondition, q, priceMin, priceMax);
      trackListingsFilterChanged({ condition: newCondition });
    },
    [sort, status, q, priceMin, priceMax, syncUrl]
  );

  const setQ = useCallback(
    (newQ: string) => {
      setQState(newQ);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (debouncedQRef.current !== newQ) {
          setItems([]);
          setNextCursor(null);
          setDebouncedQ(newQ);
        }
        syncUrl(sort, status, condition, newQ, priceMin, priceMax);
      }, SEARCH_DEBOUNCE_MS);
    },
    [sort, status, condition, priceMin, priceMax, syncUrl]
  );

  const setPriceMin = useCallback(
    (val: string) => {
      setPriceMinState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(sort, status, condition, q, val, priceMax);
    },
    [sort, status, condition, q, priceMax, syncUrl]
  );

  const setPriceMax = useCallback(
    (val: string) => {
      setPriceMaxState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(sort, status, condition, q, priceMin, val);
    },
    [sort, status, condition, q, priceMin, syncUrl]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ sort, status, condition, q: debouncedQ, priceMin, priceMax, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, sort, status, condition, debouncedQ, priceMin, priceMax, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ sort, status, condition, q: debouncedQ, priceMin, priceMax });
  }, [routerReady, isInitializedFromQuery, sort, status, condition, debouncedQ, priceMin, priceMax, fetchItems]);

  return {
    items,
    sort, setSort,
    status, setStatus,
    condition, setCondition,
    q, setQ,
    priceMin, setPriceMin,
    priceMax, setPriceMax,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
