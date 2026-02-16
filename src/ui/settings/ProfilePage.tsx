import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Toast from "../console/shared/Toast";
import { useToast } from "../console/shared/useToast";
import SettingsNav from "./SettingsNav";
import PageHeader from "../shared/PageHeader";
import AppNav from "../shared/AppNav";

const PRESET_AVATARS = Array.from({ length: 8 }, (_, i) => `/avatars/default-${i + 1}.svg`);

type OwnerProfile = {
  owner_id: string;
  email_verified_at: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  city: string | null;
  state_region: string | null;
  country: string | null;
  show_email: boolean;
  available: boolean;
};

export default function ProfilePage() {
  const router = useRouter();
  const t = useTranslations("settings");
  const { toasts, show } = useToast();

  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [authRequired, setAuthRequired] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("/avatars/default-1.svg");
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [showAvatarInput, setShowAvatarInput] = useState(false);
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [country, setCountry] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [available, setAvailable] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");

    try {
      const meResp = await fetch("/api/v1/auth/me", { signal: controller.signal });
      if (meResp.status === 401) {
        setAuthRequired(true);
        setState("done");
        return;
      }
      const meBody = await meResp.json().catch(() => ({}));
      if (!meResp.ok) throw new Error(meBody?.error?.message || `HTTP ${meResp.status}`);

      const ownerId = meBody?.data?.owner_id;
      if (!ownerId) throw new Error("Missing owner_id");

      const ownerResp = await fetch("/api/v1/owner/", {
        headers: { "x-owner-id": ownerId },
        signal: controller.signal,
      });
      const ownerBody = await ownerResp.json().catch(() => ({}));
      if (!ownerResp.ok) throw new Error(ownerBody?.error?.message || `HTTP ${ownerResp.status}`);

      const data = ownerBody?.data;
      setProfile(data);
      setDisplayName(data?.display_name || "");
      setBio(data?.bio || "");
      setAvatarUrl(data?.avatar_url || "/avatars/default-1.svg");
      setCity(data?.city || "");
      setStateRegion(data?.state_region || "");
      setCountry(data?.country || "");
      setShowEmail(data?.show_email ?? false);
      setAvailable(data?.available ?? true);

      // Check if avatar is a custom URL (not a preset)
      if (data?.avatar_url && !PRESET_AVATARS.includes(data.avatar_url)) {
        setCustomAvatarUrl(data.avatar_url);
        setShowAvatarInput(true);
      }

      setState("done");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setState("error");
    }
  }, []);

  useEffect(() => {
    void fetchProfile();
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [fetchProfile]);

  useEffect(() => {
    if (!authRequired) return;
    const next = encodeURIComponent(router.asPath || "/settings/profile");
    void router.replace(`/auth/login?next=${next}`);
  }, [authRequired, router]);

  const onSave = useCallback(async () => {
    if (!profile?.owner_id || saveState === "saving") return;
    setSaveState("saving");

    try {
      const resp = await fetch("/api/v1/owner/", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-owner-id": profile.owner_id,
        },
        body: JSON.stringify({
          display_name: displayName || null,
          bio: bio || null,
          avatar_url: avatarUrl,
          city: city || null,
          state_region: stateRegion || null,
          country: country || null,
          show_email: showEmail,
          available,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body?.error?.message || `HTTP ${resp.status}`);

      setProfile(body?.data || profile);
      show(t("profile.saveSuccess"), "success");
    } catch (err: any) {
      show(err?.message || t("profile.saveError"), "error");
    } finally {
      setSaveState("idle");
    }
  }, [profile, saveState, displayName, bio, avatarUrl, city, stateRegion, country, showEmail, available, show, t]);

  const selectAvatar = useCallback((url: string) => {
    setAvatarUrl(url);
    setShowAvatarInput(false);
    setCustomAvatarUrl("");
  }, []);

  const applyCustomAvatar = useCallback(() => {
    if (customAvatarUrl.trim()) {
      setAvatarUrl(customAvatarUrl.trim());
    }
  }, [customAvatarUrl]);

  // Completion checklist
  const nameComplete = Boolean(displayName.trim());
  const locationComplete = Boolean(city.trim());
  const emailVerified = Boolean(profile?.email_verified_at);
  const allComplete = nameComplete && locationComplete && emailVerified;

  return (
    <div data-testid="profile-page" className="min-h-screen bg-bg">
      <PageHeader title={t("profile.title")} containerClassName="px-6 pt-4">
        <AppNav current="settings" />
        <SettingsNav current="profile" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full max-w-3xl px-6 py-6">
        {/* Loading */}
        {!authRequired && state === "loading" && (
          <div className="flex items-center gap-3 py-12">
            <div className="h-4 w-4 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
            <span className="text-sm font-mono text-subtle">Loading profile...</span>
          </div>
        )}

        {/* Error */}
        {!authRequired && state === "error" && (
          <div className="border border-error/30 bg-error/5 rounded clip-corner p-4">
            <div className="text-sm font-mono font-semibold text-error">{t("profile.loadError")}</div>
          </div>
        )}

        {/* Loaded */}
        {!authRequired && state === "done" && profile && (
          <div className="space-y-6">

            {/* ---- Completion banner ---- */}
            {!allComplete && (
              <div className="border border-primary/30 bg-primary/5 rounded clip-corner p-5">
                <h3 className="text-sm font-bold text-primary">{t("profile.completeBanner.heading")}</h3>
                <p className="text-xs font-mono text-muted mt-1">{t("profile.completeBanner.subtitle")}</p>
                <ul className="mt-3 space-y-1.5">
                  {[
                    { done: nameComplete, label: t("profile.completeBanner.nameAdded") },
                    { done: locationComplete, label: t("profile.completeBanner.locationAdded") },
                    { done: emailVerified, label: t("profile.completeBanner.emailVerified") },
                  ].map((item) => (
                    <li key={item.label} className="flex items-center gap-2 text-xs font-mono">
                      {item.done ? (
                        <span className="text-success">&#10003;</span>
                      ) : (
                        <span className="text-muted">&#9675;</span>
                      )}
                      <span className={item.done ? "text-muted line-through" : "text-text"}>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ---- Verify CTA ---- */}
            {!emailVerified && (
              <div className="border border-warning/30 bg-warning/5 rounded clip-corner p-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-warning">{t("profile.verifyBanner.heading")}</h3>
                  <p className="text-xs font-mono text-muted mt-0.5">{t("profile.verifyBanner.subtitle")}</p>
                </div>
                <button
                  onClick={() => void router.push("/settings/identities")}
                  className="px-4 py-2 text-xs font-mono font-bold uppercase border border-warning text-warning rounded hover:bg-warning/10 transition-colors whitespace-nowrap"
                >
                  {t("profile.verifyBanner.cta")} &rarr;
                </button>
              </div>
            )}

            {/* ---- Avatar picker ---- */}
            <section className="border border-border rounded clip-corner bg-surface/40 p-5 space-y-4">
              <div className="text-xs font-mono uppercase tracking-widest text-subtle">{t("profile.avatar.label")}</div>

              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarUrl}
                  alt="avatar"
                  className="h-20 w-20 rounded-full border-2 border-border object-cover"
                />
                <div className="space-y-2">
                  <div className="text-xs font-mono text-muted">{t("profile.avatar.choosePreset")}</div>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_AVATARS.map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => selectAvatar(url)}
                        className={[
                          "h-10 w-10 rounded-full border-2 overflow-hidden transition-all",
                          avatarUrl === url
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border hover:border-border-strong",
                        ].join(" ")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Custom URL */}
              <div>
                {!showAvatarInput ? (
                  <button
                    type="button"
                    onClick={() => setShowAvatarInput(true)}
                    className="text-xs font-mono text-primary hover:underline"
                  >
                    {t("profile.avatar.customUrl")}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={customAvatarUrl}
                      onChange={(e) => setCustomAvatarUrl(e.target.value)}
                      onBlur={applyCustomAvatar}
                      onKeyDown={(e) => { if (e.key === "Enter") applyCustomAvatar(); }}
                      placeholder={t("profile.avatar.urlPlaceholder")}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={applyCustomAvatar}
                      className="px-3 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
                    >
                      OK
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* ---- Form fields ---- */}
            <section className="border border-border rounded clip-corner bg-surface/40 p-5 space-y-5">

              {/* Display name */}
              <div>
                <label className="block text-xs font-mono text-subtle uppercase mb-1.5">{t("profile.fields.displayName")}</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                  placeholder={t("profile.fields.displayNamePlaceholder")}
                  className="w-full px-3 py-2.5 text-sm font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                />
              </div>

              {/* Bio */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-mono text-subtle uppercase">{t("profile.fields.bio")}</label>
                  <span className="text-xs font-mono text-subtle">{bio.length}/2000</span>
                </div>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 2000))}
                  placeholder={t("profile.fields.bioPlaceholder")}
                  rows={4}
                  className="w-full px-3 py-2.5 text-sm font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus:outline-none resize-none"
                />
              </div>

              {/* Location */}
              <div className="border border-border/50 rounded p-4 space-y-3">
                <div className="text-xs font-mono text-subtle uppercase tracking-wider flex items-center gap-2">
                  <span>&#128205;</span>
                  <span className="font-bold">location</span>
                  <span className="text-xs text-warning font-normal">important &mdash; helps agents find you</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-mono text-subtle mb-1">{t("profile.fields.city")}</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value.slice(0, 100))}
                      placeholder={t("profile.fields.cityPlaceholder")}
                      className="w-full px-3 py-2.5 text-sm font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-subtle mb-1">{t("profile.fields.stateRegion")}</label>
                    <input
                      type="text"
                      value={stateRegion}
                      onChange={(e) => setStateRegion(e.target.value.slice(0, 100))}
                      placeholder={t("profile.fields.stateRegionPlaceholder")}
                      className="w-full px-3 py-2.5 text-sm font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-subtle mb-1">{t("profile.fields.country")}</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder={t("profile.fields.countryPlaceholder")}
                      maxLength={2}
                      className="w-full px-3 py-2.5 text-sm font-mono bg-bg border border-border rounded text-text placeholder:text-subtle focus:border-primary focus:outline-none uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-4">
                {/* Available */}
                <div className="flex items-center justify-between border border-border/50 rounded p-4">
                  <div>
                    <div className="text-sm font-bold text-text">{t("profile.fields.available")}</div>
                    <div className="text-xs font-mono text-muted">{t("profile.fields.availableDesc")}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={available}
                    onClick={() => setAvailable(!available)}
                    className={[
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      available ? "bg-success" : "bg-border",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-block h-4 w-4 transform rounded-full bg-bg transition-transform",
                        available ? "translate-x-6" : "translate-x-1",
                      ].join(" ")}
                    />
                  </button>
                </div>

                {/* Show email */}
                <div className="flex items-center justify-between border border-border/50 rounded p-4">
                  <div>
                    <div className="text-sm font-bold text-text">{t("profile.fields.showEmail")}</div>
                    <div className="text-xs font-mono text-muted">{t("profile.fields.showEmailDesc")}</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showEmail}
                    onClick={() => setShowEmail(!showEmail)}
                    className={[
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      showEmail ? "bg-success" : "bg-border",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-block h-4 w-4 transform rounded-full bg-bg transition-transform",
                        showEmail ? "translate-x-6" : "translate-x-1",
                      ].join(" ")}
                    />
                  </button>
                </div>
              </div>
            </section>

            {/* ---- Save ---- */}
            <div className="border-t border-primary pt-4">
              <button
                type="button"
                onClick={onSave}
                disabled={saveState === "saving"}
                className="px-6 py-3 text-sm font-mono font-bold uppercase border border-primary bg-primary text-bg rounded hover:bg-text hover:border-text transition-colors disabled:opacity-50"
              >
                {saveState === "saving" ? t("profile.saving") : t("profile.save")}
              </button>
            </div>
          </div>
        )}
      </main>

      <Toast toasts={toasts} />
    </div>
  );
}
