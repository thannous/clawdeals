import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { trackReportsViewed, trackReportsFilterChanged } from "./telemetry";

const PAGE_SIZE = 50;
const DEFAULT_STATUS = "UNCONFIRMED";

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function parseFiltersFromQuery(query: Record<string, unknown>) {
  const status = resolveQueryParam(query?.status) || DEFAULT_STATUS;
  const entityType = resolveQueryParam(query?.entity_type) || null;
  const reasonCode = resolveQueryParam(query?.reason_code) || null;
  const reporterOwnerId = resolveQueryParam(query?.reporter_owner_id) || "";
  return { status, entityType, reasonCode, reporterOwnerId };
}

export function useReports() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [status, setStatusVal] = useState(() => {
    if (!routerReady) return DEFAULT_STATUS;
    return parseFiltersFromQuery(router.query).status;
  });
  const [entityType, setEntityTypeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).entityType;
  });
  const [reasonCode, setReasonCodeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).reasonCode;
  });
  const [reporterOwnerId, setReporterOwnerIdState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).reporterOwnerId;
  });

  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [loadMoreState, setLoadMoreState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    const parsed = parseFiltersFromQuery(router.query);
    setStatusVal(parsed.status);
    setEntityTypeState(parsed.entityType);
    setReasonCodeState(parsed.reasonCode);
    setReporterOwnerIdState(parsed.reporterOwnerId);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (st: string, et: string | null, rc: string | null, roi: string) => {
      const query: Record<string, string> = {};
      if (st && st !== DEFAULT_STATUS) query.status = st;
      if (et) query.entity_type = et;
      if (rc) query.reason_code = rc;
      if (roi) query.reporter_owner_id = roi;
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
    if (params.status) searchParams.set("status", params.status);
    if (params.entityType) searchParams.set("entity_type", params.entityType);
    if (params.reasonCode) searchParams.set("reason_code", params.reasonCode);
    if (params.reporterOwnerId) searchParams.set("reporter_owner_id", params.reporterOwnerId);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/console/reports?${searchParams}`, { signal: controller.signal });
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
      trackReportsViewed({ status: params.status, count: (data.items || []).length });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, []);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ status, entityType, reasonCode, reporterOwnerId });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, status, entityType, reasonCode, reporterOwnerId, fetchItems]);

  const setStatus = useCallback(
    (val: string) => {
      setStatusVal(val);
      setItems([]);
      setNextCursor(null);
      setSelectedIds(new Set());
      syncUrl(val, entityType, reasonCode, reporterOwnerId);
      trackReportsFilterChanged({ status: val });
    },
    [entityType, reasonCode, reporterOwnerId, syncUrl]
  );

  const setEntityType = useCallback(
    (val: string | null) => {
      setEntityTypeState(val);
      setItems([]);
      setNextCursor(null);
      setSelectedIds(new Set());
      syncUrl(status, val, reasonCode, reporterOwnerId);
      trackReportsFilterChanged({ entityType: val });
    },
    [status, reasonCode, reporterOwnerId, syncUrl]
  );

  const setReasonCode = useCallback(
    (val: string | null) => {
      setReasonCodeState(val);
      setItems([]);
      setNextCursor(null);
      setSelectedIds(new Set());
      syncUrl(status, entityType, val, reporterOwnerId);
      trackReportsFilterChanged({ reasonCode: val });
    },
    [status, entityType, reporterOwnerId, syncUrl]
  );

  const setReporterOwnerId = useCallback(
    (val: string) => {
      setReporterOwnerIdState(val);
      setItems([]);
      setNextCursor(null);
      setSelectedIds(new Set());
      syncUrl(status, entityType, reasonCode, val);
      trackReportsFilterChanged({ reporterOwnerId: val });
    },
    [status, entityType, reasonCode, syncUrl]
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((currentPageIds: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = currentPageIds.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        currentPageIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      currentPageIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems({ status, entityType, reasonCode, reporterOwnerId, cursor: nextCursor }, true);
  }, [nextCursor, loadMoreState, status, entityType, reasonCode, reporterOwnerId, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ status, entityType, reasonCode, reporterOwnerId });
  }, [routerReady, isInitializedFromQuery, status, entityType, reasonCode, reporterOwnerId, fetchItems]);

  return {
    items,
    status, setStatus,
    entityType, setEntityType,
    reasonCode, setReasonCode,
    reporterOwnerId, setReporterOwnerId,
    selectedIds, toggleSelection, toggleSelectAll, clearSelection,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch,
  };
}
