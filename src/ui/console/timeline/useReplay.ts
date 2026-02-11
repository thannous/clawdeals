import { useState, useCallback, useRef } from "react";
import { trackTimelineReplayViewed } from "./telemetry";

export function useReplay() {
  const [replay, setReplay] = useState<any | null>(null);
  const [replayState, setReplayState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [replayError, setReplayError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadReplay = useCallback(async (entityType: string, entityId: string, upToAuditId?: string) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setReplayState("loading");
    setReplayError(null);

    try {
      const sp = new URLSearchParams();
      sp.set("entity_type", entityType);
      sp.set("entity_id", entityId);
      if (upToAuditId) sp.set("up_to_audit_id", upToAuditId);

      const resp = await fetch(`/api/console/timeline/replay?${sp}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setReplay(data);
      setReplayState("done");

      trackTimelineReplayViewed({ entityType, entityId, upToAuditId });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setReplayError(err.message || String(err));
      setReplayState("error");
    }
  }, []);

  const clearReplay = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setReplay(null);
    setReplayState("idle");
    setReplayError(null);
  }, []);

  return { replay, replayState, replayError, loadReplay, clearReplay };
}
