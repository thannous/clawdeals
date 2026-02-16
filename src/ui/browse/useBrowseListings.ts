import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { getPublicApiBaseUrl, joinUrl } from "../../shared/urls";

const DEFAULT_SORT = "recent";
const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;

function resolveParam(value: unknown): string {
  if (Array.isArray(value)) return value[0] || "";
  return (value as string) || "";
}

function parseBrowseFiltersFromQuery(query: any) {
  const sortRaw = resolveParam(query?.sort);
  const sort =
    sortRaw === "recent" || sortRaw === "price_asc" || sortRaw === "price_desc"
      ? sortRaw
      : DEFAULT_SORT;
  const q = resolveParam(query?.q);
  const category = resolveParam(query?.category);
  const condition = resolveParam(query?.condition);
  const priceMin = resolveParam(query?.price_min);
  const priceMax = resolveParam(query?.price_max);
  return { sort, q, category, condition, priceMin, priceMax };
}

export function useBrowseListings({
  initialListings,
  initialNextCursor,
}: {
  initialListings: any[];
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
  const [category, setCategoryState] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).category;
  });
  const [debouncedCategory, setDebouncedCategory] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).category;
  });
  const [condition, setConditionState] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).condition;
  });
  const [priceMin, setPriceMinState] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).priceMin;
  });
  const [debouncedPriceMin, setDebouncedPriceMin] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).priceMin;
  });
  const [priceMax, setPriceMaxState] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).priceMax;
  });
  const [debouncedPriceMax, setDebouncedPriceMax] = useState(() => {
    if (!routerReady) return "";
    return parseBrowseFiltersFromQuery(router.query).priceMax;
  });

  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  // Hydrate with SSR data — skip the first client-side fetch
  const isHydratedRef = useRef(true);
  const [listings, setListings] = useState(initialListings);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [fetchState, setFetchState] = useState<string>("done");
  const [loadMoreState, setLoadMoreState] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceMinDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceMaxDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debouncedQRef = useRef(debouncedQ);
  const debouncedCategoryRef = useRef(debouncedCategory);
  const debouncedPriceMinRef = useRef(debouncedPriceMin);
  const debouncedPriceMaxRef = useRef(debouncedPriceMax);

  useEffect(() => {
    debouncedQRef.current = debouncedQ;
  }, [debouncedQ]);

  useEffect(() => {
    debouncedCategoryRef.current = debouncedCategory;
  }, [debouncedCategory]);

  useEffect(() => {
    debouncedPriceMinRef.current = debouncedPriceMin;
  }, [debouncedPriceMin]);

  useEffect(() => {
    debouncedPriceMaxRef.current = debouncedPriceMax;
  }, [debouncedPriceMax]);

  // Sync from URL once router is ready
  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    const parsed = parseBrowseFiltersFromQuery(router.query);
    setSortState(parsed.sort);
    setQState(parsed.q);
    setDebouncedQ(parsed.q);
    setCategoryState(parsed.category);
    setDebouncedCategory(parsed.category);
    setConditionState(parsed.condition);
    setPriceMinState(parsed.priceMin);
    setDebouncedPriceMin(parsed.priceMin);
    setPriceMaxState(parsed.priceMax);
    setDebouncedPriceMax(parsed.priceMax);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  // Sync state to URL
  const syncUrl = useCallback(
    (newSort: string, newQ: string, newCategory: string, newCondition: string, newPriceMin: string, newPriceMax: string) => {
      const query: Record<string, string> = {};
      if (newSort && newSort !== DEFAULT_SORT) query.sort = newSort;
      if (newQ) query.q = newQ;
      if (newCategory) query.category = newCategory;
      if (newCondition) query.condition = newCondition;
      if (newPriceMin) query.price_min = newPriceMin;
      if (newPriceMax) query.price_max = newPriceMax;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  // Fetch listings from public API
  const fetchListings = useCallback(async (params: any, append = false) => {
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
    if (params.category) searchParams.set("category", params.category);
    if (params.condition) searchParams.set("condition", params.condition);
    if (params.priceMin) searchParams.set("price_min", params.priceMin);
    if (params.priceMax) searchParams.set("price_max", params.priceMax);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    const apiBase = getPublicApiBaseUrl();
    const endpoint = apiBase
      ? joinUrl(apiBase, `/api/v1/public/listings?${searchParams}`)
      : `/api/v1/public/listings?${searchParams}`;

    try {
      const resp = await fetch(endpoint, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      if (append) {
        setListings((prev) => [...prev, ...(data.data || [])]);
      } else {
        setListings(data.data || []);
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
    fetchListings({ sort, q: debouncedQ, category: debouncedCategory, condition, priceMin: debouncedPriceMin, priceMax: debouncedPriceMax });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, sort, debouncedQ, debouncedCategory, condition, debouncedPriceMin, debouncedPriceMax, fetchListings]);

  // Setters with URL sync
  const setSort = useCallback(
    (newSort: string) => {
      setSortState(newSort);
      setListings([]);
      setNextCursor(null);
      syncUrl(newSort, q, category, condition, priceMin, priceMax);
    },
    [q, category, condition, priceMin, priceMax, syncUrl]
  );

  const setQ = useCallback(
    (newQ: string) => {
      setQState(newQ);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (debouncedQRef.current !== newQ) {
          setListings([]);
          setNextCursor(null);
          setDebouncedQ(newQ);
        }
        syncUrl(sort, newQ, category, condition, priceMin, priceMax);
      }, SEARCH_DEBOUNCE_MS);
    },
    [sort, category, condition, priceMin, priceMax, syncUrl]
  );

  const setCategory = useCallback(
    (newCategory: string) => {
      setCategoryState(newCategory);
      if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
      categoryDebounceRef.current = setTimeout(() => {
        if (debouncedCategoryRef.current !== newCategory) {
          setListings([]);
          setNextCursor(null);
          setDebouncedCategory(newCategory);
        }
        syncUrl(sort, q, newCategory, condition, priceMin, priceMax);
      }, SEARCH_DEBOUNCE_MS);
    },
    [sort, q, condition, priceMin, priceMax, syncUrl]
  );

  const setCondition = useCallback(
    (newCondition: string) => {
      setConditionState(newCondition);
      setListings([]);
      setNextCursor(null);
      syncUrl(sort, q, category, newCondition, priceMin, priceMax);
    },
    [sort, q, category, priceMin, priceMax, syncUrl]
  );

  const setPriceMin = useCallback(
    (val: string) => {
      setPriceMinState(val);
      if (priceMinDebounceRef.current) clearTimeout(priceMinDebounceRef.current);
      priceMinDebounceRef.current = setTimeout(() => {
        if (debouncedPriceMinRef.current !== val) {
          setListings([]);
          setNextCursor(null);
          setDebouncedPriceMin(val);
        }
        syncUrl(sort, q, category, condition, val, priceMax);
      }, SEARCH_DEBOUNCE_MS);
    },
    [sort, q, category, condition, priceMax, syncUrl]
  );

  const setPriceMax = useCallback(
    (val: string) => {
      setPriceMaxState(val);
      if (priceMaxDebounceRef.current) clearTimeout(priceMaxDebounceRef.current);
      priceMaxDebounceRef.current = setTimeout(() => {
        if (debouncedPriceMaxRef.current !== val) {
          setListings([]);
          setNextCursor(null);
          setDebouncedPriceMax(val);
        }
        syncUrl(sort, q, category, condition, priceMin, val);
      }, SEARCH_DEBOUNCE_MS);
    },
    [sort, q, category, condition, priceMin, syncUrl]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
      if (priceMinDebounceRef.current) clearTimeout(priceMinDebounceRef.current);
      if (priceMaxDebounceRef.current) clearTimeout(priceMaxDebounceRef.current);
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchListings(
      { sort, q: debouncedQ, category: debouncedCategory, condition, priceMin: debouncedPriceMin, priceMax: debouncedPriceMax, cursor: nextCursor },
      true
    );
  }, [nextCursor, loadMoreState, sort, debouncedQ, debouncedCategory, condition, debouncedPriceMin, debouncedPriceMax, fetchListings]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchListings({ sort, q: debouncedQ, category: debouncedCategory, condition, priceMin: debouncedPriceMin, priceMax: debouncedPriceMax });
  }, [routerReady, isInitializedFromQuery, sort, debouncedQ, debouncedCategory, condition, debouncedPriceMin, debouncedPriceMax, fetchListings]);

  return {
    listings,
    sort,
    setSort,
    q,
    setQ,
    category,
    setCategory,
    condition,
    setCondition,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    nextCursor,
    fetchState,
    loadMoreState,
    error,
    loadMore,
    refetch,
  };
}
