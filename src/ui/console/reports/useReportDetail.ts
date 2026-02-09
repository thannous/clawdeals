import { useState, useEffect, useRef } from "react";
import { trackReportsViewed } from "./telemetry";

interface UseReportDetailOptions {
  reportId: string | undefined;
}

export function useReportDetail({ reportId }: UseReportDetailOptions) {
  const [report, setReport] = useState<any>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchReport = async () => {
    if (!reportId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    try {
      const resp = await fetch(`/api/console/reports/${reportId}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setReport(data.report);
      setFetchState("done");
      trackReportsViewed({ reportId });
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message);
      setFetchState("error");
    }
  };

  useEffect(() => {
    fetchReport();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  return { report, fetchState, error, refetch: fetchReport };
}
