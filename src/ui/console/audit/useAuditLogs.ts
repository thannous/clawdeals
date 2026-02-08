import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import {
  trackAuditViewed,
  trackAuditFilterApplied,
  trackAuditExportRequested,
  trackAuditExportSuccess,
  trackAuditExportError,
} from "./telemetry";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;
const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

function defaultFrom() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 16);
}

function defaultTo() {
  return new Date().toISOString().slice(0, 16);
}

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value as string | undefined;
}

function normalizeActorType(value: string | undefined | null) {
  if (!value) return null;
  // Back-compat: older UI used "human" but persisted audit rows use "owner".
  if (value === "human") return "owner";
  return value;
}

function parseFiltersFromQuery(query: Record<string, unknown>) {
  return {
    from: resolveQueryParam(query?.from) || defaultFrom(),
    to: resolveQueryParam(query?.to) || defaultTo(),
    actorType: normalizeActorType(resolveQueryParam(query?.actor_type) || null),
    actorId: resolveQueryParam(query?.actor_id) || "",
    actionName: resolveQueryParam(query?.action_name) || resolveQueryParam(query?.action) || null,
    entityType: resolveQueryParam(query?.entity_type) || null,
    entityId: resolveQueryParam(query?.entity_id) || "",
    outcome: resolveQueryParam(query?.outcome) || null,
  };
}

export function useAuditLogs() {
  const router = useRouter();
  const routerReady = router.isReady ?? true;

  const [from, setFromState] = useState(() => {
    if (!routerReady) return defaultFrom();
    return parseFiltersFromQuery(router.query).from;
  });
  const [to, setToState] = useState(() => {
    if (!routerReady) return defaultTo();
    return parseFiltersFromQuery(router.query).to;
  });
  const [actorType, setActorTypeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).actorType;
  });
  const [actorId, setActorIdState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).actorId;
  });
  const [debouncedActorId, setDebouncedActorId] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).actorId;
  });
  const [actionName, setActionNameState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).actionName;
  });
  const [entityType, setEntityTypeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).entityType;
  });
  const [entityId, setEntityIdState] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).entityId;
  });
  const [debouncedEntityId, setDebouncedEntityId] = useState(() => {
    if (!routerReady) return "";
    return parseFiltersFromQuery(router.query).entityId;
  });
  const [outcome, setOutcomeState] = useState<string | null>(() => {
    if (!routerReady) return null;
    return parseFiltersFromQuery(router.query).outcome;
  });
  const [timeRangeError, setTimeRangeError] = useState<string | null>(null);

  const [isInitializedFromQuery, setIsInitializedFromQuery] = useState(() => routerReady);

  const [items, setItems] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [loadMoreState, setLoadMoreState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const actorIdDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entityIdDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debouncedActorIdRef = useRef(debouncedActorId);
  const debouncedEntityIdRef = useRef(debouncedEntityId);

  useEffect(() => {
    debouncedActorIdRef.current = debouncedActorId;
  }, [debouncedActorId]);

  useEffect(() => {
    debouncedEntityIdRef.current = debouncedEntityId;
  }, [debouncedEntityId]);

  useEffect(() => {
    if (!routerReady || isInitializedFromQuery) return;
    const parsed = parseFiltersFromQuery(router.query);
    setFromState(parsed.from);
    setToState(parsed.to);
    setActorTypeState(parsed.actorType);
    setActorIdState(parsed.actorId);
    setDebouncedActorId(parsed.actorId);
    setActionNameState(parsed.actionName);
    setEntityTypeState(parsed.entityType);
    setEntityIdState(parsed.entityId);
    setDebouncedEntityId(parsed.entityId);
    setOutcomeState(parsed.outcome);
    setIsInitializedFromQuery(true);
  }, [routerReady, isInitializedFromQuery, router.query]);

  const syncUrl = useCallback(
    (f: string, t: string, aType: string | null, aId: string, action: string | null, eType: string | null, eId: string, out: string | null) => {
      const query: Record<string, string> = {};
      if (f) query.from = f;
      if (t) query.to = t;
      if (aType) query.actor_type = aType;
      if (aId) query.actor_id = aId;
      if (action) query.action_name = action;
      if (eType) query.entity_type = eType;
      if (eId) query.entity_id = eId;
      if (out) query.outcome = out;
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    },
    [router]
  );

  const validateTimeRange = useCallback((f: string, t: string): boolean => {
    if (!f || !t) {
      setTimeRangeError("Both from and to are required.");
      return false;
    }

    const fromDate = new Date(f);
    const toDate = new Date(t);
    const fromMs = fromDate.getTime();
    const toMs = toDate.getTime();
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      setTimeRangeError("from and to must be valid dates.");
      return false;
    }

    if (toMs <= fromMs) {
      setTimeRangeError("to must be after from.");
      return false;
    }

    if (toMs - fromMs > MAX_RANGE_MS) {
      setTimeRangeError("Time range too large. Max 7 days allowed.");
      return false;
    }
    setTimeRangeError(null);
    return true;
  }, []);

  const fetchItems = useCallback(async (params: any, append = false) => {
    if (!validateTimeRange(params.from, params.to)) {
      if (abortRef.current) abortRef.current.abort();
      return;
    }

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
    searchParams.set("from", new Date(params.from).toISOString());
    searchParams.set("to", new Date(params.to).toISOString());
    searchParams.set("limit", String(PAGE_SIZE));
    if (params.actorType) searchParams.set("actor_type", params.actorType);
    if (params.actorId) searchParams.set("actor_id", params.actorId);
    if (params.actionName) searchParams.set("action_name", params.actionName);
    if (params.entityType) searchParams.set("entity_type", params.entityType);
    if (params.entityId) searchParams.set("entity_id", params.entityId);
    if (params.outcome) searchParams.set("outcome", params.outcome);
    if (params.cursor) searchParams.set("cursor", params.cursor);

    try {
      const resp = await fetch(`/api/console/audit?${searchParams}`, { signal: controller.signal });
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

      trackAuditViewed({ count: (data.items || []).length, actorType: params.actorType, actionName: params.actionName });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
      setLoadMoreState("idle");
    }
  }, [validateTimeRange]);

  useEffect(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    if (!validateTimeRange(from, to)) {
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    fetchItems({ from, to, actorType, actorId: debouncedActorId, actionName, entityType, entityId: debouncedEntityId, outcome });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [routerReady, isInitializedFromQuery, from, to, actorType, debouncedActorId, actionName, entityType, debouncedEntityId, outcome, fetchItems, validateTimeRange]);

  const setFrom = useCallback(
    (val: string) => {
      setFromState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(val, to, actorType, actorId, actionName, entityType, entityId, outcome);
      trackAuditFilterApplied({ from: val });
    },
    [to, actorType, actorId, actionName, entityType, entityId, outcome, syncUrl]
  );

  const setTo = useCallback(
    (val: string) => {
      setToState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(from, val, actorType, actorId, actionName, entityType, entityId, outcome);
      trackAuditFilterApplied({ to: val });
    },
    [from, actorType, actorId, actionName, entityType, entityId, outcome, syncUrl]
  );

  const setActorType = useCallback(
    (val: string | null) => {
      setActorTypeState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(from, to, val, actorId, actionName, entityType, entityId, outcome);
      trackAuditFilterApplied({ actorType: val });
    },
    [from, to, actorId, actionName, entityType, entityId, outcome, syncUrl]
  );

  const setActorId = useCallback(
    (val: string) => {
      setActorIdState(val);
      if (actorIdDebounceRef.current) clearTimeout(actorIdDebounceRef.current);
      actorIdDebounceRef.current = setTimeout(() => {
        if (debouncedActorIdRef.current !== val) {
          setItems([]);
          setNextCursor(null);
          setDebouncedActorId(val);
        }
        syncUrl(from, to, actorType, val, actionName, entityType, entityId, outcome);
      }, DEBOUNCE_MS);
    },
    [from, to, actorType, actionName, entityType, entityId, outcome, syncUrl]
  );

  const setActionName = useCallback(
    (val: string | null) => {
      setActionNameState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(from, to, actorType, actorId, val, entityType, entityId, outcome);
      trackAuditFilterApplied({ actionName: val });
    },
    [from, to, actorType, actorId, entityType, entityId, outcome, syncUrl]
  );

  const setEntityType = useCallback(
    (val: string | null) => {
      setEntityTypeState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(from, to, actorType, actorId, actionName, val, entityId, outcome);
      trackAuditFilterApplied({ entityType: val });
    },
    [from, to, actorType, actorId, actionName, entityId, outcome, syncUrl]
  );

  const setEntityId = useCallback(
    (val: string) => {
      setEntityIdState(val);
      if (entityIdDebounceRef.current) clearTimeout(entityIdDebounceRef.current);
      entityIdDebounceRef.current = setTimeout(() => {
        if (debouncedEntityIdRef.current !== val) {
          setItems([]);
          setNextCursor(null);
          setDebouncedEntityId(val);
        }
        syncUrl(from, to, actorType, actorId, actionName, entityType, val, outcome);
      }, DEBOUNCE_MS);
    },
    [from, to, actorType, actorId, actionName, entityType, outcome, syncUrl]
  );

  const setOutcome = useCallback(
    (val: string | null) => {
      setOutcomeState(val);
      setItems([]);
      setNextCursor(null);
      syncUrl(from, to, actorType, actorId, actionName, entityType, entityId, val);
      trackAuditFilterApplied({ outcome: val });
    },
    [from, to, actorType, actorId, actionName, entityType, entityId, syncUrl]
  );

  useEffect(() => {
    return () => {
      if (actorIdDebounceRef.current) clearTimeout(actorIdDebounceRef.current);
      if (entityIdDebounceRef.current) clearTimeout(entityIdDebounceRef.current);
    };
  }, []);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchItems(
      { from, to, actorType, actorId: debouncedActorId, actionName, entityType, entityId: debouncedEntityId, outcome, cursor: nextCursor },
      true
    );
  }, [nextCursor, loadMoreState, from, to, actorType, debouncedActorId, actionName, entityType, debouncedEntityId, outcome, fetchItems]);

  const refetch = useCallback(() => {
    if (!routerReady || !isInitializedFromQuery) return;
    fetchItems({ from, to, actorType, actorId: debouncedActorId, actionName, entityType, entityId: debouncedEntityId, outcome });
  }, [routerReady, isInitializedFromQuery, from, to, actorType, debouncedActorId, actionName, entityType, debouncedEntityId, outcome, fetchItems]);

  const exportCsv = useCallback(async () => {
    if (!validateTimeRange(from, to)) {
      return;
    }
    const sp = new URLSearchParams();
    sp.set("from", new Date(from).toISOString());
    sp.set("to", new Date(to).toISOString());
    sp.set("format", "csv");
    if (actorType) sp.set("actor_type", actorType);
    if (actorId) sp.set("actor_id", actorId);
    if (actionName) sp.set("action_name", actionName);
    if (entityType) sp.set("entity_type", entityType);
    if (entityId) sp.set("entity_id", entityId);
    if (outcome) sp.set("outcome", outcome);
    trackAuditExportRequested({ format: "csv" });
    try {
      const resp = await fetch(`/api/console/audit/export?${sp}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-export-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      trackAuditExportSuccess({ format: "csv" });
    } catch (err: any) {
      trackAuditExportError({ error: err.message });
    }
  }, [from, to, actorType, actorId, actionName, entityType, entityId, outcome, validateTimeRange]);

  return {
    items,
    from, setFrom,
    to, setTo,
    actorType, setActorType,
    actorId, setActorId,
    actionName, setActionName,
    entityType, setEntityType,
    entityId, setEntityId,
    outcome, setOutcome,
    timeRangeError,
    nextCursor, fetchState, loadMoreState, error,
    loadMore, refetch, exportCsv,
  };
}
