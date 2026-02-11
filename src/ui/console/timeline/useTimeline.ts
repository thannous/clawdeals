import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { trackTimelineViewed, trackTimelineSearched } from "./telemetry";

const PAGE_SIZE = 200;
const DEBOUNCE_MS = 300;

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

export function useTimeline() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [entityType, setEntityTypeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return resolveQueryParam(router.query?.entity_type) || null;
  });
  const [entityId, setEntityIdState] = useState(() => {
    if (!routerReady) return "";
    return resolveQueryParam(router.query?.entity_id) || "";
  });
  const [debouncedEntityId, setDebouncedEntityId] = useState(() => {
    if (!routerReady) return "";
    return resolveQueryParam(router.query?.entity_id) || "";
  });
  const [includeCorrelated, setIncludeCorrelatedState] = useState(() => {
    if (!routerReady) return true;
    const val = resolveQueryParam(router.query?.include_correlated);
    return val !== "false";
  });

  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [loadMoreState, setLoadMoreState] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [correlation, setCorrelation] = useState<{
    request_ids: string[];
    idempotency_keys: string[];
    correlated_entity_count: number;
  } | null>(null);

  const entityIdDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debouncedEntityIdRef = useRef(debouncedEntityId);

  useEffect(() => {
    debouncedEntityIdRef.current = debouncedEntityId;
  }, [debouncedEntityId]);

  // Hydrate from query params once router is ready
  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    setEntityTypeState(resolveQueryParam(router.query?.entity_type) || null);
    const eid = resolveQueryParam(router.query?.entity_id) || "";
    setEntityIdState(eid);
    setDebouncedEntityId(eid);
    const ic = resolveQueryParam(router.query?.include_correlated);
    setIncludeCorrelatedState(ic !== "false");
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (eType: string | null, eId: string, incCorr: boolean) => {
      const query: Record<string, string> = {};
      if (eType) query.entity_type = eType;
      if (eId) query.entity_id = eId;
      if (!incCorr) query.include_correlated = "false";
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  const fetchItems = useCallback(async (params: { entityType: string; entityId: string; includeCorrelated: boolean; cursor?: string }, append = false) => {
    if (!params.entityType || !params.entityId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) {
      setFetchState("loading");
      setError(null);
    } else {
      setLoadMoreState("loading");
    }

    try {
      const sp = new URLSearchParams();
      sp.set("entity_type", params.entityType);
      sp.set("entity_id", params.entityId);
      sp.set("include_correlated", String(params.includeCorrelated));
      sp.set("limit", String(PAGE_SIZE));
      if (params.cursor) sp.set("cursor", params.cursor);

      const resp = await fetch(`/api/console/timeline?${sp}`, { signal: controller.signal });
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
      setCorrelation(data.correlation || null);
      setFetchState("done");
      setLoadMoreState("idle");

      trackTimelineViewed({ count: (data.items || []).length, entityType: params.entityType });
    } catch (err: any) {
      if (err.name === "AbortError") {
        if (abortRef.current === controller) {
          if (!append) setFetchState("idle");
          setLoadMoreState("idle");
        }
        return;
      }
      setError(err.message || String(err));
      if (!append) setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  // Auto-fetch when both entityType and entityId are filled
  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    if (!entityType || !debouncedEntityId) {
      setItems([]);
      setNextCursor(null);
      setCorrelation(null);
      setFetchState("idle");
      return;
    }
    fetchItems({ entityType, entityId: debouncedEntityId, includeCorrelated });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, entityType, debouncedEntityId, includeCorrelated, fetchItems]);

  const setEntityType = useCallback(
    (val: string | null) => {
      setEntityTypeState(val);
      setItems([]);
      setNextCursor(null);
      setCorrelation(null);
      syncUrl(val, entityId, includeCorrelated);
      trackTimelineSearched({ entityType: val });
    },
    [entityId, includeCorrelated, syncUrl]
  );

  const setEntityId = useCallback(
    (val: string) => {
      setEntityIdState(val);
      if (entityIdDebounceRef.current) clearTimeout(entityIdDebounceRef.current);
      entityIdDebounceRef.current = setTimeout(() => {
        if (debouncedEntityIdRef.current !== val) {
          setItems([]);
          setNextCursor(null);
          setCorrelation(null);
          setDebouncedEntityId(val);
        }
        syncUrl(entityType, val, includeCorrelated);
      }, DEBOUNCE_MS);
    },
    [entityType, includeCorrelated, syncUrl]
  );

  const setIncludeCorrelated = useCallback(
    (val: boolean) => {
      setIncludeCorrelatedState(val);
      setItems([]);
      setNextCursor(null);
      setCorrelation(null);
      syncUrl(entityType, entityId, val);
    },
    [entityType, entityId, syncUrl]
  );

  useEffect(() => {
    return () => {
      if (entityIdDebounceRef.current) clearTimeout(entityIdDebounceRef.current);
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading" || !entityType || !debouncedEntityId) return;
    fetchItems({ entityType, entityId: debouncedEntityId, includeCorrelated, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, entityType, debouncedEntityId, includeCorrelated, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery || !entityType || !debouncedEntityId) return;
    fetchItems({ entityType, entityId: debouncedEntityId, includeCorrelated });
  }, [routerReady, isInitializedFromQuery, entityType, debouncedEntityId, includeCorrelated, fetchItems]);

  return {
    entityType, setEntityType,
    entityId, setEntityId,
    includeCorrelated, setIncludeCorrelated,
    items, nextCursor, fetchState, loadMoreState, error,
    correlation,
    loadMore, refetch,
  };
}
