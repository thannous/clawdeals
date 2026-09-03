import { FormEvent, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";

import { useWebMcp } from "../../webmcp/WebMcpProvider";
import { getActiveBuyMission, subscribeActiveBuyMission, type BuyMissionView } from "../../webmcp/ui-bridge";
import { probeOwnerSession } from "../auth/ownerSessionProbe";

const DAY_MS = 24 * 60 * 60 * 1000;

type MarketCode = "FR" | "GB" | "ES";

export type CityPreset = {
  id: string;
  labelKey: string;
  market: MarketCode;
  latitude: string;
  longitude: string;
};

export const CITY_PRESETS: CityPreset[] = [
  {
    id: "paris",
    labelKey: "mission.cities.paris",
    market: "FR",
    latitude: "48.8566",
    longitude: "2.3522"
  },
  {
    id: "lyon",
    labelKey: "mission.cities.lyon",
    market: "FR",
    latitude: "45.7640",
    longitude: "4.8357"
  },
  {
    id: "marseille",
    labelKey: "mission.cities.marseille",
    market: "FR",
    latitude: "43.2965",
    longitude: "5.3698"
  },
  {
    id: "london",
    labelKey: "mission.cities.london",
    market: "GB",
    latitude: "51.5074",
    longitude: "-0.1278"
  },
  {
    id: "madrid",
    labelKey: "mission.cities.madrid",
    market: "ES",
    latitude: "40.4168",
    longitude: "-3.7038"
  }
];

const AUTONOMOUS_ACTION_OPTIONS: Array<{
  value: string;
  labelKey: string;
  hintKey: string;
  locked?: boolean;
}> = [
  {
    value: "search",
    labelKey: "mission.autonomy.search.label",
    hintKey: "mission.autonomy.search.hint",
    locked: true
  },
  {
    value: "ask_question",
    labelKey: "mission.autonomy.ask.label",
    hintKey: "mission.autonomy.ask.hint"
  },
  {
    value: "make_offer",
    labelKey: "mission.autonomy.offer.label",
    hintKey: "mission.autonomy.offer.hint"
  }
];

const AUTONOMOUS_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  AUTONOMOUS_ACTION_OPTIONS.map(({ value, labelKey }) => [value, labelKey])
);

function formatCeiling(value: string, market: MarketCode, locale: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  const currency = market === "GB" ? "GBP" : "EUR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(amount);
}

export function describeMissionResult(
  result: { ok: true; meta?: { request_id?: string } } | { ok: false; error: { code: string; message: string } },
  ceiling: string
): { key: string; values?: Record<string, string>; code: string | null } {
  if (result.ok === true) {
    return {
      key: result.meta?.request_id ? "mission.result.createdWithReceipt" : "mission.result.created",
      values: {
        ceiling,
        requestId: result.meta?.request_id?.slice(0, 8) || ""
      },
      code: null
    };
  }
  const code = result.error.code;
  if (code === "USER_DENIED") return { key: "mission.result.denied", code };
  if (code === "UNAUTHORIZED" || code === "AUTH_REQUIRED" || code === "MISSING_API_KEY") {
    return { key: "mission.result.auth", code };
  }
  if (code === "VALIDATION_ERROR")
    return {
      key: "mission.result.validation",
      code
    };
  if (code === "OUTCOME_UNKNOWN") return { key: "mission.result.unknown", code };
  return {
    key: "mission.result.failed",
    code
  };
}

function defaultExpirationValue() {
  const date = new Date(Date.now() + 7 * DAY_MS);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function formatMoney(value: number | null, currency: string, locale: string) {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

function MissionSummary({ mission }: { mission: BuyMissionView }) {
  const t = useTranslations("webmcp");
  const locale = useLocale();
  return (
    <section
      className="border border-primary/50 bg-primary/5 rounded clip-corner p-4"
      data-testid="buy-mission-summary"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">
            {t("mission.summary.eyebrow")}
          </p>
          <h3 className="mt-1 text-lg font-bold uppercase tracking-wide text-text">{mission.query}</h3>
          <p className="mt-1 text-xs font-mono text-muted">
            {mission.location.label || t("mission.summary.selectedArea")} · {mission.location.radius_km} km
          </p>
        </div>
        <span className="border border-primary/50 px-2 py-1 text-[10px] font-mono uppercase text-primary">
          {mission.status === "ACTIVE" ? t("mission.summary.active") : mission.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <dt className="text-[10px] font-mono uppercase text-subtle">{t("mission.summary.preferred")}</dt>
          <dd className="text-sm font-mono text-text">
            {formatMoney(mission.preferred_price_max, mission.currency, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-mono uppercase text-subtle">{t("mission.summary.hardCeiling")}</dt>
          <dd className="text-sm font-mono font-bold text-text">
            {formatMoney(mission.hard_budget_max, mission.currency, locale)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-mono uppercase text-subtle">{t("mission.summary.autonomy")}</dt>
          <dd className="text-xs font-mono text-text">
            {mission.autonomous_actions
              .map((action) => {
                const labelKey = AUTONOMOUS_ACTION_LABELS[action];
                return labelKey ? t(labelKey) : action;
              })
              .join(", ")}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-mono uppercase text-subtle">{t("mission.summary.contact")}</dt>
          <dd className="text-xs font-mono text-text">{t("mission.summary.bilateral")}</dd>
        </div>
      </dl>

      {mission.requirements.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[10px] font-mono uppercase text-subtle">{t("mission.summary.requirements")}</p>
          <ul className="mt-1 space-y-1 text-xs font-mono text-muted">
            {mission.requirements.map((requirement) => (
              <li key={requirement}>· {requirement}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export type BuyMissionPrefill = {
  query?: string;
  marketCode?: MarketCode;
  locationLabel?: string;
  locationLabelKey?: string;
  latitude?: string;
  longitude?: string;
  preferredPriceMax?: string;
  hardBudgetMax?: string;
  requirements?: string;
  /** Listing that triggered the prefill (shown as context, not sent to the tool). */
  listingTitle?: string;
};

const HARD_BUDGET_HEADROOM = 1.1;

/**
 * Builds a mission prefill from a listing a human is looking at: preferred price =
 * asking price, hard ceiling = asking price + 10 %, location = the listing's market.
 */
export function prefillFromListing(input: {
  title?: string | null;
  category?: string | null;
  price?: number | null;
  marketCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): BuyMissionPrefill {
  const prefill: BuyMissionPrefill = {};
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title) {
    prefill.query = title;
    prefill.listingTitle = title;
  } else if (input.category) {
    prefill.query = String(input.category).toLowerCase();
  }
  if (input.marketCode === "FR" || input.marketCode === "GB" || input.marketCode === "ES") {
    prefill.marketCode = input.marketCode;
  }
  if (typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0) {
    prefill.preferredPriceMax = String(Math.round(input.price));
    prefill.hardBudgetMax = String(Math.round(input.price * HARD_BUDGET_HEADROOM));
  }
  if (
    typeof input.latitude === "number" &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    prefill.latitude = String(input.latitude);
    prefill.longitude = String(input.longitude);
    prefill.locationLabelKey = "mission.listingLocation";
  }
  prefill.requirements = "";
  return prefill;
}

export default function BuyMissionPanel({ prefill }: { prefill?: BuyMissionPrefill | null } = {}) {
  const t = useTranslations("webmcp");
  const locale = useLocale();
  const { executeTool } = useWebMcp();
  const activeMission = useSyncExternalStore(subscribeActiveBuyMission, getActiveBuyMission, () => null);
  const hasCustomLocation = Boolean(prefill?.latitude && prefill?.longitude);
  const [query, setQuery] = useState(prefill?.query ?? t("mission.defaults.query"));
  const [marketCode, setMarketCode] = useState<MarketCode>(prefill?.marketCode ?? "FR");
  const [cityPreset, setCityPreset] = useState<string>(hasCustomLocation ? "custom" : "paris");
  const [locationLabel, setLocationLabel] = useState(
    prefill?.locationLabel ?? (prefill?.locationLabelKey ? t(prefill.locationLabelKey) : t("mission.cities.paris"))
  );
  const [latitude, setLatitude] = useState(prefill?.latitude ?? "48.8566");
  const [longitude, setLongitude] = useState(prefill?.longitude ?? "2.3522");
  const [radiusKm, setRadiusKm] = useState("25");
  const [preferredPriceMax, setPreferredPriceMax] = useState(prefill?.preferredPriceMax ?? "1200");
  const [hardBudgetMax, setHardBudgetMax] = useState(prefill?.hardBudgetMax ?? "1300");
  const [requirements, setRequirements] = useState(prefill?.requirements ?? "battery_health >= 80%");
  const [autonomousActions, setAutonomousActions] = useState<string[]>(["search", "ask_question", "make_offer"]);
  const [expiresAt, setExpiresAt] = useState(defaultExpirationValue);
  const [resultMessage, setResultMessage] = useState<{
    key: string;
    values?: Record<string, string>;
    code: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const initialMarketCode = prefill?.marketCode ?? "FR";
    const hasListingPricePrefill = prefill?.preferredPriceMax !== undefined || prefill?.hardBudgetMax !== undefined;

    // Mission defaults come from the owner's policy, which only exists behind an
    // owner session: skip the call (and its 401) for anonymous visitors.
    void probeOwnerSession()
      .then((session) => {
        if (session.state === "anonymous" || controller.signal.aborted) return null;
        return fetch("/api/v1/policies", {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal
        });
      })
      .then(async (response) => {
        if (!response || !response.ok) return;
        const payload = await response.json();
        const policy = payload?.data;
        const radius = policy?.mission_defaults?.radius_km;
        if (Number.isInteger(radius) && radius >= 1 && radius <= 300) {
          setRadiusKm(String(radius));
        }

        const configuredActions = Array.isArray(policy?.mission_defaults?.autonomous_actions)
          ? policy.mission_defaults.autonomous_actions
          : null;
        if (configuredActions) {
          const actionSet = new Set(
            configuredActions.filter((action: unknown): action is string => typeof action === "string")
          );
          actionSet.add("search");
          setAutonomousActions(
            AUTONOMOUS_ACTION_OPTIONS.map((option) => option.value).filter((action) => actionSet.has(action))
          );
        }

        if (!hasListingPricePrefill) {
          const marketCurrency = initialMarketCode === "GB" ? "GBP" : "EUR";
          if (policy?.budgets?.currency === marketCurrency) {
            const preferred = policy.budgets.preferred_offer;
            const hard = policy.budgets.max_offer;
            if (typeof preferred === "number" && Number.isFinite(preferred)) {
              setPreferredPriceMax(String(preferred));
            }
            if (typeof hard === "number" && Number.isFinite(hard)) {
              setHardBudgetMax(String(hard));
            }
          }
        }
      })
      .catch((error) => {
        if (error?.name !== "AbortError") return;
      });

    return () => controller.abort();
  }, [prefill]);

  const applyCityPreset = (presetId: string) => {
    setCityPreset(presetId);
    const preset = CITY_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    setLocationLabel(t(preset.labelKey));
    setLatitude(preset.latitude);
    setLongitude(preset.longitude);
    setMarketCode(preset.market);
  };

  const toggleAutonomousAction = (value: string, checked: boolean) => {
    setAutonomousActions((current) => {
      const without = current.filter((entry) => entry !== value);
      const next = checked ? [...without, value] : without;
      return AUTONOMOUS_ACTION_OPTIONS.map((option) => option.value).filter((option) => next.includes(option));
    });
  };

  const webMcpFormAttributes = useMemo(
    () =>
      ({
        toolname: "prepare_buy_mission",
        tooldescription: t("mission.toolDescription")
      }) as any,
    [t]
  );
  const param = (description: string) => ({ toolparamdescription: description }) as any;

  const submitMission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setResultMessage(null);
    const args = {
      query,
      market_code: marketCode,
      location_label: locationLabel || undefined,
      latitude: Number(latitude),
      longitude: Number(longitude),
      radius_km: Number(radiusKm),
      preferred_price_max: preferredPriceMax ? Number(preferredPriceMax) : undefined,
      hard_budget_max: Number(hardBudgetMax),
      requirements: requirements
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
      autonomous_actions: autonomousActions,
      contact_reveal: "manual_bilateral_approval" as const,
      expires_at: new Date(expiresAt).toISOString()
    };
    const execution = executeTool("create_buy_mission", args);
    const nativeEvent = event.nativeEvent as Event & {
      respondWith?: (result: Promise<unknown>) => void;
    };
    if (typeof nativeEvent.respondWith === "function") nativeEvent.respondWith(execution);

    void execution.then((result) => {
      setSubmitting(false);
      setResultMessage(describeMissionResult(result, formatCeiling(hardBudgetMax, marketCode, locale)));
    });
  };

  return (
    <div id="buy-mission" className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-10 space-y-4 scroll-mt-24">
      {activeMission ? <MissionSummary mission={activeMission} /> : null}

      <form
        {...webMcpFormAttributes}
        onSubmit={submitMission}
        className="border border-border bg-surface rounded clip-corner p-4"
        data-testid="buy-mission-form"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">{t("mission.eyebrow")}</p>
            <h2 className="mt-1 text-xl font-bold uppercase tracking-wide text-text">{t("mission.title")}</h2>
            {prefill?.listingTitle ? (
              <p className="mt-2 text-xs font-mono text-muted" data-testid="buy-mission-prefill-note">
                {t("mission.prefill", { title: prefill.listingTitle })}
              </p>
            ) : null}
          </div>
          <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.mode")}</span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 lg:col-span-2">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.query")}</span>
            <input
              {...param(t("mission.params.query"))}
              required
              name="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.city")}</span>
            <select
              data-testid="buy-mission-city"
              value={cityPreset}
              onChange={(event) => applyCityPreset(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            >
              {CITY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {t(preset.labelKey)} · {preset.market === "GB" ? "GBP" : "EUR"}
                </option>
              ))}
              <option value="custom">{t("mission.customCoordinates")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.location")}</span>
            <input
              {...param(t("mission.params.location"))}
              name="location_label"
              value={locationLabel}
              onChange={(event) => {
                setLocationLabel(event.target.value);
                setCityPreset("custom");
              }}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.radius")}</span>
            <input
              {...param(t("mission.params.radius"))}
              required
              name="radius_km"
              type="number"
              min="1"
              max="300"
              value={radiusKm}
              onChange={(event) => setRadiusKm(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.expires")}</span>
            <input
              {...param(t("mission.params.expires"))}
              required
              name="expires_at"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.preferred")}</span>
            <input
              {...param(t("mission.params.preferred"))}
              name="preferred_price_max"
              type="number"
              min="0.01"
              step="0.01"
              value={preferredPriceMax}
              onChange={(event) => setPreferredPriceMax(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.ceiling")}</span>
            <input
              {...param(t("mission.params.ceiling"))}
              required
              name="hard_budget_max"
              type="number"
              min="0.01"
              step="0.01"
              value={hardBudgetMax}
              onChange={(event) => setHardBudgetMax(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <label className="space-y-1 lg:col-span-2">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.requirements")}</span>
            <textarea
              {...param(t("mission.params.requirements"))}
              name="requirements_text"
              rows={3}
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <fieldset className="space-y-1" data-testid="buy-mission-autonomy">
            <legend className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.autonomy")}</legend>
            <div className="space-y-1.5 border border-border bg-bg px-3 py-2">
              {AUTONOMOUS_ACTION_OPTIONS.map((option) => {
                const checked = autonomousActions.includes(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex items-start gap-2 text-xs font-mono text-text"
                    title={t(option.hintKey)}
                  >
                    <input
                      {...param(
                        t("mission.params.delegate", {
                          action: t(option.labelKey)
                        })
                      )}
                      type="checkbox"
                      name="autonomous_actions"
                      value={option.value}
                      checked={option.locked ? true : checked}
                      disabled={option.locked}
                      onChange={(event) => toggleAutonomousAction(option.value, event.target.checked)}
                      className="mt-0.5 accent-[var(--color-primary)]"
                    />
                    <span>
                      {t(option.labelKey)}
                      {option.locked ? <span className="ml-1 text-subtle">({t("common.required")})</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.contact")}</span>
            <select
              {...param(t("mission.params.contact"))}
              required
              name="contact_reveal"
              defaultValue="manual_bilateral_approval"
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            >
              <option value="manual_bilateral_approval">{t("mission.manualBilateral")}</option>
            </select>
          </label>
        </div>

        <details
          className="mt-4 border border-border bg-bg/40"
          open={cityPreset === "custom"}
          data-testid="buy-mission-advanced"
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-subtle hover:text-text">
            {t("mission.advanced")}
          </summary>
          <div className="grid grid-cols-1 gap-4 border-t border-border p-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.latitude")}</span>
              <input
                {...param(t("mission.params.latitude"))}
                required
                name="latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                value={latitude}
                onChange={(event) => {
                  setLatitude(event.target.value);
                  setCityPreset("custom");
                }}
                className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.longitude")}</span>
              <input
                {...param(t("mission.params.longitude"))}
                required
                name="longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                value={longitude}
                onChange={(event) => {
                  setLongitude(event.target.value);
                  setCityPreset("custom");
                }}
                className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.market")}</span>
              <select
                {...param(t("mission.params.market"))}
                name="market_code"
                value={marketCode}
                onChange={(event) => setMarketCode(event.target.value as MarketCode)}
                className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
              >
                <option value="FR">{t("mission.countries.fr")} · EUR</option>
                <option value="GB">{t("mission.countries.gb")} · GBP</option>
                <option value="ES">{t("mission.countries.es")} · EUR</option>
              </select>
            </label>
          </div>
        </details>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="border border-primary bg-primary px-4 py-2 text-xs font-mono font-bold uppercase text-bg disabled:opacity-50"
          >
            {submitting ? t("mission.creating") : t("mission.create")}
          </button>
          <p className="text-xs font-mono text-subtle">{t("mission.submitHint")}</p>
        </div>
        {resultMessage ? (
          <p
            className={`mt-3 text-xs font-mono ${resultMessage.code ? "text-warning" : "text-success"}`}
            data-testid="buy-mission-result"
            data-code={resultMessage.code || undefined}
            title={resultMessage.code || undefined}
            aria-live="polite"
          >
            {t(resultMessage.key, resultMessage.values)}
          </p>
        ) : null}
      </form>
    </div>
  );
}
