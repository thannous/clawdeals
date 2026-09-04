import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Bot, Bookmark, BookmarkCheck, Check, Share2 } from "lucide-react";

import {
  getFollowedListingIds,
  getServerFollowedListingIds,
  subscribeFollowedListings,
  toggleFollowedListing
} from "./followed-listings";
import { useOwnerSessionGate } from "../auth/useOwnerSessionGate";

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
  const sessionGate = useOwnerSessionGate();
  const followedIds = useSyncExternalStore(subscribeFollowedListings, getFollowedListingIds, getServerFollowedListingIds);
  const [serverFollow, setServerFollow] = useState<{ watchlist_id: string } | null>(null);
  const [followState, setFollowState] = useState<"idle" | "loading" | "error">("idle");
  const localFollowed = followedIds.includes(listing.listing_id);
  const followed = sessionGate === "authenticated" ? Boolean(serverFollow) : localFollowed;
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  // Following is browser-local until the visitor has an account: once they follow a
  // second listing they clearly want alerts, so that is the moment to say so.
  const showFollowNudge = sessionGate !== "authenticated" && followed && followedIds.length >= 2;

  useEffect(() => {
    if (sessionGate !== "authenticated") {
      setServerFollow(null);
      setFollowState("idle");
      return;
    }
    const controller = new AbortController();
    setFollowState("loading");
    fetch(`/api/v1/owner/watchlists?listing_id=${encodeURIComponent(listing.listing_id)}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        const watchlist = Array.isArray(body?.data?.watchlists) ? body.data.watchlists[0] : null;
        if (!controller.signal.aborted) {
          setServerFollow(watchlist?.watchlist_id ? watchlist : null);
          setFollowState("idle");
        }
      })
      .catch((error) => {
        if (error?.name !== "AbortError" && !controller.signal.aborted) setFollowState("error");
      });
    return () => controller.abort();
  }, [listing.listing_id, sessionGate]);

  const handleFollow = useCallback(async () => {
    if (sessionGate !== "authenticated") {
      toggleFollowedListing(listing.listing_id);
      return;
    }
    if (followState === "loading") return;

    setFollowState("loading");
    const idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${listing.listing_id}`;
    try {
      const response = serverFollow
        ? await fetch(`/api/v1/owner/watchlists/${encodeURIComponent(serverFollow.watchlist_id)}`, {
            method: "DELETE",
            credentials: "include",
            headers: { "Idempotency-Key": idempotencyKey }
          })
        : await fetch("/api/v1/owner/watchlists", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
            body: JSON.stringify({ listing_id: listing.listing_id })
          });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      setServerFollow(serverFollow ? null : body?.data?.watchlist || null);
      setFollowState("idle");
    } catch {
      setFollowState("error");
    }
  }, [followState, listing.listing_id, serverFollow, sessionGate]);

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
          onClick={handleFollow}
          disabled={sessionGate === "pending" || followState === "loading"}
          aria-pressed={followed}
          data-testid="listing-follow"
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 font-bold uppercase tracking-wider text-xs border transition-colors ${
            followed
              ? "border-secondary text-secondary bg-secondary/10"
              : "border-border text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          {followed ? <BookmarkCheck className="w-4 h-4" aria-hidden="true" /> : <Bookmark className="w-4 h-4" aria-hidden="true" />}
          {followState === "loading" ? t("actions.followSaving") : followed ? t("actions.following") : t("actions.follow")}
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
      {sessionGate === "authenticated" && followed ? (
        <p className="text-xs font-mono text-secondary" data-testid="listing-follow-server-hint">
          {t("actions.followServerHint")} {" "}
          <Link href={`${localePrefix}/my/watchlists`} className="underline underline-offset-4">
            {t("actions.viewWatchlists")}
          </Link>
        </p>
      ) : null}
      {followState === "error" ? (
        <p className="text-xs font-mono text-error" role="status">{t("actions.followError")}</p>
      ) : null}
      {showFollowNudge ? (
        <div className="border border-secondary/40 bg-secondary/5 p-3 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="listing-follow-nudge">
          <div className="flex-1">
            <p className="text-sm font-bold text-text">{t("followNudge.title")}</p>
            <p className="text-xs text-muted">{t("followNudge.body")}</p>
          </div>
          <Link
            href={`${localePrefix}/auth/login?mode=signup&next=${encodeURIComponent(`/browse/${listing.listing_id}`)}`}
            className="inline-flex items-center justify-center px-4 py-2 border border-secondary text-secondary text-xs font-bold uppercase tracking-wider hover:bg-secondary hover:text-bg transition-colors"
          >
            {t("followNudge.cta")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
