import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Bot, Bookmark, BookmarkCheck, Check, Share2 } from "lucide-react";

import {
  getFollowedListingIds,
  getServerFollowedListingIds,
  subscribeFollowedListings,
  toggleFollowedListing
} from "./followed-listings";

export type ListingActionTarget = {
  listing_id: string;
  title?: string | null;
  category?: string | null;
  price?: { amount?: number | null; currency?: string | null } | null;
  market_code?: string | null;
  geo?: { lat: number; lng: number } | null;
};

/**
 * Builds the `/webmcp` URL that opens the Deal Mission form prefilled from a listing.
 * Only public, non-identifying fields travel in the query string.
 */
export function buildAskMyAgentHref(localePrefix: string, listing: ListingActionTarget): string {
  const params = new URLSearchParams();
  params.set("listing", listing.listing_id);
  if (listing.title) params.set("title", listing.title.slice(0, 120));
  if (listing.category) params.set("category", String(listing.category));
  if (typeof listing.price?.amount === "number") params.set("price", String(listing.price.amount));
  if (listing.price?.currency) params.set("currency", String(listing.price.currency));
  if (listing.market_code) params.set("market", String(listing.market_code));
  if (listing.geo) {
    params.set("lat", String(listing.geo.lat));
    params.set("lng", String(listing.geo.lng));
  }
  return `${localePrefix}/webmcp?${params.toString()}#buy-mission`;
}

export default function ListingHumanActions({
  listing,
  localePrefix
}: {
  listing: ListingActionTarget;
  localePrefix: string;
}) {
  const t = useTranslations("browse");
  const followedIds = useSyncExternalStore(subscribeFollowedListings, getFollowedListingIds, getServerFollowedListingIds);
  const followed = followedIds.includes(listing.listing_id);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");

  const handleShare = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = listing.title || "ClawDeals";
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2000);
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      setShareState("failed");
      window.setTimeout(() => setShareState("idle"), 2000);
    }
  }, [listing.title]);

  return (
    <div className="border border-border bg-surface p-4 space-y-3" data-testid="listing-human-actions">
      <p className="text-sm text-muted">{t("actions.lead")}</p>
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Link
          href={buildAskMyAgentHref(localePrefix, listing)}
          data-testid="listing-ask-agent"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 font-bold uppercase tracking-wider text-xs border border-primary bg-primary text-bg hover:bg-text hover:border-text transition-colors"
        >
          <Bot className="w-4 h-4" aria-hidden="true" />
          {t("actions.askAgent")}
        </Link>
        <button
          type="button"
          onClick={() => toggleFollowedListing(listing.listing_id)}
          aria-pressed={followed}
          data-testid="listing-follow"
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 font-bold uppercase tracking-wider text-xs border transition-colors ${
            followed
              ? "border-secondary text-secondary bg-secondary/10"
              : "border-border text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          {followed ? <BookmarkCheck className="w-4 h-4" aria-hidden="true" /> : <Bookmark className="w-4 h-4" aria-hidden="true" />}
          {followed ? t("actions.following") : t("actions.follow")}
        </button>
        <button
          type="button"
          onClick={handleShare}
          data-testid="listing-share"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 font-bold uppercase tracking-wider text-xs border border-border text-muted hover:border-border-strong hover:text-text transition-colors"
        >
          {shareState === "copied" ? <Check className="w-4 h-4" aria-hidden="true" /> : <Share2 className="w-4 h-4" aria-hidden="true" />}
          {shareState === "copied" ? t("actions.linkCopied") : shareState === "failed" ? t("actions.shareFailed") : t("actions.share")}
        </button>
      </div>
      <p className="text-xs font-mono text-subtle">{t("actions.askAgentHint")}</p>
    </div>
  );
}
