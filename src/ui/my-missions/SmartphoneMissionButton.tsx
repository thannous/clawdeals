import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import type { ComparisonItem } from "../../lib/smartphone-comparison";
import { randomUuid } from "../../webmcp/utils";
import { probeOwnerSession } from "../auth/ownerSessionProbe";
import { saveBuyMissionDraft, type BuyMissionDraft } from "../webmcp/buyMissionDraft";

const locations = {
  FR: { id: "paris", lat: "48.8566", lon: "2.3522" },
  GB: { id: "london", lat: "51.5074", lon: "-0.1278" },
  ES: { id: "madrid", lat: "40.4168", lon: "-3.7038" }
};

export default function SmartphoneMissionButton({ item }: { item: ComparisonItem }) {
  const t = useTranslations("comparison");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function prepare() {
    if (!item.listing || item.availability !== "available" || busy) return;
    setBusy(true);
    setError(false);
    try {
      const session = await probeOwnerSession({ fresh: true });
      if (!mounted.current) return;
      if (session.state === "unknown" || (session.state === "authenticated" && !session.ownerId)) throw new Error("Session unavailable");
      const market = item.listing.market_code === "GB" || item.listing.market_code === "ES" ? item.listing.market_code : "FR";
      const location = locations[market];
      const currency = market === "GB" ? "GBP" : "EUR";
      const price = item.listing.price.currency === currency && item.listing.price.amount > 0 ? String(item.listing.price.amount) : "";
      const expiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expiration.setMinutes(expiration.getMinutes() - expiration.getTimezoneOffset());
      const draft: BuyMissionDraft = {
        query: (item.passport?.model || item.listing.title).slice(0, 80), marketCode: market,
        cityPreset: location.id, locationLabel: t(`missionCities.${market}`), latitude: location.lat, longitude: location.lon,
        radiusKm: "25", preferredPriceMax: price, hardBudgetMax: price, requirements: "",
        autonomousActions: ["search"], expiresAt: expiration.toISOString().slice(0, 16),
        smartphone: { enabled: true, model: item.passport?.model || "", batteryHealthMin: "", requiredChecks: [] }
      };
      const token = randomUuid();
      if (!saveBuyMissionDraft(`smartphone:${token}`, draft, session.ownerId)) throw new Error("Draft unavailable");
      // The private brief stays in the account-scoped session draft, including across login.
      const navigated = await router.push({ pathname: "/my/missions/new", query: { draft: token } });
      if (!navigated) throw new Error("Navigation cancelled");
    } catch { if (mounted.current) setError(true); }
    finally { if (mounted.current) setBusy(false); }
  }
  if (item.availability !== "available" || !item.listing) return null;
  return <div className="mt-4">
    <button type="button" data-testid={`comparison-create-mission-${item.listing_id}`} onClick={() => void prepare()} disabled={busy}
      className="w-full rounded border border-primary px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60">
      {t(busy ? "missionPreparing" : "createMission")}
    </button>
    {error ? <p role="alert" className="mt-2 text-xs leading-relaxed text-warning">{t("missionDraftError")}</p> : null}
  </div>;
}
