import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useListingDetail } from "./useListingDetail";
import { useModerationAction } from "../moderation/useModerationAction";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import TruncatedId from "../shared/TruncatedId";
import ToastContainer from "../shared/Toast";
import { useToast } from "../shared/useToast";
import ErrorState from "../shared/ErrorState";
import SkeletonTable from "../shared/SkeletonTable";
import { formatDate } from "../shared/formatDate";

export default function ListingDetailPage() {
  const router = useRouter();
  const listingId = useMemo(() => {
    const raw = router.query.listing_id;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [router.query.listing_id]);

  const { listing, fetchState, error } = useListingDetail({ listingId });
  const toast = useToast();
  const moderation = useModerationAction({
    onSuccess: () => {
      toast.show("Moderation action completed", "success");
    },
  });

  return (
    <div data-testid="listing-detail-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link
            href="/console/listings"
            className="inline-flex items-center gap-2 text-xs font-mono text-muted hover:text-primary transition-colors"
          >
            &larr; Back
          </Link>
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>LISTING
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="px-4 py-6 space-y-6">
        {fetchState === "loading" && <SkeletonTable columns={4} rows={6} />}

        {fetchState === "error" && <ErrorState message={error || "Failed to load listing"} onRetry={() => router.reload()} />}

        {fetchState === "done" && listing && (
          <>
            {/* Metadata grid */}
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <ConsoleStatusBadge value={listing.status} variant="listing" />
                {listing.condition && (
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-alt text-muted uppercase">
                    {listing.condition}
                  </span>
                )}
              </div>

              <h2 className="text-xl font-bold text-text leading-tight break-words">
                {listing.title || "Untitled"}
              </h2>

              {(listing.price_amount ?? listing.price) != null && (
                <div className="text-lg font-mono font-bold text-primary">
                  {listing.price_amount ?? listing.price}{" "}
                  <span className="text-sm text-muted">{listing.currency || "USD"}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Listing ID</span>
                  <TruncatedId id={listing.listing_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Seller Agent</span>
                  <TruncatedId id={listing.seller_agent_id} />
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Category</span>
                  <span className="text-text">{listing.category || "\u2014"}</span>
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Created</span>
                  <span className="text-text tabular-nums">{formatDate(listing.created_at)}</span>
                </div>
                <div className="border border-border bg-bg rounded clip-corner px-3 py-2 flex items-center justify-between gap-3">
                  <span className="text-subtle uppercase tracking-wider">Updated</span>
                  <span className="text-text tabular-nums">{formatDate(listing.updated_at)}</span>
                </div>
              </div>
            </section>

            {/* Description */}
            {listing.description && (
              <section className="border border-border bg-surface rounded clip-corner p-5">
                <h3 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-3">
                  Description
                </h3>
                <p className="text-sm font-mono text-text whitespace-pre-wrap break-words leading-relaxed">
                  {listing.description}
                </p>
              </section>
            )}

            {/* Cross-link to threads */}
            <section className="border border-border bg-surface rounded clip-corner p-5">
              <h3 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider mb-3">
                Related Threads
              </h3>
              <Link
                href={`/console/threads?listing_id=${listing.listing_id}`}
                className="text-xs font-mono text-primary hover:underline transition-colors"
              >
                View threads for this listing &rarr;
              </Link>
            </section>

            {/* Moderation actions */}
            <section className="border border-border bg-surface rounded clip-corner p-5 space-y-3">
              <h3 className="text-xs font-mono font-bold text-subtle uppercase tracking-wider">
                Moderation
              </h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => moderation.execute("hide", { entity_type: "listing", entity_id: listing.listing_id, reason: "Manual hide from console" })}
                  disabled={moderation.submitState === "loading"}
                  className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-error text-error rounded hover:bg-error/10 disabled:opacity-50 transition-colors"
                >
                  Hide
                </button>
                <button
                  onClick={() => moderation.execute("unhide", { entity_type: "listing", entity_id: listing.listing_id, reason: "Manual unhide from console" })}
                  disabled={moderation.submitState === "loading"}
                  className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-secondary text-secondary rounded hover:bg-secondary/10 disabled:opacity-50 transition-colors"
                >
                  Unhide
                </button>
              </div>
              {moderation.error && (
                <p className="text-xs font-mono text-error">{moderation.error}</p>
              )}
            </section>
          </>
        )}
      </main>

      <ToastContainer toasts={toast.toasts} />
    </div>
  );
}
