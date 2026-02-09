import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { trackModerationViewed, trackModerationFilterChanged } from "./telemetry";

const PAGE_SIZE = 50;

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function parseFiltersFromQuery(query: Record<string, unknown>) {
  return {
    entityType: resolveQueryParam(query?.entity_type) || null,
    entityId: resolveQueryParam(query?.entity_id) || "",
    actionType: resolveQueryParam(query?.action_type) || null,
  };
}

export function useModerationActions() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [entityType, setEntityTypeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).entityType;
  });
  const [entityId, setEntityIdState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).entityId;
  });
  const [actionType, setActionTypeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).actionType;
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
    setEntityTypeState(parsed.entityType);
    setEntityIdState(parsed.entityId);
    setActionTypeState(parsed.actionType);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (eType: string | null, eId: string, aType: string | null) => {
      const query: Record<string, string> = {};
      if (eType) query.entity_type = eType;
      if (eId) query.entity_id = eId;
      if (aType) query.action_type = aType;
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
    if (params.entityType) searchParams.set("entity_type", params.entityType);
    if (params.entityId) searchParams.set("entity_id", params.entityId);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/console/moderation/actions?${searchParams}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const fetched = data.actions || [];

      // Client-side filter by action_type if provided
      const filtered = params.actionType
        ? fetched.filter((a: any) => a.action_type === params.actionType)
        : fetched;

      if (append) {
        setItems((prev) => [...prev, ...filtered]);
      } else {
        setItems(filtered);
      }
      setNextCursor(data.next_cursor || null);
      setFetchState("done");
      setLoadMoreState("idle");
      trackModerationViewed({ count: filtered.length });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ entityType, entityId, actionType });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, entityType, entityId, actionType, fetchItems]);

  const setEntityType = useCallback(
    (val: string | null) => {
      setEntityTypeState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(val, entityId, actionType);
      trackModerationFilterChanged({ entityType: val });
    },
    [entityId, actionType, syncUrl]
  );

  const setEntityId = useCallback(
    (val: string) => {
      setEntityIdState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(entityType, val, actionType);
    },
    [entityType, actionType, syncUrl]
  );

  const setActionType = useCallback(
    (val: string | null) => {
      setActionTypeState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(entityType, entityId, val);
      trackModerationFilterChanged({ actionType: val });
    },
    [entityType, entityId, syncUrl]
  );

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ entityType, entityId, actionType, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, entityType, entityId, actionType, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ entityType, entityId, actionType });
  }, [routerReady, isInitializedFromQuery, entityType, entityId, actionType, fetchItems]);

  return {
    items,
    entityType, setEntityType,
    entityId, setEntityId,
    actionType, setActionType,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
