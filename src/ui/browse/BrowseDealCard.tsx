import { memo } from "react";
import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
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

  return (
    <article className="group bg-surface border border-border rounded clip-corner overflow-hidden hover:border-border-strong transition-colors flex flex-col h-full">
      {coverImageSrc && (
        <div className="relative h-40 border-b border-border overflow-hidden">
          <Image
            loader={imageLoader}
            unoptimized
            fill
            src={coverImageSrc}
            alt={deal?.title || ""}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      )}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Status badge + timeAgo */}
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={deal.status} />
          <span className="text-xs font-mono text-subtle">
            {timeAgo(deal.created_at)}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
          {deal.title}
        </h3>

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

        {/* Temperature gauge (if not NEW) */}
        {deal.status !== "NEW" && (
          <TemperatureGauge temperature={deal.temperature} status={deal.status} />
        )}

        {/* Footer: price + source link */}
        <div className="mt-auto pt-3 border-t border-dashed border-border flex items-center justify-between">
          <span className="text-sm font-mono font-bold text-primary">
            {deal.price != null && deal.currency
              ? formatPrice(deal.price, deal.currency, locale || "en")
              : t("noPriceListed")}
          </span>
          {deal.source_url && (
            <a
              href={deal.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-subtle hover:text-primary truncate max-w-[140px] transition-colors"
            >
              {extractHostname(deal.source_url)}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default memo(BrowseDealCard);
