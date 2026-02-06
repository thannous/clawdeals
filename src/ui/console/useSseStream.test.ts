import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSseStream } from "./useSseStream";

class MockEventSource {
  // Keep this class intentionally loose: we're emulating the browser EventSource API in tests.
  static instances: MockEventSource[] = [];
  [key: string]: any;

  constructor(url: string) {
    this.url = url;
    this.readyState = 0;
    this._listeners = {};
    this.onopen = null;
    this.onerror = null;
    this.onmessage = null;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: any) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(handler);
  }

  removeEventListener(type: string, handler: any) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter((h) => h !== handler);
  }

  close() {
    this.readyState = 2;
  }

  _emit(type: string, data: any) {
    const handlers = this._listeners[type] || [];
    for (const handler of handlers) {
      handler(data);
    }
  }

  _simulateOpen() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }

  _simulateError() {
    if (this.onerror) this.onerror(new Event("error"));
  }

  _simulateMessage(eventType: string, data: any, lastEventId?: string) {
    const event = {
      type: eventType,
      data: typeof data === "string" ? data : JSON.stringify(data),
      lastEventId: lastEventId || ""
    };
    // Real EventSource: named events fire only on addEventListener(name),
    // not on the generic "message" listener.
    this._emit(eventType, event);
  }
}

describe("useSseStream", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (globalThis as any).EventSource = MockEventSource;
    if (!(globalThis as any).localStorage) {
      const store = new Map();
      (globalThis as any).localStorage = {
        getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
        setItem: (k, v) => store.set(String(k), String(v)),
        removeItem: (k) => store.delete(String(k)),
        clear: () => store.clear()
      };
    }
    (globalThis as any).localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).EventSource;
  });

  it("starts with connecting state", () => {
    const { result } = renderHook(() => useSseStream());
    expect(result.current.connectionState).toBe("connecting");
    expect(result.current.events).toEqual([]);
  });

  it("transitions to connected on open", () => {
    const { result } = renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];

    act(() => {
      es._simulateOpen();
    });

    expect(result.current.connectionState).toBe("connected");
  });

  it("adds events on named event message", () => {
    const { result } = renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];

    act(() => {
      es._simulateOpen();
    });

    act(() => {
      es._simulateMessage("message", {
        id: "1700000000000-1",
        type: "deal.created",
        ts: "2026-02-06T10:00:00.000Z",
        actor: { type: "agent", id: "agent-123" },
        entity: { type: "deal", id: "deal-abc" },
        payload: { title: "Test Deal" }
      }, "1700000000000-1");
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].type).toBe("deal.created");
    expect(result.current.events[0].id).toBe("1700000000000-1");
  });

  it("builds URL with types filter", () => {
    renderHook(() => useSseStream({ types: ["deal.created", "watchlist.match"] }));
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("types=deal.created%2Cwatchlist.match");
    expect(es.url).toContain("replay=true");
    expect(es.url).toContain("as_message=true");
  });

  it("builds URL with entity_id filter", () => {
    renderHook(() => useSseStream({ entityId: "abc-123" }));
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("entity_id=abc-123");
    expect(es.url).toContain("replay=true");
    expect(es.url).toContain("as_message=true");
  });

  it("builds URL with last_event_id from localStorage when available", () => {
    (globalThis as any).localStorage.setItem("console_sse_last_event_id", "123-4");
    renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];
    expect(es.url).toContain("last_event_id=123-4");
  });

  it("pauses and buffers events, increments missedCount", () => {
    const { result } = renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];

    act(() => {
      es._simulateOpen();
    });

    act(() => {
      result.current.pause();
    });

    expect(result.current.paused).toBe(true);

    act(() => {
      es._simulateMessage("message", {
        id: "1700000000000-1",
        type: "deal.created",
        ts: "2026-02-06T10:00:00.000Z",
        payload: {}
      }, "1700000000000-1");
    });

    expect(result.current.events).toHaveLength(0);
    expect(result.current.missedCount).toBe(1);
  });

  it("resumes and flushes buffered events", () => {
    const { result } = renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];

    act(() => {
      es._simulateOpen();
    });

    act(() => {
      result.current.pause();
    });

    act(() => {
      es._simulateMessage("message", {
        id: "1700000000000-1",
        type: "deal.created",
        ts: "2026-02-06T10:00:00.000Z",
        payload: {}
      }, "1700000000000-1");
      es._simulateMessage("message", {
        id: "1700000000000-2",
        type: "deal.created",
        ts: "2026-02-06T10:00:01.000Z",
        payload: {}
      }, "1700000000000-2");
    });

    expect(result.current.events).toHaveLength(0);
    expect(result.current.missedCount).toBe(2);

    act(() => {
      result.current.resume();
    });

    expect(result.current.paused).toBe(false);
    expect(result.current.events).toHaveLength(2);
    expect(result.current.missedCount).toBe(0);
  });

  it("does not create a new EventSource on transient errors (preserves Last-Event-ID)", () => {
    const { result } = renderHook(() => useSseStream());
    const es1 = MockEventSource.instances[0];

    act(() => {
      es1._simulateError();
    });

    expect(result.current.connectionState).toBe("reconnecting");
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("manually reconnects with backoff only when EventSource is closed", () => {
    renderHook(() => useSseStream());
    const es1 = MockEventSource.instances[0];

    act(() => {
      es1.close();
      es1._simulateError();
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("closes EventSource on unmount", () => {
    const { unmount } = renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];

    expect(es.readyState).not.toBe(2);

    unmount();

    expect(es.readyState).toBe(2);
  });

  it("trims events when exceeding max (500)", () => {
    const { result } = renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];

    act(() => {
      es._simulateOpen();
    });

    act(() => {
      for (let i = 0; i < 510; i++) {
        const id = `${1700000000000 + i}-0`;
        es._simulateMessage("message", {
          id,
          type: "deal.created",
          ts: "2026-02-06T10:00:00.000Z",
          payload: { n: i }
        }, id);
      }
    });

    expect(result.current.events.length).toBeLessThanOrEqual(500);
    expect(result.current.events[0].id).toBe("1700000000010-0");
  });

  it("does not drop unknown SSE event types when delivered as message", () => {
    const { result } = renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];

    act(() => {
      es._simulateOpen();
    });

    act(() => {
      es._simulateMessage("message", {
        id: "1700000000000-9",
        type: "some.new.event",
        ts: "2026-02-06T10:00:02.000Z",
        payload: { ok: true }
      }, "1700000000000-9");
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].type).toBe("some.new.event");
  });

  it("does not persist non-stream ids (e.g. gap-* payload id)", () => {
    renderHook(() => useSseStream());
    const es = MockEventSource.instances[0];

    act(() => {
      es._simulateOpen();
    });

    act(() => {
      es._simulateMessage("message", {
        id: "gap-1700000000000",
        type: "sse.gap",
        ts: "2026-02-06T10:00:02.000Z",
        payload: { replay: false }
      });
    });

    expect((globalThis as any).localStorage.getItem("console_sse_last_event_id")).toBeNull();
  });
});
