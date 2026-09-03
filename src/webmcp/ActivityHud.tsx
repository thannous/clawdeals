import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { ActionReceipt } from "./activity/action-receipts";
import { describePolicyDecision, type PolicyChip } from "./activity/policy-label";
import { clearWebMcpActionReceipts, getWebMcpActionReceipts, subscribeWebMcpActionReceipts } from "./ui-bridge";

const EMPTY_RECEIPTS: ActionReceipt[] = [];

const OUTCOME_STYLES: Record<ActionReceipt["outcome"], string> = {
  pending: "border-primary/40 bg-primary/10 text-primary",
  success: "border-success/40 bg-success/10 text-success",
  denied: "border-error/40 bg-error/10 text-error",
  unknown: "border-warning/40 bg-warning/10 text-warning"
};

const CHIP_STYLES: Record<PolicyChip["tone"], string> = {
  neutral: "border-border text-muted",
  ok: "border-success/40 bg-success/10 text-success",
  warn: "border-warning/40 bg-warning/10 text-warning",
  error: "border-error/40 bg-error/10 text-error"
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
    for (const key of ["message", "listing_status", "status", "state", "code"]) {
      if (typeof result[key] === "string" && result[key]) return String(result[key]);
    }
  }
  return receipt.outcome === "success"
    ? "Completed"
    : receipt.outcome === "denied"
      ? "Denied"
      : "Outcome requires reconciliation";
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ label, text, testId }: { label: string; text: string; testId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const onClick = useCallback(async () => {
    const ok = await copyText(text);
    setState(ok ? "copied" : "failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  }, [text]);
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-primary hover:text-primary"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </button>
  );
}

function ReceiptRow({ receipt, defaultOpen }: { receipt: ActionReceipt; defaultOpen: boolean }) {
  const chip = describePolicyDecision(receipt.policy);
  return (
    <details
      open={defaultOpen ? true : undefined}
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
              <span className="truncate text-xs font-mono font-semibold text-text">{receipt.tool.name}</span>
              <span
                data-testid="webmcp-receipt-outcome"
                className={`border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${OUTCOME_STYLES[receipt.outcome]}`}
              >
                {receipt.outcome}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-muted">{resultLabel(receipt)}</p>
            <span
              data-testid="webmcp-receipt-policy-chip"
              data-tone={chip.tone}
              className={`mt-1 inline-block border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${CHIP_STYLES[chip.tone]}`}
            >
              {chip.label}
            </span>
          </div>
          <span aria-hidden="true" className="text-xs text-subtle group-open:rotate-90">
            ›
          </span>
        </div>
      </summary>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <CopyButton label="Copy request ID" text={receipt.request_id} testId="webmcp-receipt-copy-request-id" />
        <CopyButton label="Copy receipt" text={JSON.stringify(receipt, null, 2)} testId="webmcp-receipt-copy-receipt" />
        {receipt.link ? (
          <a
            href={receipt.link}
            className="ml-auto inline-flex text-[10px] font-mono uppercase tracking-wider text-primary hover:underline"
          >
            Open related view →
          </a>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1.5 text-[10px] leading-relaxed">
        <dt className="font-mono uppercase text-subtle">Actor</dt>
        <dd className="font-mono text-text">{receipt.actor}</dd>
        <dt className="font-mono uppercase text-subtle">Confirmation</dt>
        <dd className="font-mono text-text">{receipt.confirmation}</dd>
        <dt className="font-mono uppercase text-subtle">Request ID</dt>
        <dd className="min-w-0 break-all font-mono text-text">{receipt.request_id}</dd>
        <dt className="font-mono uppercase text-subtle">Approvals</dt>
        <dd className="min-w-0 break-all font-mono text-muted">
          {receipt.approval_ids.length ? receipt.approval_ids.join(", ") : "None"}
        </dd>
        <dt className="font-mono uppercase text-subtle">Input hash</dt>
        <dd className="min-w-0 truncate font-mono text-subtle" title={receipt.input_hash}>
          {receipt.input_hash}
        </dd>
      </dl>

      <details className="mt-2 border border-border/60 bg-bg/40">
        <summary className="cursor-pointer select-none px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-subtle hover:text-text">
          Raw
        </summary>
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1.5 p-2 text-[10px] leading-relaxed">
          <dt className="font-mono uppercase text-subtle">Arguments</dt>
          <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.arguments_summary)}</dd>
          <dt className="font-mono uppercase text-subtle">Policy</dt>
          <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.policy)}</dd>
          <dt className="font-mono uppercase text-subtle">Result</dt>
          <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.result)}</dd>
          <dt className="font-mono uppercase text-subtle">Receipt</dt>
          <dd className="min-w-0 break-all font-mono text-subtle">
            v{receipt.receipt_version} · {receipt.receipt_id}
          </dd>
        </dl>
      </details>

      {receipt.best_effort_error ? (
        <p className="mt-2 border border-warning/40 bg-warning/10 px-2 py-1.5 text-[10px] font-mono text-warning">
          Best-effort warning: {receipt.best_effort_error}
        </p>
      ) : null}
    </details>
  );
}

export default function ActivityHud() {
  const receipts = useSyncExternalStore(
    subscribeWebMcpActionReceipts,
    getWebMcpActionReceipts,
    () => EMPTY_RECEIPTS
  );
  const [collapsed, setCollapsed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Count receipts that arrived while minimized so the collapsed bar can show a "new" marker.
  const [seenCount, setSeenCount] = useState(0);
  const unread = collapsed ? Math.max(0, receipts.length - seenCount) : 0;

  const toggle = useCallback(() => {
    setSeenCount(receipts.length);
    setCollapsed((value) => !value);
  }, [receipts.length]);

  if (!receipts.length) return null;

  return (
    <aside
      data-testid="webmcp-activity-hud"
      data-collapsed={collapsed ? "true" : "false"}
      aria-label="Agent activity receipts"
      className="fixed bottom-0 left-0 right-0 z-40 border border-border bg-surface/95 shadow-2xl backdrop-blur-md lg:bottom-4 lg:left-4 lg:right-auto lg:w-[min(calc(100%-2rem),30rem)] lg:rounded lg:clip-corner"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-subtle">
            Agent Activity
            {unread > 0 ? (
              <span
                data-testid="webmcp-activity-unread"
                className="inline-flex items-center gap-1 border border-primary/50 bg-primary/10 px-1.5 py-0.5 normal-case tracking-normal text-primary"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {unread} new
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted">
            {receipts.length} redacted receipt{receipts.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!collapsed ? (
            confirmClear ? (
              <>
                <button
                  type="button"
                  data-testid="webmcp-activity-clear-confirm"
                  onClick={() => {
                    clearWebMcpActionReceipts();
                    setConfirmClear(false);
                  }}
                  className="border border-error px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-error hover:bg-error hover:text-bg"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted hover:text-text"
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="webmcp-activity-clear"
                onClick={() => setConfirmClear(true)}
                className="border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-error hover:text-error"
              >
                Clear
              </button>
            )
          ) : null}
          <button
            type="button"
            className="border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-primary hover:text-primary"
            aria-expanded={!collapsed}
            onClick={toggle}
          >
            {collapsed ? "Expand" : "Minimize"}
          </button>
        </div>
      </header>

      {!collapsed ? (
        <ol className="max-h-[50vh] space-y-2 overflow-auto p-2 lg:max-h-[65vh]" data-testid="webmcp-action-receipts">
          {receipts.map((receipt, index) => (
            <li key={receipt.receipt_id}>
              <ReceiptRow receipt={receipt} defaultOpen={index === 0} />
            </li>
          ))}
        </ol>
      ) : null}
    </aside>
  );
}
