import { useCallback } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/router";
import { useTheme } from "../../theme/theme-context";
import { getPublicAppEntryHref } from "../../shared/urls";
import { resolveSupportedLocale } from "../../shared/i18n";
import { NavbarCurrent } from "../landing/Navbar";
import BrowseToolbar from "./BrowseToolbar";
import ListingCardGrid from "./ListingCardGrid";
import { useBrowseListings } from "./useBrowseListings";

type BrowseListingsPageProps = {
  initialListings: any[];
  initialNextCursor: string | null;
};

export default function BrowseListingsPage({
  initialListings,
  initialNextCursor,
}: BrowseListingsPageProps) {
  const t = useTranslations("browse");
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const { themeId, setTheme, themes } = useTheme();

  const {
    listings,
    sort,
    setSort,
    q,
    setQ,
    category,
    setCategory,
    condition,
    setCondition,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    nextCursor,
    fetchState,
    loadMoreState,
    error,
    loadMore,
    refetch,
    highlightedIds,
    policyFitById,
  } = useBrowseListings({ initialListings, initialNextCursor });

  const resetFilters = useCallback(() => {
    setQ("");
    setCategory("");
    setCondition("");
    setPriceMin("");
    setPriceMax("");
  }, [setQ, setCategory, setCondition, setPriceMin, setPriceMax]);

  return (
    <div className="min-h-screen bg-bg">
      <NavbarCurrent themeId={themeId} setTheme={setTheme} themes={themes} />

      <main id="main-content" tabIndex={-1} className="pt-20 pb-16">
        {/* Header */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-8">
          <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-text">
            <span className="text-primary mr-2">/</span>
            {t("title")}
          </h1>
          <p className="text-sm font-mono text-muted mt-1">{t("subtitle")}</p>
        </div>

        {/* Toolbar */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-6">
          <BrowseToolbar
            sort={sort}
            onSortChange={setSort}
            q={q}
            onSearchChange={setQ}
            category={category}
            onCategoryChange={setCategory}
            condition={condition}
            onConditionChange={setCondition}
            priceMin={priceMin}
            onPriceMinChange={setPriceMin}
            priceMax={priceMax}
            onPriceMaxChange={setPriceMax}
          />
        </div>

        {/* Grid */}
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
          <ListingCardGrid
            listings={listings}
            fetchState={fetchState}
            loadMoreState={loadMoreState}
            error={error}
            nextCursor={nextCursor}
            onRetry={refetch}
            onLoadMore={loadMore}
            onResetFilters={resetFilters}
            highlightedIds={highlightedIds}
            policyFitById={policyFitById}
          />
        </div>

        {/* CTA */}
        <div className="border-t border-border bg-surface mt-16">
          <div className="max-w-[960px] mx-auto px-6 py-16 flex flex-col items-center text-center">
            <div className="font-mono text-xs text-subtle tracking-widest uppercase mb-4">
              {t("cta.label")}
            </div>
            <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-text mb-3">
              {t("cta.title")}
            </h2>
            <p className="text-sm text-muted font-mono max-w-lg mb-8">
              {t("cta.subtitle")}
            </p>
            <Link
              href={getPublicAppEntryHref(localePrefix)}
              data-acquisition-cta="browse"
              className="px-8 py-3 font-bold uppercase tracking-wider text-sm border border-primary bg-primary text-bg hover:bg-text hover:border-text transition-colors"
            >
              {t("cta.button")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
