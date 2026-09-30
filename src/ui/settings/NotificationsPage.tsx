import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Bell, Check, Save } from "lucide-react";

import { NOTIFICATION_MODES, NOTIFICATION_EVENT_TYPES, type NotificationSettings } from "../../shared/notification-settings";
import { localePrefixFor, resolveSupportedLocale, stripLocalePrefix } from "../../shared/i18n";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import SettingsNav from "./SettingsNav";

type Form = NotificationSettings & { quiet_start_min: number; quiet_end_min: number };
const endpoint = "/api/v1/owner/notification-preferences";
const inputClass = "mt-2 block w-full rounded border border-border bg-bg px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function hydrate(preferences: NotificationSettings): Form {
  return {
    ...preferences,
    quiet_start_min: preferences.quiet_start_min ?? 22 * 60,
    quiet_end_min: preferences.quiet_end_min ?? 8 * 60
  };
}

function timeValue(minutes: number) {
  if (!Number.isFinite(minutes)) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function changedFields(form: Form, saved: Form) {
  return Object.fromEntries(Object.entries(form).filter(([key, value]) => (
    JSON.stringify(value) !== JSON.stringify(saved[key as keyof Form])
  )));
}

export default function NotificationsPage() {
  const t = useTranslations("settings.notifications");
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  const login = useCallback(() => {
    const next = `${localePrefixFor(resolveSupportedLocale(router.locale))}${stripLocalePrefix(router.asPath || "/settings/notifications")}`;
    void router.replace(`/auth/login?next=${encodeURIComponent(next)}`, undefined, { locale: router.locale });
  }, [router]);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState("loading");
    setError(null);
    try {
      const sessionResponse = await fetch("/api/v1/auth/session", { signal: controller.signal });
      const session = await sessionResponse.json();
      if (sessionResponse.status === 401 || session?.data?.authenticated === false) {
        login();
        return;
      }
      if (!sessionResponse.ok) throw new Error("Session unavailable");
      const response = await fetch(endpoint, { signal: controller.signal });
      if (response.status === 401) { login(); return; }
      if (!response.ok) throw new Error("Preferences unavailable");
      const body = await response.json();
      const next = hydrate(body.data.preferences);
      setForm(next);
      setSaved(next);
      setState("done");
    } catch {
      if (!controller.signal.aborted) setState("error");
    }
  }, [login]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((previous) => previous ? { ...previous, [key]: value } : previous);
    setError(null);
    setSuccess(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !saved || saving) return;
    const patch = changedFields(form, saved);
    if (Object.keys(patch).length === 0) return;
    try {
      new Intl.DateTimeFormat("en", { timeZone: form.timezone.trim() }).format();
    } catch {
      setError(t("invalidTimezone"));
      return;
    }
    if (form.quiet_enabled && form.quiet_start_min === form.quiet_end_min) {
      setError(t("invalidQuietHours"));
      return;
    }
    if (form.quiet_enabled && ("quiet_enabled" in patch || "quiet_start_min" in patch || "quiet_end_min" in patch)) {
      patch.quiet_start_min = form.quiet_start_min;
      patch.quiet_end_min = form.quiet_end_min;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch), signal: controller.signal
      });
      if (response.status === 401) { login(); return; }
      if (!response.ok) throw new Error("Save failed");
      const body = await response.json();
      const next = hydrate(body.data.preferences);
      setForm(next);
      setSaved(next);
      setSuccess(true);
    } catch {
      if (!controller.signal.aborted) setError(t("saveError"));
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  const dirty = Boolean(form && saved && Object.keys(changedFields(form, saved)).length);

  return (
    <div data-testid="notifications-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")} containerClassName="px-6 pt-4">
        <AppNav current="settings" />
        <SettingsNav current="notifications" />
      </PageHeader>
      <main id="main-content" tabIndex={-1} className="w-full max-w-3xl px-4 py-8 sm:px-6">
        {state === "loading" ? <p className="py-12 text-sm text-muted">{t("loading")}</p> : null}
        {state === "error" ? (
          <div className="rounded border border-error/40 bg-error/5 p-6">
            <p role="alert" className="text-sm text-error">{t("loadError")}</p>
            <button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold text-primary underline">{t("retry")}</button>
          </div>
        ) : null}
        {state === "done" && form ? (
          <form onSubmit={save} className="space-y-6">
            <div className="flex gap-3 rounded border border-primary/30 bg-primary/5 p-4">
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="space-y-2 text-sm leading-relaxed text-muted">
                <p>{t("description")}</p>
                <p>{t("deliveryHint")} <Link href="/settings/identities" className="text-primary underline">{t("manageChannels")}</Link></p>
              </div>
            </div>
            <fieldset disabled={saving} className="space-y-6 disabled:opacity-60">
              <fieldset>
                <legend className="text-base font-semibold text-text">{t("frequency")}</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {NOTIFICATION_MODES.map((mode) => (
                    <label key={mode} className={`flex cursor-pointer items-start gap-3 rounded border p-4 ${form.mode === mode ? "border-primary bg-primary/5" : "border-border bg-surface"}`}>
                      <input type="radio" name="notification-mode" value={mode} checked={form.mode === mode} onChange={() => update("mode", mode)} className="mt-1 accent-primary" />
                      <span><span className="block text-sm font-semibold text-text">{t(`modes.${mode}.label`)}</span><span className="mt-1 block text-xs leading-relaxed text-muted">{t(`modes.${mode}.hint`)}</span></span>
                    </label>
                  ))}
                </div>
                {form.mode === "SILENT" ? <p className="mt-3 text-sm text-warning">{t("pausedHint")}</p> : null}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-text">
                  {t("timezone")}
                  <input type="text" required value={form.timezone} list="notification-timezones" onChange={(event) => update("timezone", event.target.value)} className={inputClass} spellCheck={false} />
                  <datalist id="notification-timezones">
                    {["UTC", "Europe/Paris", "Europe/London", "Europe/Madrid", "America/New_York"].map((zone) => <option key={zone} value={zone} />)}
                  </datalist>
                </label>
                {form.mode === "DIGEST_DAILY" ? (
                  <label className="text-sm font-medium text-text">
                    {t("digestHour")}
                    <select value={form.daily_digest_hour} onChange={(event) => update("daily_digest_hour", Number(event.target.value))} className={inputClass}>
                      {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
              <p className="text-xs text-muted">{t("localTimeHint")}</p>

              <fieldset className="rounded border border-border p-4">
                <legend className="px-1 text-base font-semibold text-text">{t("quietHours")}</legend>
                <label className="flex items-center gap-3 text-sm text-text">
                  <input type="checkbox" checked={form.quiet_enabled} onChange={(event) => update("quiet_enabled", event.target.checked)} className="accent-primary" />
                  {t("quietEnabled")}
                </label>
                <p className="mt-2 text-xs leading-relaxed text-muted">{t("quietHint")}</p>
                {form.quiet_enabled ? (
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <label className="text-sm text-text">{t("quietStart")}<input type="time" required value={timeValue(form.quiet_start_min)} onChange={(event) => update("quiet_start_min", timeMinutes(event.target.value))} className={inputClass} /></label>
                    <label className="text-sm text-text">{t("quietEnd")}<input type="time" required value={timeValue(form.quiet_end_min)} onChange={(event) => update("quiet_end_min", timeMinutes(event.target.value))} className={inputClass} /></label>
                  </div>
                ) : null}
              </fieldset>

              <fieldset>
                <legend className="text-base font-semibold text-text">{t("categories")}</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {NOTIFICATION_EVENT_TYPES.map((type) => (
                    <label key={type} className="flex items-center gap-3 rounded border border-border bg-surface p-3 text-sm text-text">
                      <input type="checkbox" checked={form.event_types.includes(type)} onChange={(event) => update("event_types", NOTIFICATION_EVENT_TYPES.filter((value) => value === type ? event.target.checked : form.event_types.includes(value)))} className="accent-primary" />
                      {t(`events.${type}`)}
                    </label>
                  ))}
                </div>
                {form.event_types.length === 0 ? <p className="mt-3 text-sm text-warning">{t("noCategories")}</p> : null}
              </fieldset>
            </fieldset>

            {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
            <div className="flex flex-wrap items-center gap-4 border-t border-border pt-5">
              <button type="submit" disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-bg hover:opacity-90 disabled:cursor-default disabled:opacity-50">
                <Save className="h-4 w-4" aria-hidden="true" />{saving ? t("saving") : t("save")}
              </button>
              {success ? <p role="status" className="flex items-center gap-2 text-sm text-success"><Check className="h-4 w-4" aria-hidden="true" />{t("saveSuccess")}</p> : null}
              {dirty && !saving ? <p className="text-xs text-muted">{t("unsaved")}</p> : null}
            </div>
          </form>
        ) : null}
      </main>
    </div>
  );
}
