import { memo } from "react";
import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { ThumbsUp, ThumbsDown, ExternalLink } from "lucide-react";
import StatusBadge from "../deals/StatusBadge";
import TemperatureGauge from "../deals/TemperatureGauge";
import { resolveCoverImageSrc } from "../media/cover-image";

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

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const imageLoader = ({ src }: ImageLoaderProps) => src;

function BrowseDealCard({ deal }: { deal: any }) {
  const t = useTranslations("browseDeals");
  const { locale } = useRouter();
  const coverImageSrc = resolveCoverImageSrc(deal?.cover_image);
  const merchant = deal.merchant_name || (deal.source_url ? extractHostname(deal.source_url) : null);

  return (
    <article className="group bg-surface border border-border rounded clip-corner overflow-hidden hover:border-border-strong transition-colors flex flex-col h-full">
      {/* Image with overlays */}
      <div className="relative h-48 border-b border-border overflow-hidden bg-surface-alt">
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
          <div className="flex items-center justify-center h-full text-subtle text-3xl font-mono">?</div>
        )}
        {/* Temperature overlay — bottom-left */}
        <div className="absolute bottom-2 left-2">
          <TemperatureGauge temperature={deal.temperature} status={deal.status} />
        </div>
        {/* Time ago overlay — top-right */}
        {deal.created_at && (
          <span className="absolute top-2 right-2 text-xs font-mono text-text bg-bg/80 backdrop-blur-sm px-2 py-0.5 rounded">
            {timeAgo(deal.created_at)}
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2.5 flex-1">
        {/* Status badge */}
        <StatusBadge status={deal.status} />

        {/* Title */}
        <h3 className="text-sm font-semibold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
          {deal.title}
        </h3>

        {/* Merchant */}
        {merchant && (
          <span className="text-xs font-mono text-muted truncate">
            {merchant}
          </span>
        )}

        {/* Tags */}
        {deal.tags && deal.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {deal.tags.map((tag: string) => (
              <span
                key={tag}
                className="text-xs font-mono font-bold uppercase px-2 py-0.5 border border-primary/60 text-primary rounded truncate"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer: price + votes */}
        <div className="mt-auto pt-3 border-t border-dashed border-border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-mono font-bold text-primary">
              {deal.price != null && deal.currency
                ? formatPrice(deal.price, deal.currency, locale || "en")
                : t("noPriceListed")}
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-mono text-secondary">
                <ThumbsUp size={10} />
                {deal.votes_up ?? 0}
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-mono text-error">
                <ThumbsDown size={10} />
                {deal.votes_down ?? 0}
              </span>
            </div>
          </div>

          {/* CTA button */}
          {deal.source_url && (
            <a
              href={deal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary hover:text-bg transition-colors"
            >
              {t("viewDeal")}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default memo(BrowseDealCard);
