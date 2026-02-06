import { useState, useEffect, useCallback, useRef } from "react";

export function useVote({ onVoteSuccess } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [targetDeal, setTargetDeal] = useState(null);
  const [direction, setDirection] = useState(null);
  const [submitState, setSubmitState] = useState("idle"); // idle | submitting | error
  const [error, setError] = useState(null);
  const [disabledUntil, setDisabledUntil] = useState(0);
  const [retryIn, setRetryIn] = useState(0);
  const timerRef = useRef(null);

  // Countdown timer for rate limiting
  useEffect(() => {
    if (disabledUntil <= Date.now()) {
      setRetryIn(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((disabledUntil - Date.now()) / 1000));
      setRetryIn(remaining);
      if (remaining <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [disabledUntil]);

  const openVote = useCallback((deal, dir) => {
    setTargetDeal(deal);
    setDirection(dir);
    setIsOpen(true);
    setSubmitState("idle");
    setError(null);
  }, []);

  const closeVote = useCallback(() => {
    setIsOpen(false);
    setTargetDeal(null);
    setDirection(null);
    setSubmitState("idle");
    setError(null);
  }, []);

  const submitVote = useCallback(async (reason) => {
    if (!targetDeal || !direction) return;
    setSubmitState("submitting");
    setError(null);

    try {
      const resp = await fetch(`/api/console/deals/${targetDeal.deal_id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction, reason })
      });

      if (resp.status === 429) {
        const body = await resp.json().catch(() => ({}));
        const retryAfter =
          body?.retry_after_seconds ??
          body?.error?.details?.retry_after_seconds ??
          30;
        setDisabledUntil(Date.now() + retryAfter * 1000);
        setError("Rate limited. Please wait.");
        setSubmitState("error");
        return;
      }

      if (resp.status === 409) {
        const body = await resp.json().catch(() => ({}));
        setError(body?.error?.message || "Already voted on this deal");
        setSubmitState("error");
        // Auto-close after 2s
        setTimeout(() => closeVote(), 2000);
        return;
      }

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      if (onVoteSuccess && data.deal) {
        onVoteSuccess(data.deal);
      }
      closeVote();
    } catch (err) {
      setError(err.message);
      setSubmitState("error");
    }
  }, [targetDeal, direction, closeVote, onVoteSuccess]);

  return {
    isOpen, targetDeal, direction, submitState, error, retryIn,
    openVote, closeVote, submitVote
  };
}
