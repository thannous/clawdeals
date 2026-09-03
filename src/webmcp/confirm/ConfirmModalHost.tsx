import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { canonicalJsonStringify } from "../utils";
import { getActiveBuyMission, subscribeActiveBuyMission } from "../ui-bridge";
import { useWebMcpConfirm } from "./context";
import { applyPrimaryField, formatMoney, summarizeConfirmRequest, type ConfirmSummary } from "./summarize";
import type { ConfirmDecision, ConfirmHistoryEntry, ConfirmRequest } from "./types";

function formatSeconds(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}s`;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return canonicalJsonStringify(value);
  }
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], summary';

export default function ConfirmModalHost() {
  const { pending, decide, history, cooldownUntilMs } = useWebMcpConfirm();
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number>(0);
  useEffect(() => {
    const tick = () => {
      const left = cooldownUntilMs ? Math.max(0, cooldownUntilMs - Date.now()) : 0;
      setCooldownRemainingMs(left);
    };

    tick();
    if (!cooldownUntilMs) return;
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [cooldownUntilMs]);

  if (!pending) {
    return (
      <>
        {cooldownRemainingMs > 0 ? (
          <div className="fixed bottom-4 right-4 z-50 border border-border bg-surface px-3 py-2 text-xs font-mono text-muted">
            WebMCP cooldown active ({formatSeconds(cooldownRemainingMs)})
          </div>
        ) : null}
      </>
    );
  }

  // Keyed render resets local UI state when a new request arrives without using an effect.
  return <ConfirmModal key={pending.requestId} pending={pending} decide={decide} history={history} />;
}

function ConfirmModal({
  pending,
  decide,
  history
}: {
  pending: ConfirmRequest;
  decide: (decision: ConfirmDecision) => void;
  history: ConfirmHistoryEntry[];
}) {
  const mission = useSyncExternalStore(subscribeActiveBuyMission, getActiveBuyMission, () => null);
  const summary: ConfirmSummary = useMemo(() => summarizeConfirmRequest(pending, mission), [pending, mission]);
  const field = summary.primaryField;

  // The JSON text is the single source of truth for what gets approved; the primary field edits it.
  const [edited, setEdited] = useState<string>(() => prettyJson(pending.args));
  const [fieldValue, setFieldValue] = useState<string>(() => (field?.value === null || field?.value === undefined ? "" : String(field.value)));
  const [error, setError] = useState<string>("");
  const [remainingMs, setRemainingMs] = useState<number>(pending.timeoutMs);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const rejectRef = useRef<HTMLButtonElement | null>(null);
  const primaryRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const approveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      setRemainingMs(Math.max(0, pending.timeoutMs - elapsed));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [pending.timeoutMs]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const target = primaryRef.current || approveRef.current;
    target?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      // Escape never decides on the agent's behalf; it only moves focus to the explicit Reject control.
      if (e.key === "Escape") {
        e.preventDefault();
        rejectRef.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const parsedEdited = useMemo(() => {
    try {
      return { value: JSON.parse(edited || "{}") as unknown, error: null as string | null };
    } catch {
      return { value: null, error: "Invalid JSON. Fix the payload or reset it." };
    }
  }, [edited]);

  const livePolicyHint = useMemo(() => {
    if (!field || field.kind !== "amount" || !mission) return summary.policyHint;
    const current = Number(fieldValue);
    if (!Number.isFinite(current)) return summary.policyHint;
    return summarizeConfirmRequest({ ...pending, args: { ...(parsedEdited.value as object), [field.key]: current } }, mission).policyHint;
  }, [field, fieldValue, mission, parsedEdited.value, pending, summary.policyHint]);

  const onFieldChange = useCallback(
    (raw: string) => {
      setFieldValue(raw);
      if (!field) return;
      const base = parsedEdited.error ? pending.args : parsedEdited.value;
      const applied = applyPrimaryField(base, field, raw);
      setError(applied.error || "");
      if (!applied.error) setEdited(prettyJson(applied.args));
    },
    [field, parsedEdited.error, parsedEdited.value, pending.args]
  );

  const onJsonChange = useCallback(
    (raw: string) => {
      setEdited(raw);
      setError("");
      if (!field) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && field.key in parsed) {
          const next = (parsed as Record<string, unknown>)[field.key];
          setFieldValue(next === null || next === undefined ? "" : String(next));
        }
      } catch {
        // Leave the primary field untouched while the JSON is mid-edit.
      }
    },
    [field]
  );

  const handleReject = useCallback(() => {
    decide({ kind: "deny", code: "USER_DENIED", reason: "user_denied" });
  }, [decide]);

  const handleApprove = useCallback(() => {
    if (parsedEdited.error) {
      setError(parsedEdited.error);
      return;
    }
    if (field) {
      const applied = applyPrimaryField(parsedEdited.value, field, fieldValue);
      if (applied.error) {
        setError(applied.error);
        return;
      }
      decide({ kind: "approve", args: applied.args });
      return;
    }
    decide({ kind: "approve", args: parsedEdited.value });
  }, [decide, field, fieldValue, parsedEdited]);

  const edits = useMemo(() => canonicalJsonStringify(parsedEdited.value) !== canonicalJsonStringify(pending.args), [parsedEdited.value, pending.args]);
  const progress = pending.timeoutMs > 0 ? Math.max(0, Math.min(1, remainingMs / pending.timeoutMs)) : 0;
  const hint = livePolicyHint;

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 bg-surface/90 border-b border-border backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 text-xs font-mono text-muted flex items-center justify-between">
          <div>Agent action pending: {pending.toolName}</div>
          <div>Timeout: {formatSeconds(remainingMs)}</div>
        </div>
        <div className="h-0.5 w-full bg-border" aria-hidden="true">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="webmcp-confirm-title"
        aria-describedby="webmcp-confirm-sentence"
        data-testid="webmcp-confirm-modal"
      >
        <div aria-hidden="true" className="absolute inset-0 modal-overlay" />

        <div ref={dialogRef} className="relative bg-surface border border-border rounded clip-corner p-6 w-full max-w-2xl space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">The agent asks for your confirmation</p>
            <h2 id="webmcp-confirm-title" className="text-xl font-bold uppercase tracking-wide text-text">
              {summary.title}
            </h2>
            <p id="webmcp-confirm-sentence" className="text-sm leading-relaxed text-text" data-testid="webmcp-confirm-sentence">
              {summary.sentence}
            </p>
            <p className="text-xs leading-relaxed text-muted">{summary.consequence}</p>
          </div>

          {hint ? (
            <p
              data-testid="webmcp-confirm-policy-hint"
              data-tone={hint.tone}
              className={`border px-3 py-2 text-xs font-mono leading-relaxed ${
                hint.tone === "warn" ? "border-warning/50 bg-warning/10 text-warning" : "border-success/40 bg-success/10 text-success"
              }`}
            >
              {hint.text}
            </p>
          ) : null}

          {field ? (
            <label className="block space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-subtle">
                {field.label}
                {field.kind === "amount" && field.currency ? ` · ${field.currency}` : ""}
                <span className="ml-2 normal-case tracking-normal text-subtle">— edit before approving if needed</span>
              </span>
              {field.kind === "amount" ? (
                <input
                  ref={(node) => {
                    primaryRef.current = node;
                  }}
                  data-testid="webmcp-confirm-primary-field"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={fieldValue}
                  onChange={(event) => onFieldChange(event.target.value)}
                  className="w-full border border-border bg-bg px-3 py-2 font-mono text-lg font-bold text-text focus:border-primary focus:outline-none"
                />
              ) : (
                <textarea
                  ref={(node) => {
                    primaryRef.current = node;
                  }}
                  data-testid="webmcp-confirm-primary-field"
                  rows={3}
                  value={fieldValue}
                  onChange={(event) => onFieldChange(event.target.value)}
                  className="w-full border border-border bg-bg px-3 py-2 font-mono text-sm text-text focus:border-primary focus:outline-none"
                />
              )}
              {field.kind === "amount" && Number.isFinite(Number(fieldValue)) && fieldValue !== "" ? (
                <span className="block text-xs font-mono text-muted">{formatMoney(Number(fieldValue), field.currency)}</span>
              ) : null}
            </label>
          ) : null}

          <details className="border border-border bg-bg/40 rounded" data-testid="webmcp-confirm-advanced">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-mono uppercase tracking-widest text-subtle hover:text-text">
              Advanced · raw parameters{edits ? " · edited" : ""}
            </summary>
            <div className="space-y-2 border-t border-border p-3">
              <textarea
                aria-label="Edit tool parameters JSON"
                value={edited}
                onChange={(event) => onJsonChange(event.target.value)}
                spellCheck={false}
                className="w-full min-h-[160px] text-xs font-mono bg-bg border border-border rounded p-2 text-text focus:outline-none focus:border-primary"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-subtle">
                <span>
                  Tool {pending.toolName} · scope {pending.toolScope} · request {pending.requestId.slice(0, 8)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEdited(prettyJson(pending.args));
                    setFieldValue(field?.value === null || field?.value === undefined ? "" : String(field.value));
                    setError("");
                  }}
                  className="border border-border px-2 py-1 uppercase tracking-wider hover:text-text"
                >
                  Reset edits
                </button>
              </div>
              <p className="text-[11px] font-mono text-subtle">What the agent will receive: {pending.outputHint}</p>
            </div>
          </details>

          {error ? (
            <div role="alert" className="text-xs font-mono text-error">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-mono text-subtle">Recent actions: {history.length}</div>
            <div className="flex items-center gap-2">
              <button
                ref={rejectRef}
                type="button"
                onClick={handleReject}
                className="border border-border px-4 py-2 text-xs font-mono font-bold uppercase text-muted hover:border-error hover:text-error"
              >
                Reject
              </button>
              <button
                ref={approveRef}
                type="button"
                onClick={handleApprove}
                className="border border-primary bg-primary px-4 py-2 text-xs font-mono font-bold uppercase text-bg hover:brightness-110"
              >
                {edits ? "Approve edited" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
