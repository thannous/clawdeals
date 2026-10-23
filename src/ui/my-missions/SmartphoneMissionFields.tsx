import { useTranslations } from "next-intl";
import { SMARTPHONE_CHECK_IDS } from "../../lib/smartphone-passport";
import type { SmartphoneMissionCriteria } from "../../lib/smartphone-mission";
import type { SmartphoneMissionDraft } from "../webmcp/buyMissionDraft";

export default function SmartphoneMissionFields({ value, onChange, invalid }: {
  value: SmartphoneMissionDraft;
  onChange: (value: SmartphoneMissionDraft) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("webmcp.mission.smartphone");
  return <fieldset className="mt-5 space-y-3 border border-border bg-bg/40 p-4" data-testid="buy-mission-smartphone">
    <legend className="px-1 text-sm font-semibold text-text">{t("title")}</legend>
    <label className="flex items-start gap-3 text-sm text-text">
      <input type="checkbox" name="smartphone_enabled" data-testid="buy-mission-smartphone-enabled" checked={value.enabled}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? "mission-error-smartphone_enabled" : undefined}
        onChange={event => onChange({ ...value, enabled: event.target.checked })} className="mt-1 accent-[var(--color-primary)]" />
      <span>{t("enabled")}</span>
    </label>
    {value.enabled ? <>
      <p className="text-sm leading-relaxed text-muted">{t("hint")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-text">
          <span className="block">{t("model")}</span>
          <input name="smartphone_model" data-testid="buy-mission-smartphone-model" maxLength={120} value={value.model}
            onChange={event => onChange({ ...value, model: event.target.value })}
            aria-describedby="mission-smartphone-model-hint" className="w-full border border-border bg-bg px-3 py-2 text-sm text-text" />
          <span id="mission-smartphone-model-hint" className="block text-xs leading-relaxed text-muted">{t("modelHint")}</span>
        </label>
        <label className="space-y-1 text-sm text-text">
          <span className="block">{t("battery")}</span>
          <input name="smartphone_battery_min" data-testid="buy-mission-smartphone-battery-min" type="number" min={0} max={100} step={1}
            value={value.batteryHealthMin} onChange={event => onChange({ ...value, batteryHealthMin: event.target.value })}
            aria-describedby="mission-smartphone-battery-hint" className="w-full border border-border bg-bg px-3 py-2 text-sm text-text" />
          <span id="mission-smartphone-battery-hint" className="block text-xs leading-relaxed text-muted">{t("batteryHint")}</span>
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium text-text">{t("checksTitle")}</legend>
        {SMARTPHONE_CHECK_IDS.map(id => <label key={id} className="flex items-start gap-3 text-sm text-text">
          <input type="checkbox" name="smartphone_required_checks" value={id} data-testid={`buy-mission-smartphone-check-${id}`}
            checked={value.requiredChecks.includes(id)} onChange={event => onChange({ ...value, requiredChecks: SMARTPHONE_CHECK_IDS.filter(check => check === id ? event.target.checked : value.requiredChecks.includes(check)) })}
            className="mt-1 accent-[var(--color-primary)]" />
          <span>{t(`checks.${id}`)}</span>
        </label>)}
      </fieldset>
      <p className="text-xs leading-relaxed text-muted">{t("unknownHint")}</p>
    </> : null}
  </fieldset>;
}

export function SmartphoneMissionSummary({ criteria }: { criteria: SmartphoneMissionCriteria }) {
  const t = useTranslations("webmcp.mission.smartphone");
  return <div className="mt-4 border-t border-border pt-3" data-testid="buy-mission-smartphone-summary">
    <h3 className="text-sm font-semibold text-text">{t("title")}</h3>
    <ul className="mt-2 space-y-1 break-words text-sm text-text">
      {criteria.model ? <li>{t("modelSummary", { model: criteria.model })}</li> : null}
      {criteria.battery_health_min !== null ? <li>{t("batterySummary", { minimum: criteria.battery_health_min })}</li> : null}
      {criteria.required_checks.map(id => <li key={id}>{t("checkSummary", { check: t(`checks.${id}`) })}</li>)}
    </ul>
    <p className="mt-2 text-xs leading-relaxed text-muted">{t("unknownHint")}</p>
  </div>;
}
