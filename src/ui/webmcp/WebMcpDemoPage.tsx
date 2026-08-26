import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/router";

import { useTheme } from "../../theme/theme-context";
import { resolveSupportedLocale } from "../../shared/i18n";
import { NavbarCurrent } from "../landing/Navbar";
import BrowseToolbar from "../browse/BrowseToolbar";
import ListingCardGrid from "../browse/ListingCardGrid";
import { useBrowseListings } from "../browse/useBrowseListings";
import { getToolsForRoute, WEBMCP_TOOLS } from "../../webmcp/tools";
import { useWebMcp } from "../../webmcp/WebMcpProvider";
import BuyMissionPanel from "./BuyMissionPanel";

type WebMcpDemoPageProps = {
  initialListings: any[];
  initialNextCursor: string | null;
};

export default function WebMcpDemoPage({ initialListings, initialNextCursor }: WebMcpDemoPageProps) {
  const t = useTranslations("webmcp");
  const browseT = useTranslations("browse");
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale);
  const localePrefix = locale === "en" ? "" : `/${locale}`;
  const { themeId, setTheme, themes } = useTheme();
  const { supported, registered, registeredToolNames, lastRegisterError } = useWebMcp();
  const contextualTools = useMemo(
    () => {
      if (registeredToolNames.length === 0) {
        return getToolsForRoute(router.pathname || "/webmcp");
      }
      const registered = new Set(registeredToolNames);
      return WEBMCP_TOOLS.filter((tool) => registered.has(tool.name));
    },
    [registeredToolNames, router.pathname]
  );

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
    highlightedIds
  } = useBrowseListings({ initialListings, initialNextCursor });

  const resetFilters = useCallback(() => {
    setQ("");
    setCategory("");
    setCondition("");
    setPriceMin("");
    setPriceMax("");
  }, [setQ, setCategory, setCondition, setPriceMin, setPriceMax]);

  return (
    <div className="min-h-screen bg-bg" data-testid="webmcp-demo-page">
      <NavbarCurrent themeId={themeId} setTheme={setTheme} themes={themes} />

      <main id="main-content" tabIndex={-1} className="pt-20 pb-16">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-10">
          <p className="font-mono text-xs text-subtle tracking-widest uppercase mb-3">{t("eyebrow")}</p>
          <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-text">
            <span className="text-primary mr-2">/</span>
            {t("title")}
          </h1>
          <p className="text-sm font-mono text-muted mt-3 max-w-3xl">{t("subtitle")}</p>
        </div>

        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
          <section className="border border-border bg-surface rounded clip-corner p-4 space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-widest text-subtle">{t("status.title")}</h2>
            <p className="text-xs font-mono text-muted" data-testid="webmcp-demo-supported">
              {t("status.supported")}: {supported ? t("yes") : t("no")}
            </p>
            <p className="text-xs font-mono text-muted" data-testid="webmcp-demo-registered">
              {t("status.registered")}: {registered ? t("yes") : t("no")} ({registeredToolNames.length})
            </p>
            {lastRegisterError ? <p className="text-xs font-mono text-error">{lastRegisterError}</p> : null}
            <p className="text-xs font-mono text-subtle">{t("status.hint")}</p>
          </section>

          <section className="border border-border bg-surface rounded clip-corner p-4 space-y-2 lg:col-span-2">
            <h2 className="text-xs font-mono uppercase tracking-widest text-subtle">{t("test.title")}</h2>
            <ol className="list-decimal list-inside space-y-1 text-xs font-mono text-muted">
              <li>{t("test.step1")}</li>
              <li>{t("test.step2")}</li>
              <li>{t("test.step3")}</li>
              <li>{t("test.step4")}</li>
            </ol>
            <p className="text-xs font-mono text-subtle">{t("test.writeHint")}</p>
            <Link href={`${localePrefix}/start`} className="inline-block text-xs font-mono uppercase text-primary hover:underline">
              {t("test.getKey")}
            </Link>
          </section>
        </div>

        <BuyMissionPanel />

        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-10">
          <h2 className="text-xs font-mono uppercase tracking-widest text-subtle mb-3">{t("tools.title")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {contextualTools.map((tool) => (
              <div key={tool.name} className="border border-border bg-surface rounded clip-corner p-3">
                <div className="text-xs font-mono font-bold text-text">{tool.name}</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-subtle mt-1">
                  {tool.scope}
                  {tool.requiresConfirmation ? ` · ${t("tools.confirm")}` : ""}
                </div>
                <p className="text-xs font-mono text-muted mt-2 leading-relaxed">{tool.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-8">
          <h2 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-text">
            <span className="text-primary mr-2">/</span>
            {browseT("title")}
          </h2>
          <p className="text-sm font-mono text-muted mt-1">{t("gridHint")}</p>
        </div>

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
          />
        </div>
      </main>
    </div>
  );
}
