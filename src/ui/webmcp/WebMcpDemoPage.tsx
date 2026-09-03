import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/router";

import { useTheme } from "../../theme/theme-context";
import { NavbarCurrent } from "../landing/Navbar";
import BrowseToolbar from "../browse/BrowseToolbar";
import ListingCardGrid from "../browse/ListingCardGrid";
import { useBrowseListings } from "../browse/useBrowseListings";
import { getToolsForRoute, WEBMCP_TOOLS } from "../../webmcp/tools";
import { useWebMcp } from "../../webmcp/WebMcpProvider";
import { getStoredApiKey, subscribeStoredApiKey } from "../developer/storage";
import AgentKeyConnect from "./AgentKeyConnect";
import BuyMissionPanel, { prefillFromListing, type BuyMissionPrefill } from "./BuyMissionPanel";
import DealRoomPanel from "./DealRoomPanel";
import JudgeResetButton from "./JudgeResetButton";
import MissionMilestones from "./MissionMilestones";
import PendingApprovalBanner from "./PendingApprovalBanner";
import SellerTurnButton from "./SellerTurnButton";
import { useJudgeReset } from "./useJudgeReset";

type WebMcpDemoPageProps = {
  initialListings: any[];
  initialNextCursor: string | null;
};

export default function WebMcpDemoPage({ initialListings, initialNextCursor }: WebMcpDemoPageProps) {
  const t = useTranslations("webmcp");
  const browseT = useTranslations("browse");
  const router = useRouter();
  const { themeId, setTheme, themes } = useTheme();
  const { supported, registered, registeredToolNames, lastRegisterError } = useWebMcp();
  const apiKey = useSyncExternalStore(subscribeStoredApiKey, getStoredApiKey, () => null);
  const judgeReset = useJudgeReset(apiKey);
  // "Ask my agent" on a listing page lands here with the listing summarised in
  // the query string so the mission form opens prefilled.
  const missionPrefill = useMemo<BuyMissionPrefill | null>(() => {
    if (!router.isReady) return null;
    const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
    const listingId = single(router.query.listing);
    if (!listingId) return null;
    const toNumber = (value: string | undefined) => {
      const parsed = value ? Number(value) : NaN;
      return Number.isFinite(parsed) ? parsed : null;
    };
    return prefillFromListing({
      title: single(router.query.title) ?? null,
      category: single(router.query.category) ?? null,
      price: toNumber(single(router.query.price)),
      marketCode: single(router.query.market) ?? null,
      latitude: toNumber(single(router.query.lat)),
      longitude: toNumber(single(router.query.lng))
    });
  }, [router.isReady, router.query]);
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
    highlightedIds,
    policyFitById
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
      <PendingApprovalBanner />

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
          <section className="border border-border bg-surface rounded clip-corner p-4 space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-widest text-subtle">{t("status.title")}</h2>
            <p className="text-xs font-mono text-muted" data-testid="webmcp-demo-supported">
              {t("status.supported")}: {supported ? t("yes") : t("no")}
            </p>
            <p className="text-xs font-mono text-muted" data-testid="webmcp-demo-registered">
              {t("status.registered")}: {registered ? t("yes") : t("no")} ({registeredToolNames.length})
            </p>
            {lastRegisterError ? <p className="text-xs font-mono text-error">{lastRegisterError}</p> : null}
            <p className="text-xs font-mono text-subtle">{t("status.hint")}</p>
            <div className="border-t border-border pt-3">
              <AgentKeyConnect compact />
            </div>
            {judgeReset.capability.enabled || judgeReset.capability.loading ? (
              <div className="border-t border-border pt-3">
                <JudgeResetButton {...judgeReset} testIdPrefix="webmcp-demo" />
              </div>
            ) : null}
            {judgeReset.capability.authorized ? (
              <div className="border-t border-border pt-3">
                <SellerTurnButton apiKey={apiKey} testIdPrefix="webmcp-demo" />
              </div>
            ) : null}
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
          </section>
        </div>

        <BuyMissionPanel key={missionPrefill ? `prefill-${String(router.query.listing)}` : "default"} prefill={missionPrefill} />

        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DealRoomPanel />
          <div className="lg:only:col-span-2">
            <MissionMilestones />
          </div>
        </div>

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
            policyFitById={policyFitById}
          />
        </div>
      </main>
    </div>
  );
}
