import { memo } from "react";
import Link from "next/link";
import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import {
  ShieldCheck,
  Package,
  Sparkles,
  CheckCircle2,
  Check,
  Minus,
  AlertTriangle,
} from "lucide-react";
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

const CONDITION_CLASSES: Record<string, string> = {
  NEW: "text-success border-success/60 bg-success/10",
  LIKE_NEW: "text-secondary border-secondary/60 bg-secondary/10",
  GOOD: "text-primary border-primary/60 bg-primary/10",
  FAIR: "text-muted border-border-strong bg-surface-alt",
  POOR: "text-subtle border-border bg-surface-alt",
};

const CONDITION_ICONS: Record<string, React.ElementType> = {
  NEW: Sparkles,
  LIKE_NEW: CheckCircle2,
  GOOD: Check,
  FAIR: Minus,
  POOR: AlertTriangle,
};

function capitalize(s: string) {
  if (!s) return s;
  const clean = s.split("_")[0];
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

const imageLoader = ({ src }: ImageLoaderProps) => src;

function resolveAvatarSrc(value: unknown): string {
  if (typeof value !== "string") return "/avatars/default-1.svg";
  const trimmed = value.trim();
  if (!trimmed) return "/avatars/default-1.svg";
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }
  return "/avatars/default-1.svg";
}

function ListingCard({ listing }: { listing: any }) {
  const t = useTranslations("browse");
  const { locale } = useRouter();
  const coverImageSrc = resolveCoverImageSrc(listing?.cover_image);
  const conditionClasses =
    CONDITION_CLASSES[listing.condition] || "text-muted border-border bg-surface-alt";
  const ConditionIcon = CONDITION_ICONS[listing.condition];

  return (
    <Link href={`/browse/${listing.listing_id}`} className="block h-full">
      <article className="group bg-surface border border-border rounded clip-corner overflow-hidden hover:border-primary/50 hover:shadow-[0_0_12px_var(--theme-primary-20)] transition-all flex flex-col h-full">

        {/* Image zone — only rendered when image is available */}
        {coverImageSrc ? (
          <div
            data-testid="listing-cover-zone"
            className="relative h-48 border-b border-border overflow-hidden bg-surface-alt shrink-0"
          >
            <Image
              data-testid="listing-cover-image"
              loader={imageLoader}
              unoptimized
              fill
              src={coverImageSrc}
              alt={listing.title || ""}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
            {listing.created_at && (
              <span className="absolute top-2 right-2 text-xs font-mono text-text bg-bg/80 backdrop-blur-sm px-2 py-0.5 rounded">
                {timeAgo(listing.created_at)}
              </span>
            )}
          </div>
        ) : null}

        {/* Content */}
        <div className="p-4 flex flex-col gap-2.5 flex-1">
          {/* Badge row: category (neutral) + condition (with icon) + timeAgo (if no image) */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono uppercase px-2 py-0.5 border border-border text-muted bg-transparent rounded truncate max-w-[50%]">
              {capitalize(listing.category)}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {listing.condition && (
                <span
                  className={`text-xs font-mono font-bold uppercase px-2 py-0.5 border rounded flex items-center gap-1 whitespace-nowrap ${conditionClasses}`}
                >
                  {ConditionIcon && <ConditionIcon size={11} />}
                  {t(`conditions.${listing.condition}`)}
                </span>
              )}
              {!coverImageSrc && listing.created_at && (
                <span className="text-xs font-mono text-subtle whitespace-nowrap">
                  {timeAgo(listing.created_at)}
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className="text-base font-semibold text-text line-clamp-2 leading-snug group-hover:text-primary transition-colors">
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
              <Image
                loader={imageLoader}
                unoptimized
                src={resolveAvatarSrc(listing.seller.avatar_url)}
                alt=""
                width={18}
                height={18}
                className="h-[18px] w-[18px] rounded-full shrink-0 border border-border"
              />
              <span className="text-xs font-mono text-muted truncate">
                {listing.seller.display_name || t("seller")}
              </span>
              {listing.seller.verified && (
                <ShieldCheck size={13} className="text-primary shrink-0" />
              )}
            </div>
          )}

          {/* Footer: price + CTA */}
          <div className="mt-auto pt-3 border-t border-dashed border-border flex flex-col gap-2.5">
            <span className="text-xl font-mono font-bold text-primary">
              {formatPrice(listing.price.amount, listing.price.currency, locale || "en")}
            </span>
            <div className="flex items-center justify-center gap-2 w-full py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded group-hover:bg-primary group-hover:text-bg transition-colors">
              {t("viewListing")}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default memo(ListingCard);
