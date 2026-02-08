import { useState, useEffect, useCallback, useRef } from "react";
import { trackThreadDetailViewed } from "./telemetry";

interface UseThreadDetailOptions {
  threadId: string | undefined;
}

export function useThreadDetail({ threadId }: UseThreadDetailOptions) {
  const [thread, setThread] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messagesNextCursor, setMessagesNextCursor] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [loadMoreState, setLoadMoreState] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!threadId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    (async () => {
      try {
        const resp = await fetch(`/api/console/threads/${threadId}`, { signal: controller.signal });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        setThread(data.thread);
        setMessages(data.messages || []);
        setMessagesNextCursor(data.messages_next_cursor || null);
        setFetchState("done");
        trackThreadDetailViewed({ threadId });
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setError(err.message);
        setFetchState("error");
      }
    })();

    return () => {
      controller.abort();
    };
  }, [threadId]);

  const loadMoreMessages = useCallback(async () => {
    if (!threadId || !messagesNextCursor || loadMoreState === "loading") return;

    const controller = new AbortController();
    setLoadMoreState("loading");

    try {
      const params = new URLSearchParams();
      params.set("cursor", messagesNextCursor);
      params.set("limit", "50");
      const resp = await fetch(`/api/console/threads/${threadId}/messages?${params}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setMessages((prev) => [...prev, ...(data.items || [])]);
      setMessagesNextCursor(data.next_cursor || null);
      setLoadMoreState("idle");
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setLoadMoreState("idle");
    }
  }, [threadId, messagesNextCursor, loadMoreState]);

  return { thread, messages, messagesNextCursor, fetchState, loadMoreState, error, loadMoreMessages };
}
