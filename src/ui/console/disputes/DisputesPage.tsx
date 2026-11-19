import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import ConsoleTable, { type Column } from "../shared/ConsoleTable";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import TruncatedId from "../shared/TruncatedId";
import { formatDate } from "../shared/formatDate";
import PageHeader from "../../shared/PageHeader";
import { Badge } from "../../protected-checkout/Section";
import { useConsoleResource } from "./useConsoleResource";

export default function DisputesPage() {
  const t = useTranslations("protectedCheckout");
  const filters = [null, "OPEN", "UNDER_REVIEW", "RESOLVED"];
  const [status, setStatus] = useState<string | null>("OPEN");
  const { data, fetchState, error, reload } = useConsoleResource(`/api/console/disputes${status ? `?status=${status}` : ""}`);
  const items: any[] = data?.disputes || [];

  const columns: Column[] = [
    {
      key: "item",
      label: t("list.item"),
      cell: (row: any) => (
        <div className="flex flex-col gap-1">
          <Link
            href={`/console/disputes/${row.dispute_id}`}
            data-testid="console-dispute-link"
            className="text-sm font-medium text-primary hover:underline whitespace-normal [overflow-wrap:anywhere]"
          >
            {row.listing_title || t("untitled")}
          </Link>
          <TruncatedId id={row.dispute_id} />
        </div>
      )
    },
    {
      key: "status",
      label: t("list.status"),
      cell: (row: any) => <Badge tone={row.status === "RESOLVED" ? "ok" : "warn"}>{t(`dispute.status.${row.status}`)}</Badge>
    },
    { key: "reason", label: t("dispute.reason"), cell: (row: any) => <span className="text-xs font-mono text-text">{t(`reasons.${row.reason_code}`)}</span> },
    { key: "opened_by", label: t("dispute.openedBy"), cell: (row: any) => <span className="text-xs font-mono text-subtle">{t(`dispute.party.${row.opened_by}`)}</span> },
    {
      key: "amount",
      label: t("list.amount"),
      cell: (row: any) => (
        <span className="text-sm font-mono">{row.amount_gross_minor != null ? `${row.amount_gross_minor} ${row.currency || ""}` : "\u2014"}</span>
      )
    },
    {
      key: "tracking",
      className: "hidden sm:table-cell",
      label: t("review.tracking"),
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{row.shipment_status ? t(`tracking.status.${row.shipment_status}`) : t("review.noTracking")}</span>
    },
    {
      key: "decision",
      className: "hidden sm:table-cell",
      label: t("dispute.decision"),
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{t(`dispute.resolution.${row.resolution}`)}</span>
    },
    {
      key: "opened_at",
      className: "hidden sm:table-cell",
      label: t("dispute.openedAt"),
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{formatDate(row.opened_at)}</span>
    }
  ];

  return (
    <div data-testid="console-disputes-page" className="min-h-screen bg-bg">
      <PageHeader title={t("review.title")} />

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-subtle uppercase mr-1">{t("list.status")}</span>
          {filters.map((filter) => (
            <button
              key={filter || "all"}
              type="button"
              onClick={() => setStatus(filter)}
              aria-pressed={status === filter}
              className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
                status === filter ? "border-primary/40 text-primary bg-primary/10" : "border-border text-subtle hover:border-border-strong"
              }`}
            >
              {filter ? t(`dispute.status.${filter}`) : t("review.all")}
            </button>
          ))}
        </div>

        {(fetchState === "idle" || fetchState === "loading") && <SkeletonTable columns={6} rows={8} />}
        {fetchState === "error" && <ErrorState message={error || t("review.failedList")} onRetry={() => reload()} />}
        {fetchState === "done" && items.length === 0 && (
          <EmptyState title={t("review.none")} subtitle={status ? t("review.noStatus") : t("review.noCases")} />
        )}
        {fetchState === "done" && items.length > 0 && (
          <ConsoleTable columns={columns} rows={items} getRowKey={(row) => row.dispute_id} />
        )}
      </main>
    </div>
  );
}
