import { useMemo } from "react";
import Link from "next/link";
import { Handshake, MessageSquareText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { deriveDealRoom, formatAmount, type DealRoomStatus } from "../../webmcp/activity/derive";
import { useWebMcpReceipts } from "./useWebMcpReceipts";

const STATUS_COPY: Record<DealRoomStatus, { labelKey: string; tone: string; detailKey: string }> = {
  thread_open: {
    labelKey: "dealRoom.status.threadOpen.label",
    tone: "border-primary/50 bg-primary/10 text-primary",
    detailKey: "dealRoom.status.threadOpen.detail"
  },
  offer_pending: {
    labelKey: "dealRoom.status.offerPending.label",
    tone: "border-primary/50 bg-primary/10 text-primary",
    detailKey: "dealRoom.status.offerPending.detail"
  },
  countered: {
    labelKey: "dealRoom.status.countered.label",
    tone: "border-warning/50 bg-warning/10 text-warning",
    detailKey: "dealRoom.status.countered.detail"
  },
  approval_required: {
    labelKey: "dealRoom.status.approvalRequired.label",
    tone: "border-warning/50 bg-warning/10 text-warning",
    detailKey: "dealRoom.status.approvalRequired.detail"
  },
  reserved: {
    labelKey: "dealRoom.status.reserved.label",
    tone: "border-success/50 bg-success/10 text-success",
    detailKey: "dealRoom.status.reserved.detail"
  },
  declined: {
    labelKey: "dealRoom.status.declined.label",
    tone: "border-border bg-surface text-muted",
    detailKey: "dealRoom.status.declined.detail"
  }
};

function consentKey(state: string | null): string {
  if (!state) return "dealRoom.consent.notRequested";
  const normalized = state.toLowerCase();
  return ["granted", "pending", "denied", "revoked"].includes(normalized)
    ? `dealRoom.consent.${normalized}`
    : "dealRoom.consent.unknown";
}

export default function DealRoomPanel() {
  const t = useTranslations("webmcp");
  const locale = useLocale();
  const receipts = useWebMcpReceipts();
  const room = useMemo(() => deriveDealRoom(receipts), [receipts]);
  if (!room) return null;

  const status = STATUS_COPY[room.status];
  const amount = room.offer ? formatAmount(room.offer.amount, room.offer.currency, locale) : null;

  return (
    <section
      data-testid="deal-room"
      data-status={room.status}
      aria-label={t("dealRoom.ariaLabel")}
      className="border border-border bg-surface rounded clip-corner p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Handshake className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">{t("dealRoom.eyebrow")}</p>
            <h2 className="mt-1 text-lg font-bold uppercase tracking-wide text-text">{t("dealRoom.title")}</h2>
          </div>
        </div>
        <span
          data-testid="deal-room-status"
          className={`border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider ${status.tone}`}
        >
          {t(status.labelKey)}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{t(status.detailKey)}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <dt className="font-mono text-[10px] uppercase text-subtle">{t("dealRoom.latestOffer")}</dt>
          <dd className="text-sm font-mono font-bold text-text" data-testid="deal-room-amount">
            {amount || (room.offer ? t("dealRoom.amountRedacted") : "—")}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase text-subtle">{t("dealRoom.messagesSent")}</dt>
          <dd className="flex items-center gap-1.5 text-sm font-mono text-text">
            <MessageSquareText className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
            {room.messagesSent}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase text-subtle">{t("dealRoom.buyerConsent")}</dt>
          <dd className="text-xs font-mono text-text">
            {t(consentKey(room.consent?.buyer ?? null), {
              state: room.consent?.buyer || ""
            })}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase text-subtle">{t("dealRoom.sellerConsent")}</dt>
          <dd className="text-xs font-mono text-text">
            {t(consentKey(room.consent?.seller ?? null), {
              state: room.consent?.seller || ""
            })}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 font-mono text-[11px]">
        {room.threadId ? (
          <span className="text-subtle" title={room.threadId}>
            {t("dealRoom.threadId", { id: room.threadId.slice(0, 8) })}
          </span>
        ) : null}
        {room.txId ? (
          <span className="text-subtle" title={room.txId}>
            {t("dealRoom.transactionId", { id: room.txId.slice(0, 8) })}
          </span>
        ) : null}
        <Link href="/my/threads" className="text-primary hover:underline">
          {t("dealRoom.openThread")} →
        </Link>
        <Link href="/my/offers" className="text-primary hover:underline">
          {t("dealRoom.openOffers")} →
        </Link>
        {room.approvalIds.map((approvalId) => (
          <Link
            key={approvalId}
            href={`/my/approvals/${encodeURIComponent(approvalId)}`}
            className="text-warning hover:underline"
          >
            {t("dealRoom.approval", { id: approvalId.slice(0, 8) })} →
          </Link>
        ))}
      </div>
    </section>
  );
}
