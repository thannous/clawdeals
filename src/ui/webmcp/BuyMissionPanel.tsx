import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";

import { useWebMcp } from "../../webmcp/WebMcpProvider";
import {
  getActiveBuyMission,
  subscribeActiveBuyMission,
  type BuyMissionView
} from "../../webmcp/ui-bridge";

const DAY_MS = 24 * 60 * 60 * 1000;

type MarketCode = "FR" | "GB" | "ES";

export type CityPreset = {
  id: string;
  label: string;
  market: MarketCode;
  latitude: string;
  longitude: string;
};

export const CITY_PRESETS: CityPreset[] = [
  { id: "paris", label: "Paris", market: "FR", latitude: "48.8566", longitude: "2.3522" },
  { id: "lyon", label: "Lyon", market: "FR", latitude: "45.7640", longitude: "4.8357" },
  { id: "marseille", label: "Marseille", market: "FR", latitude: "43.2965", longitude: "5.3698" },
  { id: "london", label: "London", market: "GB", latitude: "51.5074", longitude: "-0.1278" },
  { id: "madrid", label: "Madrid", market: "ES", latitude: "40.4168", longitude: "-3.7038" }
];

const AUTONOMOUS_ACTION_OPTIONS: Array<{ value: string; label: string; hint: string; locked?: boolean }> = [
  { value: "search", label: "Search and rank listings", hint: "Always on: the mission is useless without it.", locked: true },
  { value: "ask_question", label: "Ask the seller questions", hint: "Messages go through the server redaction." },
  { value: "make_offer", label: "Make policy-compliant offers", hint: "Every offer still stops for your confirmation." }
];

function formatCeiling(value: string, market: MarketCode): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  const currency = market === "GB" ? "GBP" : "EUR";
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function describeMissionResult(
  result: { ok: true; meta?: { request_id?: string } } | { ok: false; error: { code: string; message: string } },
  ceiling: string
): { text: string; code: string | null } {
  if (result.ok === true) {
    return {
      text: `Mission created. The server now enforces your ${ceiling} ceiling on every offer.${
        result.meta?.request_id ? ` Receipt ${result.meta.request_id.slice(0, 8)} is in Agent Activity.` : ""
      }`,
      code: null
    };
  }
  const code = result.error.code;
  if (code === "USER_DENIED") return { text: "Confirmation declined. Nothing was created.", code };
  if (code === "UNAUTHORIZED" || code === "AUTH_REQUIRED" || code === "MISSING_API_KEY") {
    return { text: "Connect an agent key first, then create the mission.", code };
  }
  if (code === "VALIDATION_ERROR") return { text: `The server rejected the mission: ${result.error.message}`, code };
  if (code === "OUTCOME_UNKNOWN") return { text: "The result is unknown. Check Agent Activity before retrying.", code };
  return { text: result.error.message || "The mission could not be created.", code };
}

function defaultExpirationValue() {
  const date = new Date(Date.now() + 7 * DAY_MS);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function formatMoney(value: number | null, currency: string) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(value);
}

function MissionSummary({ mission }: { mission: BuyMissionView }) {
  return (
    <section
      className="border border-primary/50 bg-primary/5 rounded clip-corner p-4"
      data-testid="buy-mission-summary"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">Active Deal Mission</p>
          <h3 className="mt-1 text-lg font-bold uppercase tracking-wide text-text">{mission.query}</h3>
          <p className="mt-1 text-xs font-mono text-muted">
            {mission.location.label || "Selected area"} · {mission.location.radius_km} km
          </p>
        </div>
        <span className="border border-primary/50 px-2 py-1 text-[10px] font-mono uppercase text-primary">
          {mission.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <dt className="text-[10px] font-mono uppercase text-subtle">Preferred</dt>
          <dd className="text-sm font-mono text-text">
            {formatMoney(mission.preferred_price_max, mission.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-mono uppercase text-subtle">Hard ceiling</dt>
          <dd className="text-sm font-mono font-bold text-text">
            {formatMoney(mission.hard_budget_max, mission.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-mono uppercase text-subtle">Autonomy</dt>
          <dd className="text-xs font-mono text-text">{mission.autonomous_actions.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-mono uppercase text-subtle">Contact</dt>
          <dd className="text-xs font-mono text-text">Bilateral approval only</dd>
        </div>
      </dl>

      {mission.requirements.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[10px] font-mono uppercase text-subtle">Minimum requirements</p>
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

export default function BuyMissionPanel() {
  const { executeTool } = useWebMcp();
  const activeMission = useSyncExternalStore(
    subscribeActiveBuyMission,
    getActiveBuyMission,
    () => null
  );
  const [query, setQuery] = useState("used e-bike");
  const [marketCode, setMarketCode] = useState<MarketCode>("FR");
  const [cityPreset, setCityPreset] = useState<string>("paris");
  const [locationLabel, setLocationLabel] = useState("Paris");
  const [latitude, setLatitude] = useState("48.8566");
  const [longitude, setLongitude] = useState("2.3522");
  const [radiusKm, setRadiusKm] = useState("25");
  const [preferredPriceMax, setPreferredPriceMax] = useState("1200");
  const [hardBudgetMax, setHardBudgetMax] = useState("1300");
  const [requirements, setRequirements] = useState("battery_health >= 80%");
  const [autonomousActions, setAutonomousActions] = useState<string[]>([
    "search",
    "ask_question",
    "make_offer"
  ]);
  const [expiresAt, setExpiresAt] = useState(defaultExpirationValue);
  const [resultMessage, setResultMessage] = useState<{ text: string; code: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const applyCityPreset = (presetId: string) => {
    setCityPreset(presetId);
    const preset = CITY_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) return;
    setLocationLabel(preset.label);
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
        tooldescription:
          "Fill the visible Clawdeals buying mission form. The human reviews and submits it before the mission is created."
      }) as any,
    []
  );
  const param = (description: string) => ({ toolparamdescription: description } as any);

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
      setResultMessage(describeMissionResult(result, formatCeiling(hardBudgetMax, marketCode)));
    });
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 mb-10 space-y-4">
      {activeMission ? <MissionSummary mission={activeMission} /> : null}

      <form
        {...webMcpFormAttributes}
        onSubmit={submitMission}
        className="border border-border bg-surface rounded clip-corner p-4"
        data-testid="buy-mission-form"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">Deal Mission</p>
            <h2 className="mt-1 text-xl font-bold uppercase tracking-wide text-text">
              Delegate the search. Keep the limits.
            </h2>
          </div>
          <span className="text-[10px] font-mono uppercase text-subtle">Declarative + imperative WebMCP</span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 lg:col-span-2">
            <span className="text-[10px] font-mono uppercase text-subtle">What to find</span>
            <input
              {...param("The product or item the owner wants the agent to find.")}
              required
              name="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">City</span>
            <select
              data-testid="buy-mission-city"
              value={cityPreset}
              onChange={(event) => applyCityPreset(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            >
              {CITY_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} · {preset.market === "GB" ? "GBP" : "EUR"}
                </option>
              ))}
              <option value="custom">Custom coordinates…</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">Location label</span>
            <input
              {...param("Human-readable center of the mission search area.")}
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
            <span className="text-[10px] font-mono uppercase text-subtle">Radius km</span>
            <input
              {...param("Maximum search radius in kilometers, from 1 to 300.")}
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
            <span className="text-[10px] font-mono uppercase text-subtle">Expires</span>
            <input
              {...param("Mission expiration, no more than 90 days in the future.")}
              required
              name="expires_at"
              type="datetime-local"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">Preferred price</span>
            <input
              {...param("Preferred price target in the market currency.")}
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
            <span className="text-[10px] font-mono uppercase text-subtle">Hard ceiling</span>
            <input
              {...param("Absolute offer ceiling that the backend must enforce.")}
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
            <span className="text-[10px] font-mono uppercase text-subtle">Minimum requirements</span>
            <textarea
              {...param("Comma- or newline-separated requirements the seller must confirm.")}
              name="requirements_text"
              rows={3}
              value={requirements}
              onChange={(event) => setRequirements(event.target.value)}
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            />
          </label>
          <fieldset className="space-y-1" data-testid="buy-mission-autonomy">
            <legend className="text-[10px] font-mono uppercase text-subtle">Autonomous actions</legend>
            <div className="space-y-1.5 border border-border bg-bg px-3 py-2">
              {AUTONOMOUS_ACTION_OPTIONS.map((option) => {
                const checked = autonomousActions.includes(option.value);
                return (
                  <label key={option.value} className="flex items-start gap-2 text-xs font-mono text-text" title={option.hint}>
                    <input
                      {...param(`Delegate "${option.label}" to the agent.`)}
                      type="checkbox"
                      name="autonomous_actions"
                      value={option.value}
                      checked={option.locked ? true : checked}
                      disabled={option.locked}
                      onChange={(event) => toggleAutonomousAction(option.value, event.target.checked)}
                      className="mt-0.5 accent-[var(--color-primary)]"
                    />
                    <span>
                      {option.label}
                      {option.locked ? <span className="ml-1 text-subtle">(required)</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-subtle">Contact rule</span>
            <select
              {...param("Contact details remain hidden until both owners approve.")}
              required
              name="contact_reveal"
              defaultValue="manual_bilateral_approval"
              className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
            >
              <option value="manual_bilateral_approval">Manual bilateral approval</option>
            </select>
          </label>
        </div>

        <details className="mt-4 border border-border bg-bg/40" open={cityPreset === "custom"} data-testid="buy-mission-advanced">
          <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-subtle hover:text-text">
            Advanced · coordinates
          </summary>
          <div className="grid grid-cols-1 gap-4 border-t border-border p-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-subtle">Latitude</span>
              <input
                {...param("Latitude of the mission center, between -90 and 90.")}
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
              <span className="text-[10px] font-mono uppercase text-subtle">Longitude</span>
              <input
                {...param("Longitude of the mission center, between -180 and 180.")}
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
              <span className="text-[10px] font-mono uppercase text-subtle">Market</span>
              <select
                {...param("The Clawdeals market used for currency and listing availability.")}
                name="market_code"
                value={marketCode}
                onChange={(event) => setMarketCode(event.target.value as MarketCode)}
                className="w-full border border-border bg-bg px-3 py-2 text-sm font-mono text-text"
              >
                <option value="FR">France · EUR</option>
                <option value="GB">United Kingdom · GBP</option>
                <option value="ES">Spain · EUR</option>
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
            {submitting ? "Creating…" : "Create mission"}
          </button>
          <p className="text-xs font-mono text-subtle">
            Requires a connected agent key and explicit confirmation. Contact data stays hidden.
          </p>
        </div>
        {resultMessage ? (
          <p
            className={`mt-3 text-xs font-mono ${resultMessage.code ? "text-warning" : "text-success"}`}
            data-testid="buy-mission-result"
            data-code={resultMessage.code || undefined}
            title={resultMessage.code || undefined}
            aria-live="polite"
          >
            {resultMessage.text}
          </p>
        ) : null}
      </form>
    </div>
  );
}
