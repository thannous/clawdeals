import { useCallback, useEffect, useRef, useState } from "react";
import { trackDealCommentCreated } from "./telemetry";

const PAGE_SIZE = 30;

function containsUrl(value) {
  if (!value || typeof value !== "string") return false;
  return /\bhttps?:\/\/\S+/i.test(value) || /\bwww\.\S+/i.test(value);
}

type UseDealNotesOptions = {
  dealId?: string;
};

type FetchNotesParams = {
  cursor?: string | null;
  append?: boolean;
};

type CreateNoteParams = {
  body?: string;
};

export function useDealNotes({ dealId }: UseDealNotesOptions = {}) {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [fetchState, setFetchState] = useState("idle"); // idle | loading | error | done
  const [loadMoreState, setLoadMoreState] = useState("idle"); // idle | loading
  const [error, setError] = useState(null);
  const [submitState, setSubmitState] = useState("idle"); // idle | submitting | error
  const [submitError, setSubmitError] = useState(null);
  const abortRef = useRef(null);

  const fetchNotes = useCallback(async ({ cursor, append }: FetchNotesParams = {}) => {
    if (!dealId) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!append) {
      setFetchState("loading");
      setError(null);
    } else {
      setLoadMoreState("loading");
    }

    const searchParams = new URLSearchParams();
    searchParams.set("limit", String(PAGE_SIZE));
    if (cursor) searchParams.set("cursor", cursor);

    try {
      const resp = await fetch(`/api/console/deals/${dealId}/comments?${searchParams}`, { signal: controller.signal });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const nextItems = data.items || [];

      if (append) {
        setItems((prev) => [...prev, ...nextItems]);
      } else {
        setItems(nextItems);
      }

      setNextCursor(data.next_cursor || null);
      setFetchState("done");
      setLoadMoreState("idle");
    } catch (err) {
      if (err.name === "AbortError") return;
      setFetchState("error");
      setLoadMoreState("idle");
      setError(err.message);
    }
  }, [dealId]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    fetchNotes({ append: false });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [dealId, fetchNotes]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadMoreState === "loading") return;
    fetchNotes({ cursor: nextCursor, append: true });
  }, [nextCursor, loadMoreState, fetchNotes]);

  const createNote = useCallback(async ({ body }: CreateNoteParams = {}) => {
    if (!dealId) return null;

    const raw = typeof body === "string" ? body : "";
    const cleaned = raw.trim();
    if (!cleaned) {
      setSubmitState("error");
      setSubmitError("Body is required");
      return null;
    }
    if (cleaned.length > 1000) {
      setSubmitState("error");
      setSubmitError("Body must be 1..1000 characters");
      return null;
    }
    if (containsUrl(cleaned)) {
      setSubmitState("error");
      setSubmitError("Links are not allowed in notes");
      return null;
    }

    setSubmitState("submitting");
    setSubmitError(null);

    try {
      const resp = await fetch(`/api/console/deals/${dealId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_type: "note", body: cleaned })
      });
      if (!resp.ok) {
        const bodyResp = await resp.json().catch(() => ({}));
        throw new Error(bodyResp?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const comment = data.comment || null;
      if (comment) {
        setItems((prev) => [comment, ...prev]);
      }
      setSubmitState("idle");
      trackDealCommentCreated({ dealId });
      return comment;
    } catch (err) {
      setSubmitState("error");
      setSubmitError(err.message);
      return null;
    }
  }, [dealId]);

  const clearSubmitError = useCallback(() => {
    setSubmitError(null);
    setSubmitState("idle");
  }, []);

  return {
    items,
    nextCursor,
    fetchState,
    loadMoreState,
    error,
    loadMore,
    submitState,
    submitError,
    createNote,
    clearSubmitError
  };
}
