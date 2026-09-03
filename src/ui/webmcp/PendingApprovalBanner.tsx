import { useMemo } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { derivePendingApprovals, formatAmount, type PendingApproval } from "../../webmcp/activity/derive";
import { useWebMcpReceipts } from "./useWebMcpReceipts";

function describe(approval: PendingApproval, locale: string): { key: string; values?: Record<string, string> } {
  if (approval.kind === "consent") {
    return { key: "approvals.consentDescription" };
  }
  const amount = formatAmount(approval.amount, approval.currency, locale);
  const ceiling = formatAmount(approval.hardBudgetMax, approval.currency, locale);
  if (amount && ceiling) return { key: "approvals.aboveCeiling", values: { amount, ceiling } };
  if (amount) return { key: "approvals.policyRefused", values: { amount } };
  return { key: "approvals.policyLimit" };
}

export default function PendingApprovalBanner() {
  const t = useTranslations("webmcp");
  const locale = useLocale();
  const receipts = useWebMcpReceipts();
  const pending = useMemo(() => derivePendingApprovals(receipts), [receipts]);
  if (pending.length === 0) return null;

  const latest = pending[pending.length - 1];
  const count = pending.length;
  const description = describe(latest, locale);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pending-approval-banner"
      className="sticky top-16 z-30 border-y border-warning/50 bg-warning/10 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">
              {t("approvals.count", { count })}
            </p>
            <p className="text-xs text-muted">{t(description.key, description.values)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {count > 1 ? (
            <Link
              href="/my/approvals"
              className="border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted hover:border-primary hover:text-primary"
            >
              {t("approvals.all")}
            </Link>
          ) : null}
          <Link
            href={`/my/approvals/${encodeURIComponent(latest.approvalId)}`}
            data-testid="pending-approval-review"
            className="border border-warning bg-warning px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-bg hover:brightness-110"
          >
            {t("approvals.review")}
          </Link>
        </div>
      </div>
    </div>
  );
}
