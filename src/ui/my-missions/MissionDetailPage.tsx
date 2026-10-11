import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useState } from "react";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import ListingCard from "../browse/ListingCard";
import { MissionSummary } from "../webmcp/BuyMissionPanel";
import { saveBuyMissionDraft } from "../webmcp/buyMissionDraft";
import { missionView, missionStatus, type OwnerMission } from "./missionClient";
import { useMissionResource } from "./useMissionResource";

export default function MissionDetailPage() {
  const t = useTranslations("myMissions");
  const router = useRouter();
  const id = typeof router.query.mission_id === "string" ? router.query.mission_id : null;
  const path = router.isReady && id ? `/${encodeURIComponent(id)}` : null;
  const mission = useMissionResource<OwnerMission>(path);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draftError, setDraftError] = useState(false);
  const matches = useMissionResource<{ items: any[]; next_cursor: string | null; status: string }>(path ? `${path}/matches${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}` : null);
  const item = mission.data;

  const adjust = () => {
    if (!item) return;
    const view = missionView(item);
    const expiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expiration.setMinutes(expiration.getMinutes() - expiration.getTimezoneOffset());
    const saved = saveBuyMissionDraft(`mission:${item.watchlist_id}`, {
      query: view.query, marketCode: item.market_code, cityPreset: "custom", locationLabel: view.location.label || "",
      latitude: String(view.location.lat), longitude: String(view.location.lon), radiusKm: String(view.location.radius_km),
      preferredPriceMax: view.preferred_price_max === null ? "" : String(view.preferred_price_max), hardBudgetMax: String(view.hard_budget_max),
      requirements: view.requirements.join("\n"), autonomousActions: view.autonomous_actions as ("search" | "ask_question" | "make_offer")[], expiresAt: expiration.toISOString().slice(0, 16)
    });
    if (!saved) { setDraftError(true); return; }
    void router.push(`/my/missions/new?from=${encodeURIComponent(item.watchlist_id)}`);
  };

  const refresh = () => { mission.reload(); matches.reload(); };
  return (
    <div className="min-h-screen bg-bg" data-testid="owner-mission-detail">
      <PageHeader title={t("detailTitle")}><AppNav current="missions" /></PageHeader>
      <main id="main-content" tabIndex={-1} className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <Link href="/my/missions" className="text-sm text-primary underline">{t("allMissions")}</Link>
        {mission.loading ? <p role="status" className="text-muted">{t("loading")}</p> : mission.error ? (
          <div role="alert" className="border border-warning p-5 text-warning"><p>{t(mission.error === "NOT_FOUND" ? "notFound" : "loadError")}</p><button onClick={mission.reload} className="mt-3 underline">{t("retry")}</button></div>
        ) : item ? <>
          <MissionSummary mission={missionView(item)} statusLabel={t(`status.${missionStatus(item)}`)} />
          <div className="border border-border bg-surface p-4 space-y-2">
            <p className="text-sm text-text">{t("savedHint")}</p>
            {item.criteria.notification_mode === "in_app" ? <p className="text-sm text-muted">{t("inAppHint")}</p> : null}
            <p className="text-xs text-muted">{t("expires", { date: new Intl.DateTimeFormat(router.locale || "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.criteria.mission.expires_at)) })}</p>
          </div>
          <section aria-labelledby="mission-matches-title" data-testid="mission-matches" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="mission-matches-title" className="font-semibold text-xl text-text">{t("matchesTitle")}</h2>
              <button onClick={refresh} disabled={matches.loading} className="text-primary underline disabled:opacity-50">{t("refresh")}</button>
            </div>
            <p className="text-sm text-muted">{t("matchesHint")}</p>
            {matches.loading ? <p role="status" className="text-muted">{t("searching")}</p> : matches.error ? (
              <div role="alert" className="border border-warning p-4 text-warning"><p>{t("matchesError")}</p><button onClick={matches.reload} className="mt-3 underline">{t("retry")}</button></div>
            ) : matches.data?.items.length ? (
              <div className="grid gap-4 sm:grid-cols-2">{matches.data.items.map((listing) => <ListingCard key={listing.listing_id} listing={listing} />)}</div>
            ) : (
              <div className="border border-border bg-surface p-6 space-y-3" data-testid="mission-no-matches">
                <h3 className="font-semibold text-text">{t(matches.data?.status === "ACTIVE" ? matches.data.next_cursor ? "moreToSearch" : "noMatches" : "inactiveTitle")}</h3>
                <p className="text-sm text-muted">{t(matches.data?.status === "ACTIVE" ? matches.data.next_cursor ? "moreToSearchHint" : "noMatchesHint" : "inactiveHint")}</p>
              </div>
            )}
            {matches.data?.next_cursor && !matches.loading ? <button onClick={() => setCursor(matches.data!.next_cursor)} className="text-primary underline">{t("moreMatches")}</button> : null}
            {cursor ? <button onClick={() => setCursor(null)} className="ml-4 text-primary underline">{t("firstMatches")}</button> : null}
            <button onClick={adjust} className="px-4 py-2 border border-primary text-primary">{t("adjust")}</button>
            {draftError ? <p role="alert" className="text-warning">{t("draftError")}</p> : null}
          </section>
        </> : null}
      </main>
    </div>
  );
}
