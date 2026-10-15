import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { probeOwnerSession } from "../auth/ownerSessionProbe";
import { clearApprovalRecovery, readApprovalRecovery, writeApprovalRecovery, type ApprovalAction, type ApprovalActionInput, type ApprovalAttempt } from "./approvalRecovery";

const DEFINITIVE_APPROVAL_CONFLICTS = new Set([
  "APPROVAL_EXPIRED", "APPROVAL_INVALID", "APPROVAL_STALE", "APPROVAL_ALREADY_RESOLVED"
]);

interface UseMyApprovalActionOptions {
  onSuccess?: () => void;
  ownerId?: string;
  approvalId?: string;
}

export function useMyApprovalAction({ onSuccess, ownerId, approvalId }: UseMyApprovalActionOptions = {}) {
  const t = useTranslations("myApprovals.detail.recovery");
  const [submitState, setSubmitState] = useState("idle");
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [pending, setPending] = useState<ApprovalAttempt | null>(null);
  const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setSubmitState("idle");
    setError(null);
    setAuthRequired(false);
    setPending(ownerId && approvalId ? readApprovalRecovery(ownerId, approvalId)?.pending || null : null);
    return () => { generation.current += 1; };
  }, [ownerId, approvalId]);

  const execute = useCallback(async (
    id: string,
    action: ApprovalAction,
    input: ApprovalActionInput = {},
    expectedOwner = ownerId
  ) => {
    if (!id || busy.current) return;
    busy.current = true;
    const currentGeneration = generation.current;
    const isCurrent = () => generation.current === currentGeneration;
    setActiveApprovalId(id);
    setSubmitState("loading");
    setError(null);
    setAuthRequired(false);

    try {
      const session = await probeOwnerSession({ fresh: true });
      if (!isCurrent()) return;
      if (session.state !== "authenticated" || !session.ownerId) {
        setAuthRequired(session.state === "anonymous");
        throw new Error(t(session.state === "anonymous" ? "sessionExpired" : "sessionCheckFailed"));
      }
      if (!expectedOwner || session.ownerId !== expectedOwner) throw new Error(t("sessionChanged"));

      const stored = readApprovalRecovery(expectedOwner, id);
      const previousAttempt = stored?.pending || (approvalId === id ? pending : null);
      if (previousAttempt && (previousAttempt.action !== action || !approvalId)) {
        setPending(previousAttempt);
        throw new Error(t("unknown"));
      }
      if (!approvalId && stored?.amount !== undefined) throw new Error(t("reviewDraft"));
      const body: ApprovalActionInput = {};
      if (input.note) body.note = input.note;
      if (input.amount !== undefined) body.amount = input.amount;
      // An interrupted request always replays its exact action, body and key.
      const attempt = previousAttempt || { action, body: JSON.stringify(body), key: `${id}-${action}-${crypto.randomUUID()}` };
      const recovery = { ...stored, ownerId: expectedOwner, approvalId: id,
        ...(input.amount !== undefined && !previousAttempt ? { amount: String(input.amount) } : {}), pending: attempt };
      if (!writeApprovalRecovery(recovery)) throw new Error(t("storageUnavailable"));
      setPending(attempt);

      let resp: Response;
      let payload: any;
      try {
        resp = await fetch(`/api/v1/approvals/${id}:${attempt.action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": attempt.key },
          body: attempt.body,
          signal: AbortSignal.timeout(30_000)
        });
        payload = await resp.json();
      } catch {
        throw new Error(t("unknown"));
      }
      if (!isCurrent()) return;
      if (!resp.ok) {
        const definitiveConflict = resp.status === 409 && DEFINITIVE_APPROVAL_CONFLICTS.has(payload?.error?.code);
        // A fresh request rejected before execution is editable again. A prior
        // unknown outcome must retain its request even when this retry is 401.
        // These explicit business refusals also settle a replay; other 409s
        // (including idempotency conflicts) must retain the original attempt.
        if (definitiveConflict || (!previousAttempt && [400, 401, 403, 404, 422, 429].includes(resp.status))) {
          if (writeApprovalRecovery({ ...recovery, pending: undefined })) setPending(null);
        }
        // Both callers refresh the authoritative detail/list through this
        // callback. Keep the refusal visible rather than reporting success.
        if (definitiveConflict) onSuccess?.();
        if (resp.status === 401) {
          setAuthRequired(true);
          throw new Error(t("sessionExpired"));
        }
        throw new Error(payload?.error?.message || t("unknown"));
      }
      const expectedState = attempt.action === "approve" ? "APPROVED" : attempt.action === "deny" ? "DENIED" : "CANCELLED";
      if (payload?.data?.approval_id !== id || payload?.data?.state !== expectedState) throw new Error(t("unknown"));
      clearApprovalRecovery(expectedOwner, id);
      setPending(null);
      setSubmitState("done");
      onSuccess?.();
    } catch (err) {
      if (isCurrent()) {
        setError(err instanceof Error ? err.message : t("unknown"));
        setSubmitState("error");
      }
    } finally {
      if (isCurrent()) busy.current = false;
    }
  }, [ownerId, approvalId, pending, onSuccess, t]);

  return { execute, submitState, error, authRequired, pending, activeApprovalId };
}
