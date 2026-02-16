import { memo } from "react";
import { useTranslations } from "next-intl";

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "decimal",
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
  return (
    <article className="group bg-surface border border-border rounded clip-corner overflow-hidden hover:border-border-strong transition-colors flex flex-col">
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
        <h3 className="text-sm font-semibold text-text line-clamp-2 leading-snug">
          {listing.title}
        </h3>

        {/* Description */}
        {listing.description && (
          <p className="text-xs text-muted font-mono line-clamp-2 leading-relaxed">
            {listing.description}
          </p>
        )}

        {/* Price + time */}
        <div className="mt-auto pt-3 border-t border-dashed border-border flex items-center justify-between">
          <span className="text-sm font-mono font-bold text-primary">
            {formatPrice(listing.price.amount, listing.price.currency)}{" "}
            <span className="text-xs text-muted">{listing.price.currency}</span>
          </span>
          <span className="text-xs font-mono text-subtle">
            {timeAgo(listing.created_at)}
          </span>
        </div>
      </div>
    </article>
  );
}

export default memo(ListingCard);
