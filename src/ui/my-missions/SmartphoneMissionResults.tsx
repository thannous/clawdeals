import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SmartphoneMissionEvaluation, SmartphoneMissionReason } from "../../lib/smartphone-mission";
import ListingCard from "../browse/ListingCard";
import { splitSmartphoneReasons, type MissionMatches } from "./missionMatches";

function Reasons({ evaluation, id, alert = false }: { evaluation: SmartphoneMissionEvaluation; id: string; alert?: boolean }) {
  const t = useTranslations("myMissions.smartphone");
  const fields = useTranslations("webmcp.mission.smartphone");
  const groups = splitSmartphoneReasons(evaluation);
  const describe = (reason: SmartphoneMissionReason) => t(`reasons.${reason.code}`, {
    expected: reason.expected ?? "", actual: reason.actual ?? "", check: reason.check_id ? fields(`checks.${reason.check_id}`) : ""
  });
  return <div className="space-y-3 text-sm">
    {(["known", "unknown"] as const).map(group => groups[group].length ? <div key={group}>
      <p className={group === "unknown" ? "font-medium text-warning" : "font-medium text-text"}>{t(group === "unknown" ? "toConfirm" : "whyMatches")}</p>
      <ul className="mt-1 list-disc space-y-1 break-words pl-4 text-muted">{groups[group].map(reason => <li key={`${reason.code}:${reason.check_id || ""}`} data-testid={`${alert ? "mission-alert" : "mission-match"}-reason-${id}-${reason.code}${reason.check_id ? `-${reason.check_id}` : ""}`}>{describe(reason)}</li>)}</ul>
    </div> : null)}
  </div>;
}

function compareHref(id: string, items: MissionMatches["items"]) {
  return { pathname: "/browse/compare", query: { ids: [id, ...items.map(item => item.listing_id).filter(other => other !== id)].slice(0, 3).join(",") } };
}

export default function SmartphoneMissionResults({ data }: { data: MissionMatches }) {
  const t = useTranslations("myMissions.smartphone");
  const locale = useLocale();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return <div className="space-y-6">
    <p className="text-sm leading-relaxed text-muted">{t("resultsHint")}</p>
    {(["compatible", "unknown"] as const).map(status => {
      const items = data.items.filter(item => item.smartphone_compatibility?.status === status);
      return items.length ? <section key={status} aria-labelledby={`mission-results-${status}`} data-testid={`mission-matches-${status}`} className="space-y-3">
        <h3 id={`mission-results-${status}`} className="text-lg font-semibold text-text">{t(status === "compatible" ? "compatibleTitle" : "unknownTitle", { count: items.length })}</h3>
        {status === "unknown" ? <p className="text-sm text-muted">{t("unknownHint")}</p> : null}
        <div className="grid gap-4 sm:grid-cols-2">{items.map(item => <div key={item.listing_id} data-testid={`mission-match-${item.listing_id}`} className="flex min-w-0 flex-col">
          <div className="flex-1"><ListingCard listing={item} /></div>
          <div className="space-y-3 border border-t-0 border-border bg-surface p-4">
            <Reasons evaluation={item.smartphone_compatibility as SmartphoneMissionEvaluation} id={item.listing_id} />
            <Link href={compareHref(item.listing_id, data.items)} className="inline-block text-sm text-primary underline">{t("compare")}</Link>
          </div>
        </div>)}</div>
      </section> : null;
    })}
    {data.alerts?.length ? <section aria-labelledby="mission-alerts-title" data-testid="mission-alerts" className="space-y-3">
      <h3 id="mission-alerts-title" className="text-lg font-semibold text-text">{t("alertsTitle")}</h3>
      <p className="text-sm text-muted">{t("alertsHint")}</p>
      <ul className="space-y-3">{data.alerts.map(alert => <li key={alert.listing_id} data-testid={`mission-alert-${alert.listing_id}`} className="space-y-3 border border-border bg-surface p-4">
        <div><p className="text-sm font-semibold text-primary">{t(`changes.${alert.reason.change}`)}</p><Link href={`/browse/${alert.listing_id}`} className="mt-1 block break-words font-semibold text-text hover:text-primary">{alert.listing.title}</Link></div>
        <p className="text-xs text-muted">{t("matchedAt", { date: date.format(new Date(alert.matched_at)) })}</p>
        {alert.reason.change === "price_changed" && alert.reason.previous_price !== undefined && alert.reason.current_price !== undefined ? <p className="text-sm text-muted">{t("priceChanged", {
          previous: new Intl.NumberFormat(locale, { style: "currency", currency: alert.listing.price.currency }).format(alert.reason.previous_price),
          current: new Intl.NumberFormat(locale, { style: "currency", currency: alert.listing.price.currency }).format(alert.reason.current_price)
        })}</p> : null}
        <Reasons evaluation={alert.reason.smartphone as SmartphoneMissionEvaluation} id={alert.listing_id} alert />
        <Link href={compareHref(alert.listing_id, data.items)} data-testid={`mission-alert-compare-${alert.listing_id}`} className="inline-block text-sm text-primary underline">{t("compare")}</Link>
      </li>)}</ul>
    </section> : null}
  </div>;
}
