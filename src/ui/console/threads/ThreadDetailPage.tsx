import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useThreadDetail } from "./useThreadDetail";
import { useModerationAction } from "../moderation/useModerationAction";
import MessageCard from "./MessageCard";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import Pagination from "../shared/Pagination";
import ToastContainer from "../shared/Toast";
import { useToast } from "../shared/useToast";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import { formatDate } from "../shared/formatDate";

export default function ThreadDetailPage() {
  const router = useRouter();
  const threadId = useMemo(() => {
    const raw = router.query.thread_id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.thread_id]);

  const { thread, messages, messagesNextCursor, fetchState, loadMoreState, error, loadMoreMessages } =
    useThreadDetail({ threadId });
  const toast = useToast();
  const moderation = useModerationAction({
    onSuccess: () => {
      toast.show("Moderation action completed", "success");
    },
  });

  return (
    <div data-testid="thread-detail-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/console/threads"
            className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-primary transition-colors"
          >
            &larr; Back
          </Link>
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>THREAD
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {fetchState === "loading" && <SkeletonTable columns={4} rows={6} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load thread"} onRetry={() => router.reload()} />}

        {fetchState === "done" && thread && (
          <>
            {/* Metadata */}
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <ConsoleStatusBadge value={thread.status} variant="thread" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Thread ID</span>
                  <TruncatedId id={thread.thread_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Listing</span>
                  <Link
                    href={`/console/listings/${thread.listing_id}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TruncatedId id={thread.listing_id} stopPropagation={false} />
                  </Link>
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Buyer</span>
                  <TruncatedId id={thread.buyer_agent_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Seller</span>
                  <TruncatedId id={thread.seller_agent_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Created</span>
                  <span className="text-text tabular-nums">{formatDate(thread.created_at)}</span>
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Updated</span>
                  <span className="text-text tabular-nums">{formatDate(thread.updated_at)}</span>
                </div>
              </div>
            </section>

            {/* Message timeline */}
            <section className="space-y-3">
              <h3 className="text-[10px] font-mono font-bold text-subtle uppercase tracking-wider">
                Messages ({messages.length})
              </h3>
              {messages.length === 0 && (
                <p className="text-xs font-mono text-muted">No messages in this thread.</p>
              )}
              {messages.map((msg) => (
                <MessageCard key={msg.message_id} message={msg} />
              ))}
              <Pagination
                nextCursor={messagesNextCursor}
                loading={loadMoreState === "loading"}
                onLoadMore={loadMoreMessages}
              />
            </section>

            {/* Moderation actions */}
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-3">
              <h3 className="text-[10px] font-mono font-bold text-subtle uppercase tracking-wider">
                Moderation
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => moderation.execute("hide", { entity_type: "thread", entity_id: thread.thread_id, reason: "Manual hide from console" })}
                  disabled={moderation.submitState === "loading"}
                  className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-red-400 text-red-400 rounded hover:bg-red-400/10 disabled:opacity-50 transition-colors"
                >
                  Hide
                </button>
                <button
                  onClick={() => moderation.execute("unhide", { entity_type: "thread", entity_id: thread.thread_id, reason: "Manual unhide from console" })}
                  disabled={moderation.submitState === "loading"}
                  className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-secondary text-secondary rounded hover:bg-secondary/10 disabled:opacity-50 transition-colors"
                >
                  Unhide
                </button>
              </div>
              {moderation.error && (
                <p className="text-xs font-mono text-red-400">{moderation.error}</p>
              )}
            </section>
          </>
        )}
      </main>

      <ToastContainer toasts={toast.toasts} />
    </div>
  );
}
