import Link from "next/link";
import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useTheme } from "../../theme/theme-context";
import { resolveSupportedLocale } from "../../shared/i18n";
import { getPublicAppEntryHref } from "../../shared/urls";
import { resolveCoverImageSrc } from "../media/cover-image";
import { NavbarCurrent } from "../landing/Navbar";

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

const CONDITION_COLORS: Record<string, string> = {
  NEW: "text-success border-success",
  LIKE_NEW: "text-secondary border-secondary",
  GOOD: "text-text border-border-strong",
  FAIR: "text-muted border-border",
  POOR: "text-subtle border-border",
};

const avatarLoader = ({ src }: ImageLoaderProps) => src;

function resolveAvatarSrc(value: unknown): string {
  if (typeof value !== "string") return "/avatars/default-1.svg";
  const trimmed = value.trim();
  if (!trimmed) return "/avatars/default-1.svg";
  if (trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return "/avatars/default-1.svg";
}

type BrowseListingDetailPageProps = {
  listing: any;
};

export default function BrowseListingDetailPage({ listing }: BrowseListingDetailPageProps) {
  const t = useTranslations("browse");
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const { themeId, setTheme, themes } = useTheme();
  const coverImageSrc = resolveCoverImageSrc(listing?.cover_image);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-bg">
      <NavbarCurrent themeId={themeId} setTheme={setTheme} themes={themes} />

      <main id="main-content" tabIndex={-1} className="pt-20 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          {/* Back link */}
          <Link
            href={`${localePrefix}/browse`}
            className="inline-flex items-center gap-1 text-xs font-mono text-muted hover:text-text transition-colors mb-6"
          >
            ← {t("detail.back")}
          </Link>

          {!listing ? (
            <div className="text-center py-16">
              <p className="text-sm font-mono text-muted">{t("detail.notFound")}</p>
              <Link
                href={`${localePrefix}/browse`}
                className="inline-block mt-4 text-xs font-mono text-primary hover:underline"
              >
                {t("detail.backToListings")}
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Category + condition badges */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 border border-primary/60 text-primary rounded">
                  {listing.category}
                </span>
                {listing.condition && (
                  <span
                    className={`text-xs font-mono font-bold uppercase px-2 py-0.5 border rounded ${
                      CONDITION_COLORS[listing.condition] || "text-muted border-border"
                    }`}
                  >
                    {t(`conditions.${listing.condition}`)}
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-2xl md:text-3xl font-bold text-text break-words">
                {listing.title}
              </h1>

              {/* Price */}
              <div className="text-xl font-mono font-bold text-primary">
                {formatPrice(listing.price.amount, listing.price.currency, locale)}
              </div>

              {coverImageSrc && (
                <div className="relative w-full aspect-[16/10] border border-border overflow-hidden bg-surface">
                  <Image
                    loader={avatarLoader}
                    unoptimized
                    fill
                    src={coverImageSrc}
                    alt={listing.title || ""}
                    className="object-cover"
                  />
                </div>
              )}

              {/* Description */}
              {listing.description && (
                <div className="bg-surface border border-border p-4">
                  <div className="text-xs font-mono text-subtle uppercase tracking-wider mb-2">
                    {t("detail.description")}
                  </div>
                  <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">
                    {listing.description}
                  </p>
                </div>
              )}

              {/* Details grid */}
              <div className="bg-surface border border-border p-4 space-y-3">
                {listing.delivery_method && (
                  <DetailRow label={t("detail.deliveryMethod")}>
                    <span className="text-xs font-mono text-text">{listing.delivery_method}</span>
                  </DetailRow>
                )}
                {listing.country && (
                  <DetailRow label={t("detail.country")}>
                    <span className="text-xs font-mono text-text">{listing.country}</span>
                  </DetailRow>
                )}
                <DetailRow label={t("detail.created")}>
                  <span className="text-xs font-mono text-subtle">
                    {dateFormatter.format(new Date(listing.created_at))}
                  </span>
                </DetailRow>
                {listing.updated_at && (
                  <DetailRow label={t("detail.updated")}>
                    <span className="text-xs font-mono text-subtle">
                      {dateFormatter.format(new Date(listing.updated_at))}
                    </span>
                  </DetailRow>
                )}
              </div>

              {/* Seller */}
              {listing.seller && (
                <div className="bg-surface border border-border p-4">
                  <div className="text-xs font-mono text-subtle uppercase tracking-wider mb-2">
                    {t("seller")}
                  </div>
                  <div className="flex items-center gap-3">
                    <Image
                      loader={avatarLoader}
                      unoptimized
                      src={resolveAvatarSrc(listing.seller.avatar_url)}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full"
                    />
                    <span className="text-sm font-mono text-text">
                      {listing.seller.display_name || t("seller")}
                    </span>
                    {listing.seller.verified && (
                      <svg className="h-4 w-4 text-primary shrink-0" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.41 5.59a.75.75 0 00-1.06-1.06L7 7.88 5.65 6.53a.75.75 0 10-1.06 1.06l2 2a.75.75 0 001.06 0l4-4z" />
                      </svg>
                    )}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div className="border border-border bg-surface p-6 text-center space-y-3">
                <p className="text-sm font-mono text-muted">{t("detail.ctaText")}</p>
                <Link
                  href={getPublicAppEntryHref(localePrefix)}
                  data-acquisition-cta="browse"
                  className="inline-block px-6 py-2.5 font-bold uppercase tracking-wider text-sm border border-primary bg-primary text-bg hover:bg-text hover:border-text transition-colors"
                >
                  {t("detail.ctaButton")}
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-xs font-mono text-subtle uppercase tracking-wider min-w-[120px] shrink-0 pt-0.5">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
