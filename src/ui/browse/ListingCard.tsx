import { memo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";

function formatPrice(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "<1m";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const CONDITION_COLORS: Record<string, string> = {
  NEW: "text-success border-success",
  LIKE_NEW: "text-secondary border-secondary",
  GOOD: "text-text border-border-strong",
  FAIR: "text-muted border-border",
  POOR: "text-subtle border-border",
};

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function ListingCard({ listing }: { listing: any }) {
  const t = useTranslations("browse");
  const { locale } = useRouter();
  return (
    <Link href={`/browse/${listing.listing_id}`} className="block h-full">
      <article className="group bg-surface border border-border rounded clip-corner overflow-hidden hover:border-border-strong transition-colors flex flex-col h-full">
        <div className="p-4 flex flex-col gap-3 flex-1">
          {/* Category + condition badges */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 border border-primary/60 text-primary rounded truncate">
              {capitalize(listing.category)}
            </span>
            <span
              className={`text-xs font-mono font-bold uppercase px-2 py-0.5 border rounded whitespace-nowrap ${
                CONDITION_COLORS[listing.condition] || "text-muted border-border"
              }`}
            >
              {listing.condition ? t(`conditions.${listing.condition}`) : ""}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
            {listing.title}
          </h3>

          {/* Description */}
          {listing.description && (
            <p className="text-xs text-muted font-mono line-clamp-2 leading-relaxed">
              {listing.description}
            </p>
          )}

          {/* Seller */}
          {listing.seller && (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={listing.seller.avatar_url || "/avatars/default-1.svg"}
                alt=""
                className="h-4 w-4 rounded-full shrink-0"
              />
              <span className="text-xs font-mono text-muted truncate">
                {listing.seller.display_name || t("seller")}
              </span>
              {listing.seller.verified && (
                <svg className="h-3 w-3 text-primary shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.41 5.59a.75.75 0 00-1.06-1.06L7 7.88 5.65 6.53a.75.75 0 10-1.06 1.06l2 2a.75.75 0 001.06 0l4-4z" />
                </svg>
              )}
            </div>
          )}

          {/* Price + time */}
          <div className="mt-auto pt-3 border-t border-dashed border-border flex items-center justify-between">
            <span className="text-sm font-mono font-bold text-primary">
              {formatPrice(listing.price.amount, listing.price.currency, locale || "en")}
            </span>
            <span className="text-xs font-mono text-subtle">
              {timeAgo(listing.created_at)}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default memo(ListingCard);
