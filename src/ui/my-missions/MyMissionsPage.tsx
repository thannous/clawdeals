import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import { missionStatus, type OwnerMission } from "./missionClient";
import { useMissionResource } from "./useMissionResource";

export default function MyMissionsPage() {
  const t = useTranslations("myMissions");
  const locale = useLocale();
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, loading, reload } = useMissionResource<{ items: OwnerMission[]; next_cursor: string | null }>(cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
  return (
    <div className="min-h-screen bg-bg" data-testid="my-missions-page">
      <PageHeader title={t("title")}><AppNav current="missions" /></PageHeader>
      <main id="main-content" tabIndex={-1} className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted max-w-xl">{t("listHint")}</p>
          <Link href="/my/missions/new" className="px-5 py-3 bg-primary text-bg font-semibold">{t("newTitle")}</Link>
        </div>
        {loading ? <p role="status" className="text-muted">{t("loading")}</p> : error ? (
          <div role="alert" className="border border-warning p-5 text-warning"><p>{t("loadError")}</p><button onClick={reload} className="mt-3 underline">{t("retry")}</button></div>
        ) : (
          <div data-testid="owner-missions" className="space-y-3">
            {!data?.items.length ? <div className="border border-border bg-surface p-6 space-y-2"><h2 className="font-semibold text-text">{t("emptyTitle")}</h2><p className="text-sm text-muted">{t("emptyHint")}</p></div> : data.items.map((item) => (
              <article key={item.watchlist_id} className="border border-border bg-surface p-5 space-y-2">
                <div className="flex flex-wrap justify-between gap-3"><Link href={`/my/missions/${item.watchlist_id}`} className="font-semibold text-lg text-text hover:text-primary underline underline-offset-4">{item.criteria.query}</Link><span className="text-sm text-primary">{t(`status.${missionStatus(item)}`)}</span></div>
                <p className="text-sm text-muted">{item.criteria.mission.location.label || t("selectedArea")} · {item.criteria.mission.location.radius_km} km · {t("budget", { amount: new Intl.NumberFormat(locale, { style: "currency", currency: item.criteria.mission.currency }).format(item.criteria.mission.hard_budget_max) })}</p>
              </article>
            ))}
            <div className="flex gap-4">
              {cursor ? <button onClick={() => setCursor(null)} className="text-primary underline">{t("latest")}</button> : null}
              {data?.next_cursor ? <button onClick={() => setCursor(data.next_cursor)} className="text-primary underline">{t("moreMissions")}</button> : null}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
