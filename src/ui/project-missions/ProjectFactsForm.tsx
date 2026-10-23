import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { PROJECT_CONNECTORS, projectFactsSchema, type ProjectCandidate, type ProjectConnector, type ProjectFacts } from "../../shared/project-missions";
import { buttonClass, inputClass } from "./ProjectShell";

export default function ProjectFactsForm({ item, usbC, busy, save }: { item: ProjectCandidate; usbC: boolean; busy: boolean; save: (facts: ProjectFacts) => Promise<boolean> }) {
  const t = useTranslations("projectMissions");
  const fieldId = useId();
  const facts = item.facts;
  const [quote, setQuote] = useState(facts?.quoted_price_cents == null ? "" : String(facts.quoted_price_cents / 100));
  const [fee, setFee] = useState(facts?.delivery_fee_cents == null ? "" : String(facts.delivery_fee_cents / 100));
  const [width, setWidth] = useState(facts?.desk_width_cm == null ? "" : String(facts.desk_width_cm));
  const [depth, setDepth] = useState(facts?.desk_depth_cm == null ? "" : String(facts.desk_depth_cm));
  const [connectors, setConnectors] = useState<ProjectConnector[]>(facts?.connectors || []);
  const [video, setVideo] = useState(facts?.video_verified === true);
  const [pickup, setPickup] = useState(facts?.pickup_available_by || "");
  const [comfort, setComfort] = useState(facts?.comfort_score == null ? "" : String(facts.comfort_score));
  const [acknowledged, setAcknowledged] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = projectFactsSchema.safeParse({ provenance: "user_confirmed", confirmed_at: new Date().toISOString(), quoted_price_cents: quote === "" ? null : Math.round(Number(quote) * 100), delivery_fee_cents: fee === "" ? null : Math.round(Number(fee) * 100), pickup_available_by: pickup || null,
      ...(item.slot === "desk" ? { desk_width_cm: width === "" ? null : Number(width), desk_depth_cm: depth === "" ? null : Number(depth) } : {}),
      ...(item.slot === "monitor" ? { ...(connectors.length ? { connectors } : {}), ...(usbC ? { video_verified: video } : {}) } : {}),
      ...(item.slot === "chair" && comfort !== "" ? { comfort_score: Number(comfort) } : {}) });
    if (!parsed.success || !acknowledged) { setInvalid(true); return; }
    setInvalid(false); await save(parsed.data);
  };
  return <details className="border-t border-border pt-3"><summary className="cursor-pointer py-2 text-sm text-primary">{t("editFacts")}</summary>
    <form className="space-y-4 py-3" onSubmit={submit}>
      <p className="text-sm text-muted">{t("factsHint")}</p>
      <div><label className="block text-sm text-text">{t("quotedPrice")}<input className={inputClass} type="number" min="0" max="1000000" step="0.01" value={quote} onChange={event => setQuote(event.target.value)} placeholder={t("catalogPrice")} aria-describedby={`${fieldId}-quote-hint`} /></label><p id={`${fieldId}-quote-hint`} className="mt-2 text-xs text-muted">{t("quoteHint")}</p></div>
      <label className="block text-sm text-text">{t("fee")}<input className={inputClass} type="number" min="0" max="1000000" step="0.01" value={fee} onChange={event => setFee(event.target.value)} placeholder={t("unknown")} /></label>
      {item.slot === "desk" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-text">{t("width")}<input className={inputClass} type="number" min="0.1" max="1000" step="0.1" value={width} onChange={event => setWidth(event.target.value)} /></label><label className="text-sm text-text">{t("depth")}<input className={inputClass} type="number" min="0.1" max="1000" step="0.1" value={depth} onChange={event => setDepth(event.target.value)} /></label></div> : null}
      {item.slot === "monitor" ? <fieldset className="space-y-3"><legend className="text-sm text-text">{t("monitorPorts")}</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{PROJECT_CONNECTORS.map(connector => <label key={connector} className="flex min-h-11 items-center gap-2 text-sm text-text"><input className="h-4 w-4 accent-primary" type="checkbox" checked={connectors.includes(connector)} onChange={event => setConnectors(previous => event.target.checked ? [...previous, connector] : previous.filter(value => value !== connector))} />{connector.replace("_", "-")}</label>)}</div>{usbC ? <label className="flex items-start gap-3 text-sm text-text"><input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" checked={video} onChange={event => setVideo(event.target.checked)} />{t("videoVerified")}</label> : null}</fieldset> : null}
      <label className="block text-sm text-text">{t("pickupAvailable")}<input className={inputClass} type="date" value={pickup} onChange={event => setPickup(event.target.value)} /></label>
      {item.slot === "chair" ? <div><label className="block text-sm text-text">{t("comfortScore")}<select className={inputClass} value={comfort} onChange={event => setComfort(event.target.value)} aria-describedby={`${fieldId}-comfort-hint`}><option value="">{t("unknown")}</option>{[0, 1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score}/5</option>)}</select></label><p id={`${fieldId}-comfort-hint`} className="mt-2 text-xs text-muted">{t("comfortHint")}</p></div> : null}
      <label className="flex items-start gap-3 text-sm text-text"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} required />{t("factsAcknowledgment")}</label>
      {invalid ? <p role="alert" className="text-sm text-warning">{t("invalidFacts")}</p> : null}
      <button className={buttonClass} disabled={busy} type="submit">{t("saveFacts")}</button>
    </form>
  </details>;
}
