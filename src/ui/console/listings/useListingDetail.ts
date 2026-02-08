import { useState, useEffect, useRef } from "react";
import { trackListingDetailViewed } from "./telemetry";

interface UseListingDetailOptions {
  listingId: string | undefined;
}

export function useListingDetail({ listingId }: UseListingDetailOptions) {
  const [listing, setListing] = useState<any>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!listingId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    (async () => {
      try {
        const resp = await fetch(`/api/console/listings/${listingId}`, { signal: controller.signal });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error?.message || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        setListing(data.listing);
        setFetchState("done");
        trackListingDetailViewed({ listingId });
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setError(err.message);
        setFetchState("error");
      }
    })();

    return () => {
      controller.abort();
    };
  }, [listingId]);

  return { listing, fetchState, error };
}
