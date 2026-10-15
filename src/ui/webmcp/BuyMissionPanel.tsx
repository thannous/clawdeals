import { FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { useWebMcp, type PendingToolAttempt } from "../../webmcp/WebMcpProvider";
import { getActiveBuyMission, subscribeActiveBuyMission, type BuyMissionView } from "../../webmcp/ui-bridge";
import { probeOwnerSession } from "../auth/ownerSessionProbe";
import { getStoredApiKey } from "../developer/storage";
import type { StableToolResult } from "../../webmcp/types";
import { randomUuid } from "../../webmcp/utils";
import { buyMissionZodSchema } from "../../webmcp/tools/mission-tools";
import type { z } from "zod";
import { readBuyMissionDraft, saveBuyMissionDraft } from "./buyMissionDraft";

export type BuyMissionInput = z.infer<typeof buyMissionZodSchema>;

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
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

export function describeMissionResult(
  result: { ok: true; data?: { mission?: { hard_budget_max?: number; currency?: string } }; meta?: { request_id?: string } } | { ok: false; error: { code: string; message: string } },
  ceiling: string,
  locale = "en"
): { key: string; values?: Record<string, string>; code: string | null } {
  if (result.ok === true) {
    return {
      key: result.meta?.request_id ? "mission.result.createdWithReceipt" : "mission.result.created",
      values: {
        ceiling: result.data?.mission && Number.isFinite(result.data.mission.hard_budget_max) && ["EUR", "GBP"].includes(result.data.mission.currency || "")
          ? new Intl.NumberFormat(locale, { style: "currency", currency: result.data.mission.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(result.data.mission.hard_budget_max!)
          : ceiling,
        requestId: result.meta?.request_id?.slice(0, 8) || ""
      },
      code: null
    };
  }
  const code = result.error.code;
  if (code === "DRAFT_STORAGE_UNAVAILABLE") return { key: "mission.result.storage", code };
  if (code === "OWNER_AUTH_REQUIRED") return { key: "mission.result.ownerAuth", code };
  if (code === "OWNER_CREATE_FAILED") return { key: "mission.result.ownerFailed", code };
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
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function formatMoney(value: number | null, currency: string, locale: string) {
  if (value === null) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export function MissionSummary({ mission, statusLabel }: { mission: BuyMissionView; statusLabel?: string }) {
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
            {statusLabel || t("mission.summary.eyebrow")}
          </p>
          <h3 className="mt-1 text-lg font-bold uppercase tracking-wide text-text">{mission.query}</h3>
          <p className="mt-1 text-xs font-mono text-muted">
            {mission.location.label || t("mission.summary.selectedArea")} · {mission.location.radius_km} km
          </p>
        </div>
        <span className="border border-primary/50 px-2 py-1 text-[10px] font-mono uppercase text-primary">
          {statusLabel || (mission.status === "ACTIVE" ? t("mission.summary.active") : mission.status)}
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

/**
 * Builds a mission prefill from a listing a human is looking at: preferred price =
 * asking price, hard ceiling = asking price. Any extra budget is the buyer's choice.
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
    prefill.query = title.slice(0, 80);
    prefill.listingTitle = title;
  } else if (input.category) {
    prefill.query = String(input.category).toLowerCase();
  }
  if (input.marketCode === "FR" || input.marketCode === "GB" || input.marketCode === "ES") {
    prefill.marketCode = input.marketCode;
  }
  if (typeof input.price === "number" && Number.isFinite(input.price) && input.price > 0) {
    prefill.preferredPriceMax = String(Math.round(input.price * 100) / 100);
    prefill.hardBudgetMax = prefill.preferredPriceMax;
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

type FormProps = {
  prefill?: BuyMissionPrefill | null;
  draftSource?: string;
  draftOwnerId?: string | null;
  submitLabel?: string;
  submitHint?: string;
  executeMission: (args: BuyMissionInput, context: { draftSaved: boolean }) => Promise<StableToolResult>;
};

export default function BuyMissionPanel({ prefill }: { prefill?: BuyMissionPrefill | null } = {}) {
  const { executeTool } = useWebMcp();
  const attempts = useRef(new Map<string, PendingToolAttempt>());
  return <BuyMissionForm prefill={prefill} executeMission={async (args) => {
    const apiKey = getStoredApiKey();
    if (!apiKey) {
      return {
        ok: false,
        error: { code: "MISSING_API_KEY", message: "Connect an agent key first", details: {} },
        meta: { request_id: randomUuid() }
      };
    }
    return executeTool("create_buy_mission", args, { pendingAttempts: attempts.current });
  }} />;
}

export function BuyMissionForm({ prefill, draftSource, draftOwnerId = null, submitLabel, submitHint, executeMission }: FormProps) {
  const t = useTranslations("webmcp");
  const locale = useLocale();
  const restoredDraft = useRef(false);
  const edited = useRef(false);
  const [draftReady, setDraftReady] = useState(!draftSource);
  const [storageError, setStorageError] = useState(false);
  const activeMission = useSyncExternalStore(subscribeActiveBuyMission, getActiveBuyMission, () => null);
  const hasCustomLocation = Boolean(prefill?.latitude && prefill?.longitude);
  const [coordinatesOpen, setCoordinatesOpen] = useState(!draftSource && hasCustomLocation);
  const defaultCity = CITY_PRESETS.find((city) => city.market === (prefill?.marketCode || "FR"))!;
  const [query, setQuery] = useState(prefill?.query ?? t("mission.defaults.query"));
  const [marketCode, setMarketCode] = useState<MarketCode>(prefill?.marketCode ?? "FR");
  const [cityPreset, setCityPreset] = useState<string>(hasCustomLocation ? "custom" : defaultCity.id);
  const [locationLabel, setLocationLabel] = useState(
    prefill?.locationLabel ?? (prefill?.locationLabelKey ? t(prefill.locationLabelKey) : t(defaultCity.labelKey))
  );
  const [latitude, setLatitude] = useState(prefill?.latitude ?? defaultCity.latitude);
  const [longitude, setLongitude] = useState(prefill?.longitude ?? defaultCity.longitude);
  const [radiusKm, setRadiusKm] = useState("25");
  const [preferredPriceMax, setPreferredPriceMax] = useState(prefill?.preferredPriceMax ?? "1200");
  const [hardBudgetMax, setHardBudgetMax] = useState(prefill?.hardBudgetMax ?? "1300");
  const [requirements, setRequirements] = useState(prefill?.requirements ?? "battery_health >= 80%");
  const [autonomousActions, setAutonomousActions] = useState<string[]>(draftSource ? ["search"] : ["search", "ask_question", "make_offer"]);
  const [expiresAt, setExpiresAt] = useState(defaultExpirationValue);
  const [resultMessage, setResultMessage] = useState<{
    key: string;
    values?: Record<string, string>;
    code: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldError, setFieldError] = useState<{ name: string; key: string } | null>(null);

  useEffect(() => {
    if (!fieldError) return;
    const field = formRef.current?.elements.namedItem(fieldError.name);
    if (!(field instanceof HTMLElement)) return;
    const section = field.closest("details");
    if (section) section.open = true;
    field.focus();
    field.scrollIntoView({ block: "center", behavior: "instant" });
  }, [fieldError]);

  const invalid = (name: string) => fieldError?.name === name
    ? { "aria-invalid": true as const, "aria-describedby": `mission-error-${name}` }
    : {};
  const errorHint = (name: string) => fieldError?.name === name
    ? <p id={`mission-error-${name}`} className="text-sm text-warning">{t(fieldError.key)}</p>
    : null;

  const draft = { query, marketCode, cityPreset, locationLabel, latitude, longitude, radiusKm,
    preferredPriceMax, hardBudgetMax, requirements, autonomousActions: autonomousActions as BuyMissionInput["autonomous_actions"], expiresAt };

  useEffect(() => {
    if (!draftSource) return;
    const saved = readBuyMissionDraft(draftSource, draftOwnerId);
    if (saved) {
      restoredDraft.current = true;
      setQuery(saved.query);
      setMarketCode(saved.marketCode);
      setCityPreset(saved.cityPreset);
      setLocationLabel(saved.locationLabel);
      setLatitude(saved.latitude);
      setLongitude(saved.longitude);
      setRadiusKm(saved.radiusKm);
      setPreferredPriceMax(saved.preferredPriceMax);
      setHardBudgetMax(saved.hardBudgetMax);
      setRequirements(saved.requirements);
      setAutonomousActions(saved.autonomousActions);
      setExpiresAt(saved.expiresAt);
    }
    setDraftReady(true);
  }, [draftSource, draftOwnerId]);

  useEffect(() => {
    if (draftSource && draftReady) setStorageError(!saveBuyMissionDraft(draftSource, draft, draftOwnerId));
  // Each draft field is intentionally a dependency; never overwrite it with a stale closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSource, draftOwnerId, draftReady, query, marketCode, cityPreset, locationLabel, latitude, longitude,
    radiusKm, preferredPriceMax, hardBudgetMax, requirements, autonomousActions, expiresAt]);

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
        if (!response || !response.ok || restoredDraft.current || edited.current) return;
        const payload = await response.json();
        const policy = payload?.data;
        const radius = policy?.mission_defaults?.radius_km;
        if (Number.isInteger(radius) && radius >= 1 && radius <= 300) {
          setRadiusKm(String(radius));
        }

        const configuredActions = Array.isArray(policy?.mission_defaults?.autonomous_actions)
          ? policy.mission_defaults.autonomous_actions
          : null;
        if (configuredActions && !draftSource) {
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
  }, [prefill, draftSource]);

  const applyCityPreset = (presetId: string) => {
    setCityPreset(presetId);
    setCoordinatesOpen(presetId === "custom");
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
    setFieldError(null);
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
      expires_at: Number.isFinite(new Date(expiresAt).getTime()) ? new Date(expiresAt).toISOString() : ""
    };
    const parsed = buyMissionZodSchema.safeParse(args);
    if (!parsed.success) {
      const path = String(parsed.error.issues[0]?.path[0] || "");
      const errors: Record<string, { name: string; key: string }> = {
        query: { name: "query", key: "mission.validation.query" },
        preferred_price_max: { name: "preferred_price_max", key: "mission.validation.budget" },
        requirements: { name: "requirements_text", key: "mission.validation.requirements" },
        expires_at: { name: "expires_at", key: "mission.validation.expiry" }
      };
      const error = errors[path];
      if (error) setFieldError(error);
      setResultMessage({ key: error?.key || "mission.result.validation", code: "VALIDATION_ERROR" });
      setSubmitting(false);
      return;
    }
    const draftSaved = draftSource ? saveBuyMissionDraft(draftSource, draft, draftOwnerId) : true;
    const execution: Promise<StableToolResult> = Promise.resolve()
      .then(() => executeMission(parsed.data, { draftSaved }))
      .catch(() => ({
        ok: false as const,
        error: { code: "OUTCOME_UNKNOWN", message: "Check the saved missions before retrying", details: {} },
        meta: { request_id: randomUuid() }
      }));

    // Observe completion for both human and agent submits, including rejected executions.
    void execution.then((result) => {
      setResultMessage(describeMissionResult(result, formatCeiling(hardBudgetMax, marketCode, locale), locale));
      setSubmitting(false);
    });

    const nativeEvent = event.nativeEvent as Event & {
      agentInvoked?: boolean;
      respondWith?: (result: Promise<unknown>) => void;
    };
    // Native WebMCP exposes respondWith on human SubmitEvents too, but rejects its use there.
    if (nativeEvent.agentInvoked && typeof nativeEvent.respondWith === "function") {
      nativeEvent.respondWith(execution);
    }
  };

  const options = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <label className="space-y-1">
        <span id="mission-label-expires" className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.expires")}</span>
        <input
          {...param(t("mission.params.expires"))}
          {...invalid("expires_at")}
          aria-labelledby="mission-label-expires"
          required
          name="expires_at"
          type="datetime-local"
          value={expiresAt}
          onChange={(event) => setExpiresAt(event.target.value)}
          className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
        />
        {errorHint("expires_at")}
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
  );

  return (
    <div id="buy-mission" className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-10 space-y-4 scroll-mt-24">
      {!draftSource && activeMission ? <MissionSummary mission={activeMission} /> : null}

      <form
        ref={formRef}
        {...(draftSource ? {} : webMcpFormAttributes)}
        onChangeCapture={() => {
          edited.current = true;
          if (fieldError) { setFieldError(null); setResultMessage(null); }
        }}
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
          {!draftSource ? <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.mode")}</span> : null}
        </div>

        {draftSource ? <p className="mt-3 text-sm text-muted">{t(prefill?.listingTitle ? "mission.budgetHint" : "mission.currencyHint", { currency: marketCode === "GB" ? "GBP" : "EUR" })}</p> : null}
        {draftSource && restoredDraft.current ? <p role="status" className="mt-2 text-sm text-primary">{t("mission.draftResumed")}</p> : null}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 lg:col-span-2">
            <span id="mission-label-query" className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.query")}</span>
            <input
              {...param(t("mission.params.query"))}
              {...invalid("query")}
              aria-labelledby="mission-label-query"
              required
              maxLength={80}
              name="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
            {errorHint("query")}
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
              <option value="custom">{t(draftSource && hasCustomLocation && latitude === prefill?.latitude && longitude === prefill?.longitude ? "mission.listingLocation" : "mission.customCoordinates")}</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.location")}</span>
            <input
              {...param(t("mission.params.location"))}
              maxLength={80}
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
            <span id="mission-label-preferred" className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.preferred")}</span>
            <input
              {...param(t("mission.params.preferred"))}
              {...invalid("preferred_price_max")}
              aria-labelledby="mission-label-preferred"
              name="preferred_price_max"
              type="number"
              min="0.01"
              step="0.01"
              value={preferredPriceMax}
              onChange={(event) => setPreferredPriceMax(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
            {errorHint("preferred_price_max")}
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
            <span id="mission-label-requirements" className="text-[10px] font-mono uppercase text-subtle">{t("mission.fields.requirements")}</span>
            <textarea
              {...param(t("mission.params.requirements"))}
              {...invalid("requirements_text")}
              aria-labelledby="mission-label-requirements"
              maxLength={1210}
              name="requirements_text"
              rows={3}
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
            {errorHint("requirements_text")}
          </label>

        </div>

        {draftSource ? (
          <details className="mt-4 border border-border bg-bg/40" data-testid="buy-mission-options">
            <summary className="cursor-pointer px-3 py-3 text-sm text-muted">{t("mission.options")}</summary>
            <div className="border-t border-border p-3">{options}</div>
          </details>
        ) : <div className="mt-4">{options}</div>}

        <details
          className="mt-4 border border-border bg-bg/40"
          open={coordinatesOpen}
          onToggle={(event) => setCoordinatesOpen(event.currentTarget.open)}
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
            disabled={submitting || !draftReady}
            className="border border-primary bg-primary px-4 py-2 text-xs font-mono font-bold uppercase text-bg disabled:opacity-50"
          >
            {submitting ? t("mission.creating") : submitLabel || t("mission.create")}
          </button>
          <p className="text-xs font-mono text-subtle">{submitHint || t("mission.submitHint")}</p>
        </div>
        {storageError ? <p role="alert" className="mt-3 text-sm text-warning">{t("mission.result.storage")}</p> : null}
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
        {resultMessage?.code === "OUTCOME_UNKNOWN" ? (
          <Link href="/my/missions" data-testid="buy-mission-check-missions" className="mt-3 inline-block text-sm text-primary underline">
            {t("mission.result.checkMissions")}
          </Link>
        ) : null}
      </form>
    </div>
  );
}
