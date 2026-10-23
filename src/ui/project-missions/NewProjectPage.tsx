import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/router";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { PROJECT_CONNECTORS, projectBriefSchema, type ProjectBrief, type ProjectConnector } from "../../shared/project-missions";
import { probeOwnerSession } from "../auth/ownerSessionProbe";
import { CITY_PRESETS } from "../webmcp/BuyMissionPanel";
import { randomUuid } from "../../webmcp/utils";
import ProjectShell, { buttonClass, inputClass, secondaryClass } from "./ProjectShell";
import { assertProjectOwner, mutationHeaders, projectRequest, ProjectRequestError, type ProjectMission } from "./projectClient";

const KEY = "clawdeals:project-mission:v1:";
const draftSchema = z.object({ description: z.string().max(1000), budget: z.string(), city: z.string(), label: z.string().max(80), lat: z.string(), lon: z.string(), radius: z.string(), width: z.string(), depth: z.string(), connector: z.enum(PROJECT_CONNECTORS), pickup: z.string(), lamp: z.boolean(), keyboard: z.boolean() });
type Draft = z.infer<typeof draftSchema>;
type Attempt = { key: string; ownerId: string; brief: ProjectBrief };
const attemptSchema = z.object({ key: z.string().uuid(), ownerId: z.string().uuid(), brief: projectBriefSchema });
const storageKey = (ownerId: string | null) => `${KEY}${ownerId || "anonymous"}`;
function saveDraft(ownerId: string | null, draft: Draft, handoff = false) {
  const value = JSON.stringify({ at: Date.now(), ownerId, draft, handoff });
  sessionStorage.setItem(storageKey(ownerId), value);
  if (sessionStorage.getItem(storageKey(ownerId)) !== value) throw new Error("Storage unavailable");
}
function readDraft(ownerId: string | null) {
  const owned = JSON.parse(sessionStorage.getItem(storageKey(ownerId)) || "null");
  const anonymous = ownerId ? JSON.parse(sessionStorage.getItem(storageKey(null)) || "null") : null;
  const stored = anonymous?.handoff === true && anonymous.ownerId === null ? anonymous : owned;
  if (!stored || Date.now() - stored.at > 86_400_000) return null;
  if (stored.ownerId !== ownerId && stored !== anonymous) return null;
  const parsed = draftSchema.safeParse(stored.draft);
  if (!parsed.success) return null;
  if (stored === anonymous && ownerId) {
    saveDraft(ownerId, parsed.data);
    sessionStorage.removeItem(storageKey(null));
  }
  return parsed.data;
}

export default function NewProjectPage() {
  const t = useTranslations("projectMissions");
  const locale = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({ description: "", budget: "500", city: "paris", label: "Paris", lat: "48.8566", lon: "2.3522", radius: "25", width: "140", depth: "80", connector: "HDMI", pickup: "", lamp: false, keyboard: false });
  const [owner, setOwner] = useState<{ id: string | null } | null>(null);
  const [review, setReview] = useState<ProjectBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const prefix = router.locale && router.locale !== "en" ? `/${router.locale}` : "";
  const prepare = async () => {
    setError(null);
    const session = await probeOwnerSession({ fresh: true });
    if (session.state === "unknown" || session.state === "authenticated" && !session.ownerId) { setError("sessionCheckFailed"); return; }
    try {
      const saved = readDraft(session.ownerId);
      if (saved) setDraft(saved);
      if (session.ownerId) {
        const raw = sessionStorage.getItem(`${KEY}attempt:${session.ownerId}`);
        if (raw) {
          const pending = attemptSchema.parse(JSON.parse(raw));
          if (pending.ownerId !== session.ownerId) throw new Error("Owner mismatch");
          attempt.current = pending;
          setReview(pending.brief); setUncertain(true); setError("uncertainResult");
        }
      }
      setOwner({ id: session.ownerId });
    } catch { setError("storageError"); }
  };
  useEffect(() => { void prepare(); }, []); // Owner drafts are restored once, before rendering the form.
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  const change = <K extends keyof Draft>(field: K, value: Draft[K]) => {
    const next = { ...draft, [field]: value }; setDraft(next);
    if (owner) { try { saveDraft(owner.id, next); } catch { setError("storageError"); } }
  };
  const cityChange = (id: string) => {
    const city = CITY_PRESETS.find(item => item.id === id);
    const next = city ? { ...draft, city: id, label: id === "paris" ? "Paris" : id === "lyon" ? "Lyon" : "Marseille", lat: city.latitude, lon: city.longitude } : { ...draft, city: "custom" };
    setDraft(next);
    if (owner) { try { saveDraft(owner.id, next); } catch { setError("storageError"); } }
  };
  const locate = () => {
    setGpsError(false);
    if (!navigator.geolocation) { setGpsError(true); return; }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(position => {
      const next = { ...draft, city: "custom", label: t("currentLocation"), lat: String(position.coords.latitude), lon: String(position.coords.longitude) };
      setDraft(next); setGpsBusy(false);
      if (owner) { try { saveDraft(owner.id, next); } catch { setError("storageError"); } }
    }, () => { setGpsBusy(false); setGpsError(true); }, { timeout: 10_000, maximumAge: 60_000 });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    const brief = projectBriefSchema.safeParse({ version: 1, use_case: "home_office", description: draft.description, budget_cents: Math.round(Number(draft.budget) * 100), market_code: "FR", currency: "EUR", location: { label: draft.label || null, lat: Number(draft.lat), lon: Number(draft.lon), radius_km: Number(draft.radius) }, desk_max_width_cm: Number(draft.width), desk_max_depth_cm: Number(draft.depth), laptop_connector: draft.connector, pickup_by: draft.pickup, optional_slots: [ ...(draft.lamp ? ["lamp"] : []), ...(draft.keyboard ? ["keyboard"] : []) ] });
    if (!brief.success) { setError("invalidForm"); return; }
    const session = await probeOwnerSession({ fresh: true });
    if (session.state === "unknown") { setError("sessionCheckFailed"); return; }
    if (owner?.id && session.ownerId !== owner.id) { setError("sessionChanged"); return; }
    try {
      saveDraft(session.ownerId, draft, session.state === "anonymous");
      if (session.state === "anonymous") { void router.push(`${prefix}/auth/login?next=${encodeURIComponent(`${prefix}/my/projects/new`)}`, undefined, { locale: false }); return; }
      if (!session.ownerId) { setError("sessionCheckFailed"); return; }
      setOwner({ id: session.ownerId }); setReview(brief.data);
    } catch { setError("storageError"); }
  };
  const confirm = async () => {
    if (!review || !owner?.id || saving) return;
    const previouslyUncertain = uncertain || Boolean(attempt.current);
    setSaving(true); setError(null);
    try {
      await assertProjectOwner(owner.id);
      const request = attempt.current || { key: randomUuid(), ownerId: owner.id, brief: review };
      const value = JSON.stringify(request);
      sessionStorage.setItem(`${KEY}attempt:${owner.id}`, value);
      if (sessionStorage.getItem(`${KEY}attempt:${owner.id}`) !== value) throw new Error("Storage unavailable");
      attempt.current = request;
      const mission = await projectRequest<ProjectMission>("", { method: "POST", headers: mutationHeaders(owner.id, request.key), body: JSON.stringify({ brief: request.brief }) });
      if (!z.string().uuid().safeParse(mission.id).success || mission.owner_id !== owner.id || !projectBriefSchema.safeParse(mission.brief).success) throw new ProjectRequestError(502, "SERVER_CONTRACT_ERROR");
      sessionStorage.removeItem(`${KEY}attempt:${owner.id}`); sessionStorage.removeItem(storageKey(owner.id));
      void router.push(`/my/projects/${mission.id}`);
    } catch (cause) {
      const definitive = cause instanceof ProjectRequestError && [400, 401, 403, 404, 422, 429].includes(cause.status);
      if (definitive && !previouslyUncertain && owner.id) {
        try { sessionStorage.removeItem(`${KEY}attempt:${owner.id}`); attempt.current = null; } catch { /* Keep the attempt recoverable. */ }
      }
      const unknown = Boolean(attempt.current) && (previouslyUncertain || !definitive);
      setUncertain(unknown);
      setError(cause instanceof ProjectRequestError && cause.code === "OWNER_SESSION_CHANGED" ? "sessionChanged" : cause instanceof ProjectRequestError && cause.code === "PROJECT_DEADLINE_EXPIRED" ? "deadlineExpired" : unknown ? "uncertainResult" : "createError");
      setSaving(false);
    }
  };
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  return <ProjectShell title={t("newTitle")}>
    <div className="max-w-3xl space-y-3"><h2 className="text-3xl font-semibold text-text">{t("headline")}</h2><p className="text-muted">{t("intro")}</p><p className="text-sm text-muted">{t("boundary")}</p></div>
    {error ? <div role="alert" className="space-y-2 border border-warning p-4 text-warning"><p>{t(error)}</p>{!owner ? <button className="min-h-11 underline" onClick={() => void prepare()}>{t("retry")}</button> : null}</div> : null}
    {!owner ? <p role="status" className="text-muted">{t("loading")}</p> : review ?
      <section className="max-w-3xl space-y-5 border border-primary bg-surface p-5" aria-labelledby="project-review-title">
        <h2 ref={reviewHeading} tabIndex={-1} id="project-review-title" className="text-xl font-semibold text-text">{t("reviewTitle")}</h2>
        <p className="text-text [overflow-wrap:anywhere]">{review.description}</p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">{t("budget")}</dt><dd className="mt-1 text-xl font-semibold text-primary">{money(review.budget_cents)}</dd></div>
          <div><dt className="text-muted">{t("zone")}</dt><dd className="mt-1 text-text">{review.location.label || t("selectedArea")} · {review.location.radius_km} km</dd></div>
          <div><dt className="text-muted">{t("deskLimit")}</dt><dd className="mt-1 text-text">{review.desk_max_width_cm} × {review.desk_max_depth_cm} cm</dd></div>
          <div><dt className="text-muted">{t("connector")}</dt><dd className="mt-1 text-text">{review.laptop_connector.replace("_", "-")}</dd></div>
          <div><dt className="text-muted">{t("pickup")}</dt><dd className="mt-1 text-text">{review.pickup_by}</dd></div>
          <div><dt className="text-muted">{t("objects")}</dt><dd className="mt-1 text-text">{["desk", "chair", "monitor", ...review.optional_slots].map(slot => t(`slots.${slot}`)).join(", ")}</dd></div>
        </dl>
        <p className="text-sm text-muted">{t("createHint")}</p>
        <div className="flex flex-wrap gap-3"><button className={buttonClass} disabled={saving} onClick={() => void confirm()}>{saving ? t("saving") : t("create")}</button><button className={secondaryClass} disabled={saving || uncertain} onClick={() => setReview(null)}>{t("edit")}</button></div>
      </section> :
      <form onSubmit={submit} className="max-w-4xl space-y-6 border border-border bg-surface p-4 sm:p-6" data-testid="project-brief-form">
        <label className="block text-sm text-text">{t("description")}<textarea className={inputClass} value={draft.description} onChange={event => change("description", event.target.value)} placeholder={t("descriptionPlaceholder")} maxLength={1000} rows={2} required /></label>
        <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm text-text">{t("budget")}<input className={inputClass} type="number" min="1" max="1000000" step="0.01" value={draft.budget} onChange={event => change("budget", event.target.value)} required /></label><div className="self-center text-sm text-muted">{t("budgetHint")}</div></div>
        <fieldset className="space-y-4 border-t border-border pt-4"><legend className="pr-3 font-semibold text-text">{t("objects")}</legend><p className="text-sm text-muted">{t("requiredObjects")}</p><div className="flex flex-wrap gap-6">{(["lamp", "keyboard"] as const).map(slot => <label key={slot} className="flex min-h-11 items-center gap-3 text-sm text-text"><input type="checkbox" className="h-4 w-4 accent-primary" checked={draft[slot]} onChange={event => change(slot, event.target.checked)} />{t(`slots.${slot}`)}</label>)}</div></fieldset>
        <fieldset className="space-y-4 border-t border-border pt-4"><legend className="pr-3 font-semibold text-text">{t("zone")}</legend><p className="text-sm text-muted">{t("franceOnly")}</p><div className="grid gap-5 sm:grid-cols-3">
          <label className="text-sm text-text">{t("city")}<select className={inputClass} value={draft.city} onChange={event => cityChange(event.target.value)}><option value="paris">Paris</option><option value="lyon">Lyon</option><option value="marseille">Marseille</option><option value="custom">{t("customArea")}</option></select></label>
          <label className="text-sm text-text">{t("locationLabel")}<input className={inputClass} value={draft.label} maxLength={80} onChange={event => change("label", event.target.value)} /></label>
          <label className="text-sm text-text">{t("radius")}<input className={inputClass} type="number" min="1" max="300" step="1" value={draft.radius} onChange={event => change("radius", event.target.value)} required /></label>
        </div><button type="button" className={secondaryClass} disabled={gpsBusy} onClick={locate}>{gpsBusy ? t("locating") : t("useLocation")}</button>{gpsError ? <p role="alert" className="text-sm text-warning">{t("gpsError")}</p> : null}
          <details open={draft.city === "custom"}><summary className="cursor-pointer py-2 text-sm text-primary">{t("coordinates")}</summary><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm text-text">{t("latitude")}<input className={inputClass} type="number" min="-90" max="90" step="any" value={draft.lat} onChange={event => change("lat", event.target.value)} required /></label><label className="text-sm text-text">{t("longitude")}<input className={inputClass} type="number" min="-180" max="180" step="any" value={draft.lon} onChange={event => change("lon", event.target.value)} required /></label></div></details>
        </fieldset>
        <fieldset className="space-y-4 border-t border-border pt-4"><legend className="pr-3 font-semibold text-text">{t("compatibility")}</legend><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm text-text">{t("maxWidth")}<input className={inputClass} type="number" min="1" max="1000" step="0.1" value={draft.width} onChange={event => change("width", event.target.value)} required /></label><label className="text-sm text-text">{t("maxDepth")}<input className={inputClass} type="number" min="1" max="1000" step="0.1" value={draft.depth} onChange={event => change("depth", event.target.value)} required /></label><label className="text-sm text-text">{t("connector")}<select className={inputClass} value={draft.connector} onChange={event => change("connector", event.target.value as ProjectConnector)}>{PROJECT_CONNECTORS.map(connector => <option key={connector} value={connector}>{connector.replace("_", "-")}</option>)}</select></label><label className="text-sm text-text">{t("pickup")}<input className={inputClass} type="date" value={draft.pickup} onChange={event => change("pickup", event.target.value)} required /></label></div><p className="text-sm text-muted">{t("compatibilityHint")}</p></fieldset>
        <div className="space-y-3"><button className={buttonClass} type="submit">{owner.id ? t("reviewTitle") : t("continue")}</button><p className="text-sm text-muted">{t("draftHint")}</p></div>
      </form>}
  </ProjectShell>;
}
