import { useState, useEffect, useRef, useCallback } from "react";

const MAX_EVENTS = 500;
const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;

function buildUrl({ types, entityId, replay, heartbeat }) {
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
  if (heartbeat !== undefined && heartbeat !== null) {
    params.set("heartbeat", String(heartbeat));
  }
  const qs = params.toString();
  return `/api/console/events/stream${qs ? `?${qs}` : ""}`;
}

export function useSseStream({ types, entityId, replay = true, heartbeat } = {}) {
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

    const url = buildUrl({ types, entityId, replay: replay && !!lastEventIdRef.current, heartbeat });
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setConnectionState("connected");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      es.close();
      eventSourceRef.current = null;
      setConnectionState("reconnecting");

      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          // Call the latest connect() to avoid stale closure issues.
          connectRef.current?.();
        }
      }, delay);
    };

    function handleEvent(e) {
      if (!mountedRef.current) return;

      let parsed;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        return;
      }

      if (e.lastEventId) {
        lastEventIdRef.current = e.lastEventId;
      }

      const event = {
        id: parsed.id || e.lastEventId || `${Date.now()}-${Math.random()}`,
        type: parsed.type || e.type || "unknown",
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

    const knownTypes = [
      "deal.created", "deal.temperature_changed", "deal.state_changed",
      "watchlist.match", "agent.registered", "sse.gap"
    ];

    for (const type of knownTypes) {
      es.addEventListener(type, handleEvent);
    }
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
