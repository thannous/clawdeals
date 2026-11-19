import Link from "next/link";
import { useTranslations } from "next-intl";
import ConsoleTable, { type Column } from "../console/shared/ConsoleTable";
import EmptyState from "../console/shared/EmptyState";
import ErrorState from "../console/shared/ErrorState";
import SkeletonTable from "../console/shared/SkeletonTable";
import { formatDate } from "../console/shared/formatDate";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import { Badge, escrowStatusTone } from "../protected-checkout/Section";
import { splitTimeLeft, useNow } from "../protected-checkout/useNow";
import { formatMoney } from "./orderApi";
import { useOrders } from "./useOrders";

export default function MyOrdersPage() {
  const t = useTranslations("protectedCheckout");
  const { data: items, fetchState, error, reload } = useOrders();
  const now = useNow();

  const inspectionLabel = (row: any) => {
    if (row.status === "DELIVERED" && row.inspection?.ends_at) {
      const left = splitTimeLeft(row.inspection.ends_at, now);
      if (left && !left.over) {
        return t("inspection.listOpen", { left: t("inspection.timeLeft", { hours: left.hours, minutes: left.minutes }) });
      }
      return t("inspection.listEnded");
    }
    if (row.status === "CREATED" || row.status === "HOLD") return t("inspection.listNotStarted");
    return t("inspection.listEnded");
  };

  const columns: Column[] = [
    {
      key: "item",
      label: t("list.item"),
      cell: (row: any) => (
        <Link
          href={`/my/orders/${row.escrow_id}`}
          data-testid="my-orders-item-link"
          className="text-sm font-medium text-primary hover:underline whitespace-normal [overflow-wrap:anywhere]"
        >
          {row.listing_title || t("untitled")}
        </Link>
      )
    },
    {
      key: "role",
      label: t("list.role"),
      cell: (row: any) => (
        <span className="text-xs font-mono text-subtle">
          {(row.viewer_roles || []).map((role: string) => t(`role.${role}`)).join(" / ") || "\u2014"}
        </span>
      )
    },
    {
      key: "amount",
      label: t("list.amount"),
      cell: (row: any) => <span className="text-sm font-mono">{formatMoney(row.amount_gross_minor, row.currency)}</span>
    },
    {
      key: "status",
      label: t("list.status"),
      cell: (row: any) => (
        <div className="max-w-48 whitespace-normal">
          <Badge tone={escrowStatusTone(row.status)}>{t(`status.${row.status}`)}</Badge>
        </div>
      )
    },
    {
      key: "inspection",
      className: "hidden sm:table-cell",
      label: t("list.inspection"),
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{inspectionLabel(row)}</span>
    },
    {
      key: "created_at",
      className: "hidden sm:table-cell",
      label: t("list.created"),
      cell: (row: any) => <span className="text-xs font-mono text-subtle">{formatDate(row.created_at)}</span>
    }
  ];

  return (
    <div data-testid="my-orders-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="orders" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        {(fetchState === "idle" || fetchState === "loading") && <SkeletonTable columns={5} rows={6} />}
        {fetchState === "error" && <ErrorState message={error?.message || t("failedToLoad")} onRetry={() => reload()} />}
        {fetchState === "done" && items.length === 0 && <EmptyState title={t("noOrders")} subtitle={t("noOrdersHint")} />}
        {fetchState === "done" && items.length > 0 && (
          <ConsoleTable columns={columns} rows={items} getRowKey={(row) => row.escrow_id} />
        )}
      </main>
    </div>
  );
}
