import { memo } from "react";
import { ThumbsUp, ThumbsDown, ExternalLink, MapPin } from "lucide-react";
import { useRouter } from "next/router";
import Link from "next/link";
import Image, { type ImageLoaderProps } from "next/image";
import StatusBadge from "./StatusBadge";
import TemperatureGauge from "./TemperatureGauge";
import { resolveCoverImageSrc } from "../media/cover-image";

function formatDealPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return String(price);
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

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const imageLoader = ({ src }: ImageLoaderProps) => src;

function DealCard({ deal, retryIn, onVote }) {
  const router = useRouter();
  const dealHref = `/deals/${deal.deal_id}`;
  const isExpired = deal.status === "EXPIRED";
  const voteDisabled = isExpired || retryIn > 0;
  const coverImageSrc = resolveCoverImageSrc(deal?.cover_image);
  const merchant = deal.merchant_name || (deal.source_url ? extractHostname(deal.source_url) : null);

  const handleCardClick = (e) => {
    // Don't navigate if clicking on interactive elements (buttons, links)
    if ((e.target as HTMLElement).closest("a, button")) return;
    router.push(dealHref);
  };

  return (
      <article
        data-testid="deal-card"
        onClick={handleCardClick}
        className="group cursor-pointer bg-surface border border-border rounded clip-corner hover:border-border-strong transition-colors flex flex-col md:flex-row overflow-hidden"
      >
        {/* Image — mobile: full width / desktop: fixed sidebar */}
        <div className="relative w-full h-40 md:h-auto md:w-[180px] shrink-0 border-b md:border-b-0 md:border-r border-border bg-surface-alt overflow-hidden">
          {coverImageSrc ? (
            <Image
              loader={imageLoader}
              unoptimized
              fill
              src={coverImageSrc}
              alt={deal?.title || ""}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-subtle text-2xl font-mono">?</div>
          )}
        </div>

        {/* Content zone */}
        <div className="flex-1 min-w-0 p-4 flex flex-col gap-2">
          {/* Top row: status + merchant + time */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={deal.status} />
            {deal.deal_type && deal.deal_type !== "ONLINE" && (
              <span className="inline-flex items-center gap-1 text-xs font-mono text-secondary">
                <MapPin size={10} />
                LOCAL
              </span>
            )}
            {merchant && (
              <span className="text-xs font-mono text-muted truncate max-w-[180px]">
                {merchant}
              </span>
            )}
            {deal.created_at && (
              <span className="text-xs font-mono text-subtle ml-auto shrink-0">
                {timeAgo(deal.created_at)}
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-text line-clamp-2 leading-snug">
            <Link
              data-testid="deal-detail-link"
              href={dealHref}
              className="transition-colors group-hover:text-primary hover:underline focus-visible:underline underline-offset-2"
            >
              {deal.title}
            </Link>
          </h3>

          {/* Tags */}
          {deal.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {deal.tags.map((tag) => (
                <span key={tag} className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-alt text-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Bottom row: price + CTA */}
          <div className="flex items-center gap-3 mt-auto pt-2">
            {deal.price != null && (
              <span className="text-lg font-mono font-bold text-primary">
                {formatDealPrice(deal.price, deal.currency || "USD")}{" "}
                <span className="text-xs text-muted">{deal.currency || "USD"}</span>
              </span>
            )}
            {deal.source_url && (
              <a
                data-testid="source-link"
                href={deal.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
              >
                View Deal
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>

        {/* Actions sidebar — desktop only */}
        <div className="hidden md:flex flex-col items-center justify-center gap-3 p-4 border-l border-border shrink-0 w-[90px]">
          <button
            data-testid="vote-up-btn"
            onClick={() => onVote(deal, "up")}
            disabled={voteDisabled}
            title={isExpired ? "Deal expired" : retryIn > 0 ? `Retry in ${retryIn}s` : "Vote up"}
            className="p-1.5 rounded border border-border text-secondary hover:bg-secondary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ThumbsUp size={14} />
          </button>
          <span data-testid="votes-up" className="flex items-center gap-1 text-xs font-mono text-secondary">
            <ThumbsUp size={10} />
            {deal.votes_up ?? 0}
          </span>
          <span data-testid="votes-down" className="flex items-center gap-1 text-xs font-mono text-error">
            <ThumbsDown size={10} />
            {deal.votes_down ?? 0}
          </span>
          <button
            data-testid="vote-down-btn"
            onClick={() => onVote(deal, "down")}
            disabled={voteDisabled}
            title={isExpired ? "Deal expired" : retryIn > 0 ? `Retry in ${retryIn}s` : "Vote down"}
            className="p-1.5 rounded border border-border text-error hover:bg-error/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ThumbsDown size={14} />
          </button>
          <div className="mt-1">
            <TemperatureGauge temperature={deal.temperature} status={deal.status} />
          </div>
        </div>

        {/* Actions bottom bar — mobile only */}
        <div className="flex md:hidden items-center justify-between px-4 py-3 border-t border-border">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onVote(deal, "up")}
              disabled={voteDisabled}
              title={isExpired ? "Deal expired" : retryIn > 0 ? `Retry in ${retryIn}s` : "Vote up"}
              className="inline-flex items-center gap-1 p-1.5 rounded border border-border text-secondary hover:bg-secondary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ThumbsUp size={14} />
              <span className="text-xs font-mono">{deal.votes_up ?? 0}</span>
            </button>
            <button
              onClick={() => onVote(deal, "down")}
              disabled={voteDisabled}
              title={isExpired ? "Deal expired" : retryIn > 0 ? `Retry in ${retryIn}s` : "Vote down"}
              className="inline-flex items-center gap-1 p-1.5 rounded border border-border text-error hover:bg-error/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ThumbsDown size={14} />
              <span className="text-xs font-mono">{deal.votes_down ?? 0}</span>
            </button>
          </div>
        </div>
      </article>
  );
}

export default memo(DealCard);
