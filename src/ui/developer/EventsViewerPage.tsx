import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { getStoredApiKey, getStoredLastEventId, setStoredLastEventId, clearStoredLastEventId } from "./storage";
import { SseParser } from "./sse-parser";
import { buildApiUrl } from "./api";
import PageHeader from "../shared/PageHeader";
import AppNav from "../shared/AppNav";

type UiEvent = {
  id: string;
  event: string;
  dataRaw: string;
  parsed: any | null;
  ts: string;
};

const MAX_EVENTS = 500;
const MAX_RECONNECT_DELAY_MS = 30000;
const INITIAL_RECONNECT_DELAY_MS = 1000;

function nowIso() {
  return new Date().toISOString();
}

function buildStreamUrl({ lastEventId }: { lastEventId?: string | null }) {
  const params = new URLSearchParams();
  params.set("replay", "true");
  params.set("as_message", "true");
  params.set("heartbeat", "15");
  if (lastEventId) params.set("last_event_id", lastEventId);
  return buildApiUrl(`/v1/events/stream?${params.toString()}`);
}

type EventsViewerState = {
  apiKey: string | null;
  connected: boolean;
  connectionState: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  events: UiEvent[];
  error: string;
  paused: boolean;
  missedCount: number;
  typeFilter: string;
};

type EventsViewerAction =
  | { type: "patch"; patch: Partial<EventsViewerState> }
  | { type: "appendEvents"; incoming: UiEvent[] }
  | { type: "clearEvents" }
  | { type: "incrementMissed" }
  | { type: "resetMissed" };

const INITIAL_STATE: EventsViewerState = {
  apiKey: null,
  connected: false,
  connectionState: "idle",
  events: [],
  error: "",
  paused: false,
  missedCount: 0,
  typeFilter: ""
};

function eventsViewerReducer(state: EventsViewerState, action: EventsViewerAction): EventsViewerState {
  switch (action.type) {
    case "patch":
      return { ...state, ...action.patch };
    case "appendEvents": {
      const merged = [...state.events, ...action.incoming];
      return {
        ...state,
        events: merged.length > MAX_EVENTS ? merged.slice(merged.length - MAX_EVENTS) : merged
      };
    }
    case "clearEvents":
      return { ...state, events: [] };
    case "incrementMissed":
      return { ...state, missedCount: state.missedCount + 1 };
    case "resetMissed":
      return { ...state, missedCount: 0 };
    default:
      return state;
  }
}

export default function EventsViewerPage() {
  const [state, dispatch] = useReducer(eventsViewerReducer, INITIAL_STATE);

  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<any>(null);
  const reconnectDelayRef = useRef<number>(INITIAL_RECONNECT_DELAY_MS);
  const pausedRef = useRef(false);
  const bufferRef = useRef<UiEvent[]>([]);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    dispatch({ type: "patch", patch: { apiKey: getStoredApiKey() } });
    lastEventIdRef.current = getStoredLastEventId();
  }, []);

  const filtered = useMemo(() => {
    const q = state.typeFilter.trim().toLowerCase();
    if (!q) return state.events;
    return state.events.filter((e) => String(e.parsed?.type || e.event || "").toLowerCase().includes(q));
  }, [state.events, state.typeFilter]);

  const addEvents = useCallback((incoming: UiEvent[]) => {
    dispatch({ type: "appendEvents", incoming });
  }, []);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    dispatch({ type: "patch", patch: { connected: false, connectionState: "idle" } });
  }, []);

  const connect = useCallback(async () => {
    if (!state.apiKey) {
      dispatch({
        type: "patch",
        patch: {
          connectionState: "error",
          error: "Missing API key. Go to /start."
        }
      });
      return;
    }

    dispatch({
      type: "patch",
      patch: {
        error: "",
        connectionState: state.connected ? "reconnecting" : "connecting",
        connected: true
      }
    });

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const parser = new SseParser();
    const lastEventId = lastEventIdRef.current || null;
    const url = buildStreamUrl({ lastEventId });

    try {
      const res = await fetch(url, {
        method: "GET",
          signal: abort.signal,
          headers: {
          Authorization: `Bearer ${state.apiKey}`,
          Accept: "text/event-stream"
        }
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const msg = payload?.error?.message || `Stream failed (${res.status})`;
        throw new Error(msg);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("text/event-stream")) {
        throw new Error("Invalid stream response (missing text/event-stream).");
      }

      dispatch({ type: "patch", patch: { connectionState: "connected" } });
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Stream body is not readable.");
      }

      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (abort.signal.aborted) break;
        const text = decoder.decode(value, { stream: true });
        const frames = parser.feed(text);
        if (frames.length === 0) continue;

        const uiEvents: UiEvent[] = [];
        for (const frame of frames) {
          let parsed: any = null;
          try {
            parsed = frame.data ? JSON.parse(frame.data) : null;
          } catch {
            parsed = null;
          }

          const cursorId = frame.id || parsed?.id || null;
          if (cursorId && typeof cursorId === "string") {
            lastEventIdRef.current = cursorId;
            setStoredLastEventId(cursorId);
          }

          const ev: UiEvent = {
            id: String(parsed?.id || frame.id || `${Date.now()}-${Math.random()}`),
            event: frame.event || "message",
            dataRaw: frame.data,
            parsed,
            ts: parsed?.ts || nowIso()
          };

          if (pausedRef.current) {
            bufferRef.current.push(ev);
            dispatch({ type: "incrementMissed" });
          } else {
            uiEvents.push(ev);
          }
        }

        if (uiEvents.length > 0) addEvents(uiEvents);
      }

      if (!abort.signal.aborted) {
        throw new Error("Stream closed.");
      }
    } catch (e: any) {
      if (abort.signal.aborted) return;
      dispatch({
        type: "patch",
        patch: {
          connectionState: "reconnecting",
          error: e?.message || "Stream error."
        }
      });

      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    }
  }, [state.apiKey, state.connected, addEvents]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const handlePauseToggle = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    dispatch({ type: "patch", patch: { paused: pausedRef.current } });
    if (!pausedRef.current && bufferRef.current.length > 0) {
      addEvents(bufferRef.current);
      bufferRef.current = [];
      dispatch({ type: "resetMissed" });
    }
  }, [addEvents]);

  const handleClearCursor = useCallback(() => {
    lastEventIdRef.current = null;
    clearStoredLastEventId();
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <PageHeader
        title="EVENTS"
        containerClassName="max-w-6xl mx-auto px-4 py-4"
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link href="/developer" className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong">
              Dashboard
            </Link>
            <button
              onClick={() => connect()}
              disabled={!state.apiKey || state.connectionState === "connecting" || state.connectionState === "connected"}
              className={`border px-3 py-1 text-xs font-mono ${
                state.connectionState === "connected"
                  ? "border-success text-success"
                  : "border-primary text-primary hover:bg-primary hover:text-bg"
              }`}
            >
              {state.connectionState === "connected" ? "Connected" : "Connect"}
            </button>
            <button
              onClick={disconnect}
              className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong"
              disabled={!state.connected}
            >
              Disconnect
            </button>
            <button
              onClick={handlePauseToggle}
              className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong"
              disabled={!state.connected}
            >
              {state.paused ? `Resume (${state.missedCount})` : "Pause"}
            </button>
            <button
              onClick={() => dispatch({ type: "clearEvents" })}
              className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong"
            >
              Clear
            </button>
            <button
              onClick={handleClearCursor}
              className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong"
            >
              Reset cursor
            </button>
            <input
              value={state.typeFilter}
              onChange={(e) => dispatch({ type: "patch", patch: { typeFilter: e.target.value } })}
              placeholder="filter: watchlist.match"
              aria-label="Filter event type"
              name="type_filter"
              autoComplete="off"
              spellCheck={false}
              className="h-8 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            />
          </div>
        }
      >
        <AppNav current="developer" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        {!state.apiKey && (
          <div className="border border-border bg-bg p-5 text-xs font-mono text-subtle">
            Missing API key. Go to <Link href="/start" className="text-primary hover:underline">/start</Link>.
          </div>
        )}

        {state.error && (
          <div className="border border-error/50 bg-error/5 p-4 text-xs font-mono text-error-muted">
            {state.error}
          </div>
        )}

        <div className="border border-border bg-surface p-4 text-xs font-mono text-subtle flex flex-wrap gap-4 items-center">
          <span>
            state: <span className="text-text">{state.connectionState}</span>
          </span>
          <span>
            events: <span className="text-text">{state.events.length}</span>
          </span>
          <span>
            cursor: <span className="text-text">{lastEventIdRef.current || "none"}</span>
          </span>
        </div>

        <div className="border border-border bg-bg overflow-hidden">
          <div className="grid grid-cols-12 gap-0 border-b border-border bg-surface-alt text-xs font-mono uppercase tracking-widest text-subtle">
            <div className="col-span-3 px-3 py-2">Type</div>
            <div className="col-span-3 px-3 py-2">Entity</div>
            <div className="col-span-4 px-3 py-2">ID</div>
            <div className="col-span-2 px-3 py-2">TS</div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-6 text-xs font-mono text-subtle">No events yet.</div>
            ) : (
              filtered
                .slice()
                .reverse()
                .map((e) => {
                  const type = e.parsed?.type || e.event || "message";
                  const entityType = e.parsed?.entity?.type || "";
                  const entityId = e.parsed?.entity?.id || "";
                  return (
                    <details key={e.id} className="border-b border-border">
                      <summary className="grid grid-cols-12 gap-0 cursor-pointer hover:bg-surface px-0">
                        <div className="col-span-3 px-3 py-2 text-xs font-mono text-text">{type}</div>
                        <div className="col-span-3 px-3 py-2 text-xs font-mono text-muted">
                          {entityType ? `${entityType}:${entityId}` : "-"}
                        </div>
                        <div className="col-span-4 px-3 py-2 text-xs font-mono text-muted truncate">{e.id}</div>
                        <div className="col-span-2 px-3 py-2 text-xs font-mono text-subtle truncate">
                          {String(e.ts).replace("T", " ").replace("Z", "")}
                        </div>
                      </summary>
                      <div className="p-3 bg-surface">
                        <pre className="text-xs font-mono whitespace-pre-wrap text-text">
                          {e.parsed ? JSON.stringify(e.parsed, null, 2) : e.dataRaw}
                        </pre>
                      </div>
                    </details>
                  );
                })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

