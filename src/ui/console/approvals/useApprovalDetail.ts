import { useState, useEffect, useRef } from "react";
import { trackApprovalDetailViewed } from "./telemetry";

interface UseApprovalDetailOptions {
  approvalId: string | undefined;
}

export function useApprovalDetail({ approvalId }: UseApprovalDetailOptions) {
  const [approval, setApproval] = useState<any>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchApproval = async () => {
    if (!approvalId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    try {
      const resp = await fetch(`/api/console/approvals/${approvalId}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setApproval(data.approval);
      setFetchState("done");
      trackApprovalDetailViewed({ approvalId });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
    }
  };

  useEffect(() => {
    fetchApproval();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalId]);

  return { approval, fetchState, error, refetch: fetchApproval };
}
