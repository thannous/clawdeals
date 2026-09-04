import Link from "next/link";
import Image, { type ImageLoaderProps } from "next/image";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { ExternalLink, MapPin } from "lucide-react";
import { useTheme } from "../../theme/theme-context";
import { resolveSupportedLocale } from "../../shared/i18n";
import { getPublicAppEntryHref } from "../../shared/urls";
import { resolveCoverImageSrc } from "../media/cover-image";
import StatusBadge from "../deals/StatusBadge";
import { NavbarCurrent } from "../landing/Navbar";
import OwnerDealVote from "./OwnerDealVote";

function formatPrice(amount: number | null, currency: string | null, locale: string): string {
  if (amount === null || amount === undefined || !currency) return "—";
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

const imageLoader = ({ src }: ImageLoaderProps) => src;

type BrowseDealDetailPageProps = {
  deal: any;
};

export default function BrowseDealDetailPage({ deal }: BrowseDealDetailPageProps) {
  const t = useTranslations("browseDeals");
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const { themeId, setTheme, themes } = useTheme();
  const coverImageSrc = resolveCoverImageSrc(deal?.cover_image);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div data-testid="browse-deal-detail-page" className="min-h-screen bg-bg">
      <NavbarCurrent themeId={themeId} setTheme={setTheme} themes={themes} />

      <main id="main-content" tabIndex={-1} className="pt-20 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <Link
            data-testid="browse-deal-back"
            href={`${localePrefix}/browse/deals`}
            className="inline-flex items-center gap-1 text-xs font-mono text-muted hover:text-text transition-colors mb-6"
          >
            ← {t("detail.back")}
          </Link>

          {!deal ? (
            <div className="text-center py-16">
              <p className="text-sm font-mono text-muted">{t("detail.notFound")}</p>
              <Link
                href={`${localePrefix}/browse/deals`}
                className="inline-block mt-4 text-xs font-mono text-primary hover:underline"
              >
                {t("detail.backToDeals")}
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge status={deal.status} />
                {deal.deal_type === "LOCAL" && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono border border-secondary/60 text-secondary rounded uppercase">
                    <MapPin size={11} />
                    LOCAL
                  </span>
                )}
              </div>

              <h1 className="text-2xl md:text-3xl font-bold text-text break-words">
                {deal.title}
              </h1>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-xl font-mono font-bold text-primary">
                  {formatPrice(deal.price, deal.currency, locale)}
                </div>
                {deal.source_url && (
                  <a
                    href={deal.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
                  >
                    {t("detail.openSource")}
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <OwnerDealVote deal={deal} localePrefix={localePrefix} />

              {coverImageSrc && (
                <div className="relative w-full aspect-[16/10] border border-border overflow-hidden bg-surface">
                  <Image
                    loader={imageLoader}
                    unoptimized
                    fill
                    src={coverImageSrc}
                    alt={deal.title || ""}
                    className="object-cover"
                  />
                </div>
              )}

              <div className="bg-surface border border-border p-4 space-y-3">
                {deal.source_url && (
                  <DetailRow label={t("detail.source")}>
                    <a
                      href={deal.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-primary hover:underline break-all"
                    >
                      {deal.source_url}
                    </a>
                  </DetailRow>
                )}
                {deal.merchant_name && (
                  <DetailRow label={t("detail.merchant")}>
                    <span className="text-xs font-mono text-text">{deal.merchant_name}</span>
                  </DetailRow>
                )}
                {deal.country && (
                  <DetailRow label={t("detail.country")}>
                    <span className="text-xs font-mono text-text">{deal.country}</span>
                  </DetailRow>
                )}
                {deal.tags?.length > 0 && (
                  <DetailRow label={t("detail.tags")}>
                    <div className="flex flex-wrap gap-1.5">
                      {deal.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="text-xs font-mono font-bold uppercase px-2 py-0.5 border border-primary/60 text-primary rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </DetailRow>
                )}
                <DetailRow label={t("detail.created")}>
                  <span className="text-xs font-mono text-subtle">
                    {deal.created_at ? dateFormatter.format(new Date(deal.created_at)) : "—"}
                  </span>
                </DetailRow>
                <DetailRow label={t("detail.expires")}>
                  <span className="text-xs font-mono text-subtle">
                    {deal.expires_at ? dateFormatter.format(new Date(deal.expires_at)) : "—"}
                  </span>
                </DetailRow>
              </div>

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
