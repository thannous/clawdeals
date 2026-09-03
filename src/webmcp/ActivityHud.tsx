import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";

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

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--:--";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function compactJson(value: unknown): string {
  const encoded = JSON.stringify(value ?? null);
  return encoded.length > 260 ? `${encoded.slice(0, 257)}...` : encoded;
}

function resultLabel(receipt: ActionReceipt): { key: string; values?: Record<string, string> } {
  if (receipt.outcome === "pending") return { key: "activity.results.pending" };
  if (receipt.result && typeof receipt.result === "object" && !Array.isArray(receipt.result)) {
    const result = receipt.result as Record<string, unknown>;
    for (const key of ["message", "listing_status", "status", "state", "code"]) {
      if (typeof result[key] === "string" && result[key]) return { key: "activity.results.reported", values: { value: String(result[key]) } };
    }
  }
  return { key: receipt.outcome === "success"
    ? "activity.results.completed"
    : receipt.outcome === "denied"
      ? "activity.results.denied"
      : "activity.results.unknown" };
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
  const t = useTranslations("webmcp");
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
      {state === "copied" ? t("common.copied") : state === "failed" ? t("common.copyFailed") : label}
    </button>
  );
}

function ReceiptRow({ receipt, defaultOpen }: { receipt: ActionReceipt; defaultOpen: boolean }) {
  const t = useTranslations("webmcp");
  const locale = useLocale();
  const chip = describePolicyDecision(receipt.policy);
  const result = resultLabel(receipt);
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
            {formatTime(receipt.timestamp, locale)}
          </time>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-xs font-mono font-semibold text-text">{receipt.tool.name}</span>
              <span
                data-testid="webmcp-receipt-outcome"
                className={`border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${OUTCOME_STYLES[receipt.outcome]}`}
              >
                {t(`activity.outcomes.${receipt.outcome}`)}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-muted">{t(result.key, result.values)}</p>
            <span
              data-testid="webmcp-receipt-policy-chip"
              data-tone={chip.tone}
              className={`mt-1 inline-block border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${CHIP_STYLES[chip.tone]}`}
            >
              {t(chip.labelKey, chip.values)}
            </span>
          </div>
          <span aria-hidden="true" className="text-xs text-subtle group-open:rotate-90">
            ›
          </span>
        </div>
      </summary>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <CopyButton label={t("activity.copyRequestId")} text={receipt.request_id} testId="webmcp-receipt-copy-request-id" />
        <CopyButton label={t("activity.copyReceipt")} text={JSON.stringify(receipt, null, 2)} testId="webmcp-receipt-copy-receipt" />
        {receipt.link ? (
          <a
            href={receipt.link}
            className="ml-auto inline-flex text-[10px] font-mono uppercase tracking-wider text-primary hover:underline"
          >
            {t("activity.openRelated")} →
          </a>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1.5 text-[10px] leading-relaxed">
        <dt className="font-mono uppercase text-subtle">{t("activity.fields.actor")}</dt>
        <dd className="font-mono text-text">{receipt.actor}</dd>
        <dt className="font-mono uppercase text-subtle">{t("activity.fields.confirmation")}</dt>
        <dd className="font-mono text-text">{receipt.confirmation}</dd>
        <dt className="font-mono uppercase text-subtle">{t("activity.fields.requestId")}</dt>
        <dd className="min-w-0 break-all font-mono text-text">{receipt.request_id}</dd>
        <dt className="font-mono uppercase text-subtle">{t("activity.fields.approvals")}</dt>
        <dd className="min-w-0 break-all font-mono text-muted">
          {receipt.approval_ids.length ? receipt.approval_ids.join(", ") : t("common.none")}
        </dd>
        <dt className="font-mono uppercase text-subtle">{t("activity.fields.inputHash")}</dt>
        <dd className="min-w-0 truncate font-mono text-subtle" title={receipt.input_hash}>
          {receipt.input_hash}
        </dd>
      </dl>

      <details className="mt-2 border border-border/60 bg-bg/40">
        <summary className="cursor-pointer select-none px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-subtle hover:text-text">
          {t("activity.raw")}
        </summary>
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1.5 p-2 text-[10px] leading-relaxed">
          <dt className="font-mono uppercase text-subtle">{t("activity.fields.arguments")}</dt>
          <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.arguments_summary)}</dd>
          <dt className="font-mono uppercase text-subtle">{t("activity.fields.policy")}</dt>
          <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.policy)}</dd>
          <dt className="font-mono uppercase text-subtle">{t("activity.fields.result")}</dt>
          <dd className="min-w-0 break-all font-mono text-muted">{compactJson(receipt.result)}</dd>
          <dt className="font-mono uppercase text-subtle">{t("activity.fields.receipt")}</dt>
          <dd className="min-w-0 break-all font-mono text-subtle">
            v{receipt.receipt_version} · {receipt.receipt_id}
          </dd>
        </dl>
      </details>

      {receipt.best_effort_error ? (
        <p className="mt-2 border border-warning/40 bg-warning/10 px-2 py-1.5 text-[10px] font-mono text-warning">
          {t("activity.bestEffort", { error: receipt.best_effort_error })}
        </p>
      ) : null}
    </details>
  );
}

export default function ActivityHud() {
  const t = useTranslations("webmcp");
  const receipts = useSyncExternalStore(
    subscribeWebMcpActionReceipts,
    getWebMcpActionReceipts,
    () => EMPTY_RECEIPTS
  );
  // On small screens the open drawer would cover the form the judge is about to use, so start minimized.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 1023px)").matches
  );
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
      aria-label={t("activity.ariaLabel")}
      className="fixed bottom-0 left-0 right-0 z-40 border border-border bg-surface/95 shadow-2xl backdrop-blur-md lg:bottom-4 lg:left-4 lg:right-auto lg:w-[min(calc(100%-2rem),30rem)] lg:rounded lg:clip-corner"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-subtle">
            {t("activity.title")}
            {unread > 0 ? (
              <span
                data-testid="webmcp-activity-unread"
                className="inline-flex items-center gap-1 border border-primary/50 bg-primary/10 px-1.5 py-0.5 normal-case tracking-normal text-primary"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {t("activity.newCount", { count: unread })}
              </span>
            ) : null}
          </div>
          <div className="text-xs text-muted">
            {t("activity.receiptCount", { count: receipts.length })}
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
                  {t("activity.clearAll")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted hover:text-text"
                >
                  {t("activity.keep")}
                </button>
              </>
            ) : (
              <button
                type="button"
                data-testid="webmcp-activity-clear"
                onClick={() => setConfirmClear(true)}
                className="border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-error hover:text-error"
              >
                {t("activity.clear")}
              </button>
            )
          ) : null}
          <button
            type="button"
            className="border border-border px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted hover:border-primary hover:text-primary"
            aria-expanded={!collapsed}
            onClick={toggle}
          >
            {collapsed ? t("activity.expand") : t("activity.minimize")}
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
