import { useState, useEffect, useRef, useCallback } from "react";
import { getPublicSseBaseUrl, joinUrl } from "../../shared/urls";

const MAX_EVENTS = 500;
const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;
const LAST_EVENT_ID_STORAGE_KEY = "console_sse_last_event_id";
const STREAM_ID_RE = /^\\d+-\\d+$/;

type BuildUrlParams = {
  baseUrl?: string;
  types?: string[];
  entityId?: string;
  replay?: boolean;
  heartbeat?: number;
  lastEventId?: string | null;
  asMessage?: boolean;
};

type UseSseStreamOptions = {
  types?: string[];
  entityId?: string;
  replay?: boolean;
  heartbeat?: number;
};

function isStreamId(value) {
  return typeof value === "string" && STREAM_ID_RE.test(value);
}

function safeGetStoredLastEventId() {
  try {
    return globalThis?.localStorage?.getItem(LAST_EVENT_ID_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

function safeSetStoredLastEventId(value) {
  try {
    if (!value) return;
    globalThis?.localStorage?.setItem(LAST_EVENT_ID_STORAGE_KEY, String(value));
  } catch {
    // Ignore storage errors (private mode, disabled storage, etc.)
  }
}

function buildUrl({ baseUrl, types, entityId, replay, heartbeat, lastEventId, asMessage }: BuildUrlParams) {
  const params = new URLSearchParams();
  if (types && types.length > 0) {
    params.set("types", types.join(","));
  }
  if (entityId) {
    params.set("entity_id", entityId);
  }
  if (replay) {
    params.set("replay", "true");
  }
  if (lastEventId) {
    params.set("last_event_id", String(lastEventId));
  }
  if (asMessage) {
    params.set("as_message", "true");
  }
  if (heartbeat !== undefined && heartbeat !== null) {
    params.set("heartbeat", String(heartbeat));
  }
  const qs = params.toString();
  const path = `/api/console/events/stream${qs ? `?${qs}` : ""}`;
  return baseUrl ? joinUrl(baseUrl, path) : path;
}

export function useSseStream({ types, entityId, replay = true, heartbeat }: UseSseStreamOptions = {}) {
  const [events, setEvents] = useState([]);
  const [connectionState, setConnectionState] = useState("connecting");
  const [missedCount, setMissedCount] = useState(0);
  const [paused, setPaused] = useState(false);

  const pausedRef = useRef(false);
  const bufferRef = useRef([]);
  const lastEventIdRef = useRef(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const reconnectTimerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const mountedRef = useRef(true);
  const connectRef = useRef(null);

  const addEvents = useCallback((newEvents) => {
    setEvents((prev) => {
      const merged = [...prev, ...newEvents];
      if (merged.length > MAX_EVENTS) {
        return merged.slice(merged.length - MAX_EVENTS);
      }
      return merged;
    });
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Ensure we never keep multiple EventSource connections alive.
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const storedLastEventId = safeGetStoredLastEventId();
    const sseBaseUrl = getPublicSseBaseUrl();
    const url = buildUrl({
      baseUrl: sseBaseUrl || undefined,
      types,
      entityId,
      replay,
      heartbeat,
      // Provide a cursor for initial connections (EventSource can't set headers),
      // while still letting the browser-managed Last-Event-ID header take over
      // for automatic reconnects.
      lastEventId: lastEventIdRef.current || storedLastEventId || null,
      asMessage: true
    });
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState("connected");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnectionState("reconnecting");

      // Prefer browser-managed reconnection (keeps Last-Event-ID). Only fall back
      // to a manual reconnect if the EventSource is fully closed.
      if (es.readyState === 2) {
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            // Call the latest connect() to avoid stale closure issues.
            connectRef.current?.();
          }
        }, delay);
      }
    };

    function handleEvent(e) {
      if (!mountedRef.current) return;

      let parsed;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }

      // Only persist a replay cursor if it looks like a real stream id.
      // This avoids storing non-stream ids (e.g. sse.gap uses "gap-<ts>").
      const cursorId = isStreamId(e.lastEventId)
        ? e.lastEventId
        : isStreamId(parsed?.id)
          ? parsed.id
          : null;
      if (cursorId) {
        lastEventIdRef.current = cursorId;
        safeSetStoredLastEventId(cursorId);
      }

      const event = {
        id: parsed.id || e.lastEventId || `${Date.now()}-${Math.random()}`,
        type: parsed.type || "unknown",
        ts: parsed.ts || new Date().toISOString(),
        actor: parsed.actor || null,
        entity: parsed.entity || null,
        payload: parsed.payload || {},
        payload_truncated: parsed.payload_truncated || false,
        raw: parsed
      };

      if (pausedRef.current) {
        bufferRef.current.push(event);
        setMissedCount((c) => c + 1);
      } else {
        addEvents([event]);
      }
    }

    es.addEventListener("message", handleEvent);
  }, [types, entityId, replay, heartbeat, addEvents]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    if (bufferRef.current.length > 0) {
      addEvents(bufferRef.current);
      bufferRef.current = [];
    }
    setMissedCount(0);
  }, [addEvents]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  return {
    events,
    connectionState,
    missedCount,
    pause,
    resume,
    paused
  };
}
