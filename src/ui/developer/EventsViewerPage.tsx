import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStoredApiKey, getStoredLastEventId, setStoredLastEventId, clearStoredLastEventId } from "./storage";
import { SseParser } from "./sse-parser";
import { buildApiUrl } from "./api";

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

export default function EventsViewerPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<"idle" | "connecting" | "connected" | "reconnecting" | "error">(
    "idle"
  );
  const [events, setEvents] = useState<UiEvent[]>([]);
  const [error, setError] = useState<string>("");
  const [paused, setPaused] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<any>(null);
  const reconnectDelayRef = useRef<number>(INITIAL_RECONNECT_DELAY_MS);
  const pausedRef = useRef(false);
  const bufferRef = useRef<UiEvent[]>([]);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    setApiKey(getStoredApiKey());
    lastEventIdRef.current = getStoredLastEventId();
  }, []);

  const filtered = useMemo(() => {
    const q = typeFilter.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => String(e.parsed?.type || e.event || "").toLowerCase().includes(q));
  }, [events, typeFilter]);

  const addEvents = useCallback((incoming: UiEvent[]) => {
    setEvents((prev) => {
      const merged = [...prev, ...incoming];
      if (merged.length > MAX_EVENTS) {
        return merged.slice(merged.length - MAX_EVENTS);
      }
      return merged;
    });
  }, []);

  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setConnected(false);
    setConnectionState("idle");
  }, []);

  const connect = useCallback(async () => {
    if (!apiKey) {
      setConnectionState("error");
      setError("Missing API key. Go to /start.");
      return;
    }

    setError("");
    setConnectionState(connected ? "reconnecting" : "connecting");
    setConnected(true);

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
          Authorization: `Bearer ${apiKey}`,
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

      setConnectionState("connected");
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
            setMissedCount((c) => c + 1);
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
      setConnectionState("reconnecting");
      setError(e?.message || "Stream error.");

      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    }
  }, [apiKey, connected, addEvents]);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const handlePauseToggle = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    if (!pausedRef.current && bufferRef.current.length > 0) {
      addEvents(bufferRef.current);
      bufferRef.current = [];
      setMissedCount(0);
    }
  }, [addEvents]);

  const handleClearCursor = useCallback(() => {
    lastEventIdRef.current = null;
    clearStoredLastEventId();
  }, []);

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="font-bold tracking-wider whitespace-nowrap">
            <span className="text-primary">/ </span>EVENTS
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link href="/developer" className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong">
              Dashboard
            </Link>
            <button
              onClick={() => connect()}
              disabled={!apiKey || connectionState === "connecting" || connectionState === "connected"}
              className={`border px-3 py-1 text-xs font-mono ${
                connectionState === "connected"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-primary text-primary hover:bg-primary hover:text-bg"
              }`}
            >
              {connectionState === "connected" ? "Connected" : "Connect"}
            </button>
            <button
              onClick={disconnect}
              className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong"
              disabled={!connected}
            >
              Disconnect
            </button>
            <button
              onClick={handlePauseToggle}
              className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong"
              disabled={!connected}
            >
              {paused ? `Resume (${missedCount})` : "Pause"}
            </button>
            <button
              onClick={() => setEvents([])}
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
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              placeholder="filter: watchlist.match"
              aria-label="Filter event type"
              name="type_filter"
              autoComplete="off"
              spellCheck={false}
              className="h-8 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            />
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        {!apiKey && (
          <div className="border border-border bg-bg p-5 text-xs font-mono text-subtle">
            Missing API key. Go to <Link href="/start" className="text-primary hover:underline">/start</Link>.
          </div>
        )}

        {error && (
          <div className="border border-red-900/50 bg-[color-mix(in_srgb,#ff0000_6%,transparent)] p-4 text-xs font-mono text-red-300">
            {error}
          </div>
        )}

        <div className="border border-border bg-surface p-4 text-xs font-mono text-subtle flex flex-wrap gap-4 items-center">
          <span>
            state: <span className="text-text">{connectionState}</span>
          </span>
          <span>
            events: <span className="text-text">{events.length}</span>
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

