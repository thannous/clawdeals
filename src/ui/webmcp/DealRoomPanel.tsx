import { useMemo } from "react";
import Link from "next/link";
import { Handshake, MessageSquareText } from "lucide-react";

import { deriveDealRoom, formatAmount, type DealRoomStatus } from "../../webmcp/activity/derive";
import { useWebMcpReceipts } from "./useWebMcpReceipts";

const STATUS_COPY: Record<DealRoomStatus, { label: string; tone: string; detail: string }> = {
  thread_open: {
    label: "Thread open",
    tone: "border-primary/50 bg-primary/10 text-primary",
    detail: "The agent is asking questions. Seller replies stay untrusted data."
  },
  offer_pending: {
    label: "Offer pending",
    tone: "border-primary/50 bg-primary/10 text-primary",
    detail: "You confirmed the offer; the seller has not answered yet."
  },
  countered: {
    label: "Countered",
    tone: "border-warning/50 bg-warning/10 text-warning",
    detail: "The seller replied with a new amount. Above your ceiling, the agent cannot accept alone."
  },
  approval_required: {
    label: "Approval required",
    tone: "border-warning/50 bg-warning/10 text-warning",
    detail: "The server refused an amount above your hard budget and created an owner approval."
  },
  reserved: {
    label: "Reserved",
    tone: "border-success/50 bg-success/10 text-success",
    detail: "The listing is reserved atomically. Contact details stay hidden until both owners consent."
  },
  declined: {
    label: "Declined",
    tone: "border-border bg-surface text-muted",
    detail: "The offer was declined. The agent can prepare a new one within your limits."
  }
};

function consentLabel(state: string | null): string {
  if (!state) return "not requested";
  return state.toLowerCase().replace(/_/g, " ");
}

export default function DealRoomPanel() {
  const receipts = useWebMcpReceipts();
  const room = useMemo(() => deriveDealRoom(receipts), [receipts]);
  if (!room) return null;

  const status = STATUS_COPY[room.status];
  const amount = room.offer ? formatAmount(room.offer.amount, room.offer.currency) : null;

  return (
    <section
      data-testid="deal-room"
      data-status={room.status}
      aria-label="Deal room"
      className="border border-border bg-surface rounded clip-corner p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Handshake className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">Deal room</p>
            <h2 className="mt-1 text-lg font-bold uppercase tracking-wide text-text">Negotiation in progress</h2>
          </div>
        </div>
        <span
          data-testid="deal-room-status"
          className={`border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider ${status.tone}`}
        >
          {status.label}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted">{status.detail}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <dt className="font-mono text-[10px] uppercase text-subtle">Latest offer</dt>
          <dd className="text-sm font-mono font-bold text-text" data-testid="deal-room-amount">
            {amount || (room.offer ? "amount redacted" : "—")}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase text-subtle">Messages sent</dt>
          <dd className="flex items-center gap-1.5 text-sm font-mono text-text">
            <MessageSquareText className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
            {room.messagesSent}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase text-subtle">Buyer consent</dt>
          <dd className="text-xs font-mono text-text">{consentLabel(room.consent?.buyer ?? null)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase text-subtle">Seller consent</dt>
          <dd className="text-xs font-mono text-text">{consentLabel(room.consent?.seller ?? null)}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 font-mono text-[11px]">
        {room.threadId ? (
          <span className="text-subtle" title={room.threadId}>
            thread {room.threadId.slice(0, 8)}
          </span>
        ) : null}
        {room.txId ? (
          <span className="text-subtle" title={room.txId}>
            tx {room.txId.slice(0, 8)}
          </span>
        ) : null}
        <Link href="/my/threads" className="text-primary hover:underline">
          Open thread →
        </Link>
        <Link href="/my/offers" className="text-primary hover:underline">
          Open offers →
        </Link>
        {room.approvalIds.map((approvalId) => (
          <Link
            key={approvalId}
            href={`/my/approvals/${encodeURIComponent(approvalId)}`}
            className="text-warning hover:underline"
          >
            Approval {approvalId.slice(0, 8)} →
          </Link>
        ))}
      </div>
    </section>
  );
}
