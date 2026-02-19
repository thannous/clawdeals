import { memo } from "react";
import { ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";
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

const imageLoader = ({ src }: ImageLoaderProps) => src;

function DealCard({ deal, retryIn, onVote }) {
  const isExpired = deal.status === "EXPIRED";
  const voteDisabled = isExpired || retryIn > 0;
  const coverImageSrc = resolveCoverImageSrc(deal?.cover_image);

  return (
    <article
      data-testid="deal-card"
      className="group bg-surface border border-border rounded clip-corner p-4 hover:border-border-strong transition-colors"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {coverImageSrc && (
          <div className="relative h-14 w-20 border border-border rounded overflow-hidden shrink-0">
            <Image
              loader={imageLoader}
              unoptimized
              fill
              src={coverImageSrc}
              alt={deal?.title || ""}
              className="object-cover"
            />
          </div>
        )}

        {/* Status */}
        <div className="flex-shrink-0">
          <StatusBadge status={deal.status} />
        </div>

        {/* Title + Tags */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text truncate">
            <Link
              data-testid="deal-detail-link"
              href={`/deals/${deal.deal_id}`}
              className="hover:text-primary transition-colors"
            >
              {deal.title}
            </Link>
          </h3>
          {deal.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {deal.tags.map((tag) => (
                <span key={tag} className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface-alt text-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Price */}
        <div className="flex-shrink-0 text-right">
          {deal.price != null && (
            <span className="text-sm font-mono font-bold text-primary">
              {formatDealPrice(deal.price, deal.currency || "USD")} <span className="text-xs text-muted">{deal.currency || "USD"}</span>
            </span>
          )}
        </div>

        {/* Temperature */}
        <div className="flex-shrink-0">
          <TemperatureGauge temperature={deal.temperature} status={deal.status} />
        </div>

        {/* Votes */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span data-testid="votes-up" className="flex items-center gap-1 text-xs font-mono text-secondary">
            <ThumbsUp size={10} />
            {deal.votes_up ?? 0}
          </span>
          <span data-testid="votes-down" className="flex items-center gap-1 text-xs font-mono text-error">
            <ThumbsDown size={10} />
            {deal.votes_down ?? 0}
          </span>
        </div>

        {/* Vote Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            data-testid="vote-up-btn"
            onClick={() => onVote(deal, "up")}
            disabled={voteDisabled}
            title={isExpired ? "Deal expired" : retryIn > 0 ? `Retry in ${retryIn}s` : "Vote up"}
            className="p-1.5 rounded border border-border text-secondary hover:bg-secondary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ThumbsUp size={14} />
          </button>
          <button
            data-testid="vote-down-btn"
            onClick={() => onVote(deal, "down")}
            disabled={voteDisabled}
            title={isExpired ? "Deal expired" : retryIn > 0 ? `Retry in ${retryIn}s` : "Vote down"}
            className="p-1.5 rounded border border-border text-error hover:bg-error/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ThumbsDown size={14} />
          </button>
        </div>

        {/* Source Link */}
        {deal.source_url && (
          <a
            data-testid="source-link"
            href={deal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors flex-shrink-0"
          >
            <ExternalLink size={12} />
            <span>Source</span>
          </a>
        )}
      </div>
    </article>
  );
}

export default memo(DealCard);
