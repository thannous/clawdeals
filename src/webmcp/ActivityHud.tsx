import { useState, useSyncExternalStore } from "react";

import type { ActionReceipt } from "./activity/action-receipts";
import { getWebMcpActionReceipts, subscribeWebMcpActionReceipts } from "./ui-bridge";

const EMPTY_RECEIPTS: ActionReceipt[] = [];

const OUTCOME_STYLES: Record<ActionReceipt["outcome"], string> = {
  pending: "border-primary/40 bg-primary/10 text-primary",
  success: "border-success/40 bg-success/10 text-success",
  denied: "border-error/40 bg-error/10 text-error",
  unknown: "border-warning/40 bg-warning/10 text-warning"
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function compactJson(value: unknown): string {
  const encoded = JSON.stringify(value ?? null);
  return encoded.length > 260 ? `${encoded.slice(0, 257)}...` : encoded;
}

function resultLabel(receipt: ActionReceipt): string {
  if (receipt.outcome === "pending") return "Awaiting completion";
  if (receipt.result && typeof receipt.result === "object" && !Array.isArray(receipt.result)) {
    const result = receipt.result as Record<string, unknown>;
    for (const key of ["message", "status", "state", "code"]) {
      if (typeof result[key] === "string" && result[key]) return String(result[key]);
    }
  }
  return receipt.outcome === "success"
    ? "Completed"
    : receipt.outcome === "denied"
      ? "Denied"
      : "Outcome requires reconciliation";
}

export default function ActivityHud() {
  const receipts = useSyncExternalStore(
    subscribeWebMcpActionReceipts,
    getWebMcpActionReceipts,
    () => EMPTY_RECEIPTS
  );
  const [collapsed, setCollapsed] = useState(false);
  if (!receipts.length) return null;

  return (
    <aside
      data-testid="webmcp-activity-hud"
      aria-label="Agent activity receipts"
      className="fixed bottom-4 left-4 z-40 w-[min(calc(100%-2rem),30rem)] border border-border bg-surface/95 shadow-2xl backdrop-blur-md rounded clip-corner"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-subtle">
            Agent Activity
          </div>
          <div className="text-xs text-muted">
            {receipts.length} redacted receipt{receipts.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-primary hover:text-primary"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "Expand" : "Minimize"}
        </button>
      </header>

      {!collapsed ? (
        <ol className="max-h-[65vh] space-y-2 overflow-auto p-2" data-testid="webmcp-action-receipts">
          {receipts.map((receipt, index) => (
            <li key={receipt.receipt_id}>
              <details
                open={index === 0 ? true : undefined}
                data-testid="webmcp-action-receipt"
                data-receipt-id={receipt.receipt_id}
                className="group border border-border bg-background/70 p-2.5"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start gap-2">
                    <time className="pt-0.5 text-[10px] font-mono text-subtle" dateTime={receipt.timestamp}>
                      {formatTime(receipt.timestamp)}
                    </time>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-mono font-semibold text-text">
                          {receipt.tool.name}
                        </span>
                        <span
                          data-testid="webmcp-receipt-outcome"
                          className={`border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${OUTCOME_STYLES[receipt.outcome]}`}
                        >
                          {receipt.outcome}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted">{resultLabel(receipt)}</p>
                    </div>
                    <span aria-hidden="true" className="text-xs text-subtle group-open:rotate-90">
                      ›
                    </span>
                  </div>
                </summary>

                <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1.5 border-t border-border pt-2 text-[10px] leading-relaxed">
                  <dt className="font-mono uppercase text-subtle">Actor</dt>
                  <dd className="font-mono text-text">{receipt.actor}</dd>
                  <dt className="font-mono uppercase text-subtle">Arguments</dt>
                  <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.arguments_summary)}</dd>
                  <dt className="font-mono uppercase text-subtle">Policy</dt>
                  <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.policy)}</dd>
                  <dt className="font-mono uppercase text-subtle">Confirmation</dt>
                  <dd className="font-mono text-text">{receipt.confirmation}</dd>
                  <dt className="font-mono uppercase text-subtle">Result</dt>
                  <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.result)}</dd>
                  <dt className="font-mono uppercase text-subtle">Request ID</dt>
                  <dd className="min-w-0 break-all font-mono text-text">{receipt.request_id}</dd>
                  <dt className="font-mono uppercase text-subtle">Input hash</dt>
                  <dd className="min-w-0 truncate font-mono text-subtle" title={receipt.input_hash}>
                    {receipt.input_hash}
                  </dd>
                  <dt className="font-mono uppercase text-subtle">Approvals</dt>
                  <dd className="min-w-0 break-all font-mono text-muted">
                    {receipt.approval_ids.length ? receipt.approval_ids.join(", ") : "None"}
                  </dd>
                  <dt className="font-mono uppercase text-subtle">Receipt</dt>
                  <dd className="min-w-0 break-all font-mono text-subtle">
                    v{receipt.receipt_version} · {receipt.receipt_id}
                  </dd>
                </dl>

                {receipt.best_effort_error ? (
                  <p className="mt-2 border border-warning/40 bg-warning/10 px-2 py-1.5 text-[10px] font-mono text-warning">
                    Best-effort warning: {receipt.best_effort_error}
                  </p>
                ) : null}

                {receipt.link ? (
                  <a
                    href={receipt.link}
                    className="mt-2 inline-flex text-[10px] font-mono uppercase tracking-wider text-primary hover:underline"
                  >
                    Open related view →
                  </a>
                ) : null}
              </details>
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}
