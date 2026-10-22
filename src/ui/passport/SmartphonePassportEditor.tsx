import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CHECK_IDS, passportFromResponse, photoFromResponse, type Answer, type CheckId, type Passport, type PassportPhoto as Photo } from "./passport-types";
import PassportPhoto from "./PassportPhoto";
import { PASSPORT_MAX_PHOTO_BYTES, PASSPORT_MAX_NOTES_LENGTH } from "../../lib/smartphone-passport";

type DraftCheck = { answer: Answer; notes: string; photos: Photo[] };
type Draft = { model: string; batteryHealth: string; checks: Record<CheckId, DraftCheck> };
const inputClass = "mt-2 block w-full rounded border border-border bg-bg px-3 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const buttonClass = "rounded border border-border px-4 py-2.5 text-sm font-semibold text-text hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";

function draftFromPassport(passport: Passport | null): Draft {
  return {
    model: passport?.model ?? "",
    batteryHealth: passport?.battery_health_percent == null ? "" : String(passport.battery_health_percent),
    checks: Object.fromEntries(CHECK_IDS.map((id) => {
      const check = passport?.checks.find((entry) => entry.id === id);
      return [id, { answer: check?.answer ?? "unknown", notes: check?.notes ?? "", photos: check?.photos ?? [] }];
    })) as Draft["checks"],
  };
}

async function photoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Photo read failed"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

export default function SmartphonePassportEditor({ listingId, listingStatus }: { listingId: string; listingStatus: string }) {
  const t = useTranslations("passport");
  const locale = useLocale();
  const endpoint = `/api/v1/owner/listings/${encodeURIComponent(listingId)}/passport`;
  const [passport, setPassport] = useState<Passport | null>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFromPassport(null));
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<CheckId | null>(null);
  const [photoError, setPhotoError] = useState<{ id: CheckId; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverLocked, setServerLocked] = useState(false);
  const editable = ["DRAFT", "PENDING_APPROVAL", "LIVE"].includes(listingStatus) && !serverLocked;
  const request = useRef<AbortController | null>(null);
  const cleanupRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const pendingPhotoDeletions = useRef(new Map<string, Photo>());
  const cleanupRunning = useRef(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [pendingCleanupCount, setPendingCleanupCount] = useState(0);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState("loading");
    setError(null);
    try {
      const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Load failed");
      const next = passportFromResponse(await response.json(), { listingId, access: "owner" });
      if (controller.signal.aborted) return;
      setPassport(next);
      setDraft(draftFromPassport(next));
      setEnabled(Boolean(next));
      setConflict(false);
      setSuccess(false);
      setState("ready");
    } catch {
      if (!controller.signal.aborted) setState("error");
    }
  }, [endpoint, listingId]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current?.abort();
      cleanupRequest.current?.abort();
    };
  }, [load]);

  function updateCheck(id: CheckId, patch: Partial<DraftCheck>) {
    setDraft((current) => ({ ...current, checks: { ...current.checks, [id]: { ...current.checks[id], ...patch } } }));
    setSuccess(false);
  }

  async function flushPhotoCleanup() {
    if (cleanupRunning.current || !pendingPhotoDeletions.current.size) return;
    cleanupRunning.current = true;
    setCleanupBusy(true);
    const attempted = new Set<string>();
    try {
      // Include removals queued during this pass, but retry failures only when
      // the seller asks. Cleanup never changes the result of a passport save.
      while (mounted.current) {
        const photo = [...pendingPhotoDeletions.current.values()].find((entry) => !attempted.has(entry.photo_id));
        if (!photo) break;
        attempted.add(photo.photo_id);
        const controller = new AbortController();
        cleanupRequest.current = controller;
        try {
          const response = await fetch(`${endpoint}/photos/${encodeURIComponent(photo.photo_id)}`, {
            method: "DELETE", signal: controller.signal,
          });
          if (controller.signal.aborted) break;
          if (response.ok || response.status === 404) pendingPhotoDeletions.current.delete(photo.photo_id);
        } catch {
          if (controller.signal.aborted) break;
          // Keep the photo in the retry queue. Attached photos are rejected by
          // the server, so a conflicting save can never delete a live proof.
        }
        if (mounted.current) setPendingCleanupCount(pendingPhotoDeletions.current.size);
      }
    } finally {
      cleanupRunning.current = false;
      if (mounted.current) {
        setCleanupBusy(false);
        setPendingCleanupCount(pendingPhotoDeletions.current.size);
      }
    }
  }

  function queuePhotoCleanup(photos: Photo[]) {
    for (const photo of photos) pendingPhotoDeletions.current.set(photo.photo_id, photo);
    setPendingCleanupCount(pendingPhotoDeletions.current.size);
    void flushPhotoCleanup();
  }

  function removePhoto(id: CheckId, photo: Photo) {
    updateCheck(id, { photos: draft.checks[id].photos.filter((entry) => entry.photo_id !== photo.photo_id) });
    const isSaved = passport?.checks.some((check) => check.photos.some((entry) => entry.photo_id === photo.photo_id));
    if (!isSaved) queuePhotoCleanup([photo]);
  }

  async function uploadPhoto(id: CheckId, file: File | undefined) {
    if (!file || !editable || saving || uploading) return;
    setSuccess(false);
    setPhotoError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > PASSPORT_MAX_PHOTO_BYTES) {
      setPhotoError({ id, message: t("photoFormatError") });
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setUploading(id);
    try {
      const response = await fetch(`${endpoint}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ check_id: id, content_type: file.type, data_base64: await photoBase64(file) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Upload failed");
      const photo = photoFromResponse(await response.json(), { listingId, access: "owner" });
      if (!controller.signal.aborted) {
        setDraft((current) => ({ ...current, checks: { ...current.checks, [id]: { ...current.checks[id], photos: [...current.checks[id].photos, photo] } } }));
      }
    } catch {
      if (!controller.signal.aborted) setPhotoError({ id, message: t("photoUploadError") });
    } finally {
      if (!controller.signal.aborted) setUploading(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!enabled || !editable || saving || uploading || conflict) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          expected_revision: passport?.revision ?? 0,
          model: draft.model.trim(),
          battery_health_percent: draft.batteryHealth === "" ? null : Number(draft.batteryHealth),
          checks: Object.fromEntries(CHECK_IDS.map((id) => [id, { answer: draft.checks[id].answer, notes: draft.checks[id].notes.trim(), photo_ids: draft.checks[id].photos.map((photo) => photo.photo_id) }])),
        }),
      });
      if (controller.signal.aborted) return;
      if (response.status === 409) {
        const body = await response.json().catch(() => ({}));
        if (body?.error?.code === "PASSPORT_LOCKED") {
          setServerLocked(true);
          setError(t("lockedError"));
        } else {
          setConflict(true);
          setError(t("conflictError"));
        }
        return;
      }
      if (response.status === 401) {
        setError(t("sessionError"));
        return;
      }
      if (!response.ok) throw new Error("Save failed");
      const next = passportFromResponse(await response.json(), { listingId, access: "owner", expectedRevision: passport?.revision ?? 0 });
      if (!next) throw new Error("Missing saved passport");
      if (!controller.signal.aborted) {
        const savedPhotoIds = new Set(next.checks.flatMap((check) => check.photos.map((photo) => photo.photo_id)));
        const detachedPhotos = passport?.checks.flatMap((check) => check.photos.filter((photo) => !savedPhotoIds.has(photo.photo_id))) ?? [];
        setPassport(next);
        setDraft(draftFromPassport(next));
        setSuccess(true);
        // The successful PUT is the authority that these photos are detached.
        // Failed saves and revision conflicts leave the saved evidence intact.
        if (detachedPhotos.length) queuePhotoCleanup(detachedPhotos);
      }
    } catch {
      if (!controller.signal.aborted) setError(t("saveError"));
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  const lastSaved = passport ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(passport.updated_at)) : null;

  return (
    <section aria-labelledby="passport-editor-title" className="rounded border border-border bg-surface p-4 sm:p-6" data-testid="smartphone-passport-editor">
      <h2 id="passport-editor-title" className="text-lg font-semibold text-text">{t("title")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t("editorDescription")}</p>
      {state === "loading" ? <p role="status" className="mt-4 text-sm text-muted">{t("loading")}</p> : null}
      {state === "error" ? <div className="mt-4"><p role="alert" className="text-sm text-error">{t("loadError")}</p><button type="button" className={`${buttonClass} mt-3`} onClick={() => void load()}>{t("retry")}</button></div> : null}
      {state === "ready" ? (
        <form onSubmit={save} className="mt-5 space-y-5">
          {!editable ? <p className="rounded border border-border bg-bg p-3 text-sm leading-relaxed text-muted" data-testid="passport-read-only">{t("readOnly")}</p> : null}
          {!passport && editable ? <label className="flex items-start gap-3 text-sm font-semibold text-text"><input data-testid="passport-enabled" type="checkbox" disabled={saving || Boolean(uploading)} checked={enabled} onChange={(event) => { setEnabled(event.target.checked); setSuccess(false); }} className="mt-0.5 h-4 w-4 accent-primary" />{t("enable")}</label> : null}
          {enabled ? (
            <>
              <p className="text-xs leading-relaxed text-muted">{t("disclaimer")}</p>
              <p className="rounded border border-border bg-bg p-3 text-xs leading-relaxed text-muted">{t("photoPrivacy")}</p>
              <fieldset disabled={!editable || saving || Boolean(uploading)} className="space-y-5 disabled:opacity-70">
                <label className="block text-sm font-medium text-text">{t("model")}<input data-testid="passport-model" value={draft.model} maxLength={120} required onChange={(event) => { setDraft((current) => ({ ...current, model: event.target.value })); setSuccess(false); }} placeholder={t("modelExample")} className={inputClass} /></label>
                {CHECK_IDS.map((id) => {
                  const check = draft.checks[id];
                  return (
                    <fieldset key={id} className="border-t border-border pt-4" data-testid={`passport-editor-check-${id}`}>
                      <legend className="pr-3 text-base font-semibold text-text">{t(`checks.${id}.title`)}</legend>
                      <p className="text-sm leading-relaxed text-muted">{t(`checks.${id}.hint`)}</p>
                      <div className={`mt-3 grid gap-4 ${id === "battery" ? "sm:grid-cols-2" : ""}`}>
                        <label className="block text-sm font-medium text-text">{t("checkResult")}<select data-testid={`passport-check-${id}`} value={check.answer} onChange={(event) => { updateCheck(id, { answer: event.target.value as Answer }); if (event.target.value === "not_applicable") setDraft((current) => ({ ...current, batteryHealth: "" })); }} className={inputClass}>
                          <option value="unknown">{t("answers.unknown")}</option><option value="ok">{t("answers.ok")}</option><option value="issue">{t("answers.issue")}</option>{id === "battery" ? <option value="not_applicable">{t("answers.not_applicable")}</option> : null}
                        </select></label>
                        {id === "battery" ? <label className="block text-sm font-medium text-text">{t("batteryHealth")}<input data-testid="passport-battery-health" type="number" disabled={check.answer === "not_applicable"} min={0} max={100} step={1} inputMode="numeric" value={draft.batteryHealth} onChange={(event) => { setDraft((current) => ({ ...current, batteryHealth: event.target.value })); setSuccess(false); }} className={inputClass} /><span className="mt-1 block text-xs font-normal text-muted">{t("batteryHint")}</span></label> : null}
                      </div>
                      <label className="mt-3 block text-sm font-medium text-text">{t("notes")}<textarea data-testid={`passport-notes-${id}`} rows={2} maxLength={PASSPORT_MAX_NOTES_LENGTH} required={check.answer === "issue" || check.answer === "not_applicable"} value={check.notes} onChange={(event) => updateCheck(id, { notes: event.target.value })} className={inputClass} /></label>
                      <div className="mt-3 space-y-3">
                        {check.photos.length ? <div className="grid grid-cols-2 gap-3">{check.photos.map((photo, index) => <div key={photo.photo_id}><PassportPhoto photo={photo} label={t("photoLabel", { check: t(`checks.${id}.title`), index: index + 1 })} />{editable ? <button data-testid={`passport-remove-photo-${id}-${photo.photo_id}`} type="button" onClick={() => removePhoto(id, photo)} className="mt-2 text-xs text-muted underline underline-offset-4 hover:text-text">{t("removePhoto")}</button> : null}</div>)}</div> : null}
                        {editable && check.photos.length < 2 ? <label className="block text-sm text-text">{t("addPhoto")}<input data-testid={`passport-photo-${id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { void uploadPhoto(id, event.target.files?.[0]); event.target.value = ""; }} className="mt-2 block max-w-full text-xs text-muted file:mr-3 file:rounded file:border file:border-border file:bg-bg file:px-3 file:py-2 file:text-text" /><span className="mt-1 block text-xs text-muted">{t("photoLimits")}</span></label> : null}
                        {photoError?.id === id ? <p role="alert" className="text-sm text-error">{photoError.message}</p> : null}
                        {uploading === id ? <p role="status" className="text-sm text-muted">{t("uploading")}</p> : null}
                      </div>
                    </fieldset>
                  );
                })}
              </fieldset>
              {error ? <div role="alert" className="rounded border border-error/40 bg-error/5 p-3 text-sm leading-relaxed text-error" data-testid="passport-error">{error}{conflict ? <button type="button" onClick={() => void load()} className="mt-3 block text-sm font-semibold underline underline-offset-4">{t("replaceDraft")}</button> : null}</div> : null}
              {cleanupBusy ? <p role="status" className="text-sm text-muted">{t("photoCleanupPending")}</p> : pendingCleanupCount > 0 ? <div className="rounded border border-warning/40 bg-warning/5 p-3 text-sm leading-relaxed text-warning" data-testid="passport-photo-cleanup-error"><p role="status">{t("photoCleanupError")}</p><button type="button" data-testid="passport-retry-photo-cleanup" onClick={() => void flushPhotoCleanup()} className="mt-2 font-semibold underline underline-offset-4">{t("retryPhotoCleanup")}</button></div> : null}
              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                {editable ? <button data-testid="passport-save" type="submit" disabled={saving || Boolean(uploading) || conflict} className={`${buttonClass} border-primary bg-primary text-bg hover:opacity-90`}>{saving ? t("saving") : t("save")}</button> : null}
                {success ? <p role="status" data-testid="passport-save-status" className="text-sm text-success">{t("saved")}</p> : null}
                {lastSaved ? <p className="text-xs text-muted">{t("lastSaved", { date: lastSaved })}</p> : null}
              </div>
            </>
          ) : editable ? <p className="text-sm leading-relaxed text-muted">{t("enableHint")}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
