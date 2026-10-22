import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import Link from "next/link";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import ConsoleStatusBadge from "../console/shared/ConsoleStatusBadge";
import TruncatedId from "../console/shared/TruncatedId";
import SmartphonePassportEditor from "../passport/SmartphonePassportEditor";
import ErrorState from "../console/shared/ErrorState";
import { formatDate } from "../console/shared/formatDate";

function formatPrice(amount: number, currency?: string): string {
  return `${amount.toFixed(2)} ${currency || ""}`.trim();
}

export default function MyListingDetailPage() {
  const t = useTranslations("myListings");
  const router = useRouter();
  const listingId = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;

  const [listing, setListing] = useState<any>(null);
  const [fetchState, setFetchState] = useState("idle");
  const [error, setError] = useState<string | null>(null);

  const fetchListing = useCallback(async (id: string) => {
    setFetchState("loading");
    try {
      const resp = await fetch(`/api/v1/owner/listings/${id}`);
      if (resp.status === 401) {
        const next = encodeURIComponent(router.asPath || "/my/listings");
        void router.replace(`/auth/login?next=${next}`);
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error?.message || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setListing(data?.data || null);
      setFetchState("done");
    } catch (err: any) {
      setError(err.message);
      setFetchState("error");
    }
  }, [router]);

  useEffect(() => {
    if (!listingId) return;
    fetchListing(listingId);
  }, [listingId, fetchListing]);

  return (
    <div data-testid="my-listing-detail-page" className="min-h-screen bg-bg">
      <PageHeader title={t("detail.title")}>
        <AppNav current="listings" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6 max-w-3xl">
        <button
          onClick={() => router.push("/my/listings")}
          className="text-xs font-mono text-muted hover:text-text transition-colors"
        >
          ← {t("detail.back")}
        </button>

        {fetchState === "loading" && (
          <div className="text-xs font-mono text-subtle animate-pulse">Loading…</div>
        )}
        {fetchState === "error" && (
          <ErrorState message={error || t("detail.failedToLoad")} onRetry={() => listingId && fetchListing(listingId)} />
        )}

        {fetchState === "done" && listing && (
          <div className="space-y-6">
            {/* Title + Status */}
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
              <h2 className="min-w-0 max-w-full text-lg font-bold text-text [overflow-wrap:anywhere]">{listing.title || "—"}</h2>
              <div className="max-w-full shrink-0 whitespace-normal [overflow-wrap:anywhere]">
                <ConsoleStatusBadge value={listing.status} label={t(`toolbar.status_${listing.status}`)} />
              </div>
            </div>

            {/* Pending approval banner */}
            {listing.status === "PENDING_APPROVAL" && (
              <div className="border border-warning/30 bg-warning/5 p-3">
                <div className="text-xs font-mono text-warning-muted">{t("detail.pendingApproval")}</div>
                <Link
                  href="/my/approvals"
                  className="text-xs font-mono text-primary hover:underline mt-1 inline-block"
                >
                  {t("detail.viewApproval")} →
                </Link>
              </div>
            )}

            <SmartphonePassportEditor key={listing.listing_id} listingId={listing.listing_id} listingStatus={listing.status} />

            {/* Detail grid */}
            <div className="bg-surface border border-border p-4 space-y-3">
              <DetailRow label={t("detail.listingId")}>
                <TruncatedId id={listing.listing_id} />
              </DetailRow>
              {listing.description && (
                <DetailRow label={t("detail.description")}>
                  <span className="text-sm text-text whitespace-pre-wrap">{listing.description}</span>
                </DetailRow>
              )}
              <DetailRow label={t("detail.category")}>
                <span className="text-xs font-mono text-subtle">{listing.category || "—"}</span>
              </DetailRow>
              {listing.condition && (
                <DetailRow label={t("detail.condition")}>
                  <span className="text-xs font-mono text-subtle">{listing.condition}</span>
                </DetailRow>
              )}
              <DetailRow label={t("detail.price")}>
                <span className="text-sm font-mono">
                  {listing.price_amount != null ? formatPrice(listing.price_amount, listing.currency) : "—"}
                </span>
              </DetailRow>
              <DetailRow label={t("detail.created")}>
                <span className="text-xs font-mono text-subtle">{formatDate(listing.created_at)}</span>
              </DetailRow>
              {listing.updated_at && (
                <DetailRow label={t("detail.updated")}>
                  <span className="text-xs font-mono text-subtle">{formatDate(listing.updated_at)}</span>
                </DetailRow>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 sm:flex-row sm:gap-4">
      <span className="text-xs font-mono text-subtle uppercase tracking-wider sm:min-w-[100px] shrink-0 pt-0.5">{label}</span>
      <div className="min-w-0 max-w-full [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}
