import { useCallback, useEffect, useMemo, useState } from "react";

import { canonicalJsonStringify } from "../utils";
import { sanitizeToolOutput } from "../security/sanitize";
import { useWebMcpConfirm } from "./context";

function formatSeconds(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}s`;
}

export default function ConfirmModalHost() {
  const { pending, decide, history, cooldownUntilMs } = useWebMcpConfirm();
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [edited, setEdited] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState<number>(0);

  useEffect(() => {
    if (!pending) return;
    const safe = sanitizeToolOutput(pending.args);
    const nextEdited = JSON.stringify(safe, null, 2);

    // Avoid synchronous setState within an effect body (react-hooks/set-state-in-effect).
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      setMode("preview");
      setError("");
      setEdited(nextEdited);
    });
    return () => {
      alive = false;
    };
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const left = Math.max(0, pending.timeoutMs - elapsed);
      setRemainingMs(left);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [pending]);

  useEffect(() => {
    let alive = true;
    if (!cooldownUntilMs) {
      // Avoid synchronous setState within an effect body (react-hooks/set-state-in-effect).
      Promise.resolve().then(() => {
        if (!alive) return;
        setCooldownRemainingMs(0);
      });
      return () => {
        alive = false;
      };
    }

    const tick = () => {
      if (!alive) return;
      setCooldownRemainingMs(Math.max(0, cooldownUntilMs - Date.now()));
    };

    tick();
    const id = setInterval(tick, 250);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [cooldownUntilMs]);

  useEffect(() => {
    if (!pending) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        decide({ kind: "deny", code: "USER_DENIED", reason: "escape" });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pending, decide]);

  const safeArgs = useMemo(() => (pending ? sanitizeToolOutput(pending.args) : null), [pending]);
  const canonicalArgs = useMemo(() => (safeArgs ? canonicalJsonStringify(safeArgs) : ""), [safeArgs]);

  const handleDeny = useCallback(() => {
    decide({ kind: "deny", code: "USER_DENIED", reason: "user_denied" });
  }, [decide]);

  const handleApprove = useCallback(() => {
    if (!pending) return;
    setError("");
    if (mode === "edit") {
      try {
        const parsed = JSON.parse(edited || "{}");
        decide({ kind: "approve", args: parsed });
        return;
      } catch {
        setError("Invalid JSON. Fix the payload or go back.");
        return;
      }
    }
    decide({ kind: "approve", args: pending.args });
  }, [decide, edited, mode, pending]);

  const show = Boolean(pending);
  if (!show) {
    return (
      <>
        {cooldownUntilMs && cooldownRemainingMs > 0 ? (
          <div className="fixed bottom-4 right-4 z-50 border border-border bg-surface px-3 py-2 text-xs font-mono text-muted">
            WebMCP cooldown active ({formatSeconds(cooldownRemainingMs)})
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 bg-surface/90 border-b border-border backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-4 py-2 text-[11px] font-mono text-muted flex items-center justify-between">
          <div>Agent action pending: {pending.toolName}</div>
          <div>Timeout: {formatSeconds(remainingMs)}</div>
        </div>
      </div>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="webmcp-confirm-title"
        data-testid="webmcp-confirm-modal"
      >
        <div className="absolute inset-0 modal-overlay" onClick={handleDeny} />

        <div className="relative bg-surface border border-border rounded clip-corner p-6 w-full max-w-2xl space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 id="webmcp-confirm-title" className="text-sm font-bold font-mono uppercase tracking-wider text-text">
                Confirm tool execution
              </h2>
              <div className="text-xs font-mono text-muted">
                <span className="text-subtle">Tool:</span> {pending.toolName}
              </div>
              <div className="text-xs font-mono text-muted">
                <span className="text-subtle">Scope:</span> {pending.toolScope}
              </div>
              <div className="text-xs font-mono text-muted">
                <span className="text-subtle">Request:</span> {pending.requestId}
              </div>
            </div>
            <button
              onClick={handleDeny}
              className="border border-border px-3 py-1 text-xs font-mono font-bold uppercase text-muted hover:border-border-strong hover:text-text"
            >
              Close
            </button>
          </div>

          <div className="border border-border bg-bg/40 rounded p-3 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-subtle">Parameters</div>
            {mode === "preview" ? (
              <pre className="text-xs font-mono text-text whitespace-pre-wrap break-words">{canonicalArgs}</pre>
            ) : (
              <textarea
                value={edited}
                onChange={(e) => setEdited(e.target.value)}
                className="w-full min-h-[160px] text-xs font-mono bg-bg border border-border rounded p-2 text-text focus:outline-none focus:border-primary"
              />
            )}
            {error ? <div className="text-xs font-mono text-red-400">{error}</div> : null}
          </div>

          <div className="border border-border bg-bg/40 rounded p-3 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-subtle">What the agent will receive</div>
            <div className="text-xs font-mono text-muted">{pending.outputHint}</div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-mono text-subtle">
              Recent actions: {history.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode((m) => (m === "preview" ? "edit" : "preview"))}
                className="border border-border px-4 py-2 text-xs font-mono font-bold uppercase text-muted hover:border-border-strong hover:text-text"
              >
                {mode === "preview" ? "Edit" : "Preview"}
              </button>
              <button
                onClick={handleDeny}
                className="border border-border px-4 py-2 text-xs font-mono font-bold uppercase text-muted hover:border-border-strong hover:text-text"
              >
                Deny
              </button>
              <button
                onClick={handleApprove}
                className="border border-primary px-4 py-2 text-xs font-mono font-bold uppercase text-primary hover:bg-primary hover:text-bg"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
