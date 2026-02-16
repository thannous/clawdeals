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
  const completionCount = [nameComplete, locationComplete, emailVerified].filter(Boolean).length;

  return (
    <div data-testid="profile-page" className="min-h-screen bg-bg">
      <PageHeader title={t("profile.title")} containerClassName="px-6 pt-4">
        <AppNav current="settings" />
        <SettingsNav current="profile" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full max-w-3xl px-6 py-8">

        {/* ─── Loading ─── */}
        {!authRequired && state === "loading" && (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="relative h-14 w-14">
              <div className="absolute inset-0 rounded-full border border-primary/15" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
              <div className="absolute inset-2 rounded-full border border-dashed border-primary/20 animate-spin-slow" />
            </div>
            <span className="text-[11px] font-mono text-subtle tracking-[0.3em] uppercase">
              Loading profile&hellip;
            </span>
          </div>
        )}

        {/* ─── Error ─── */}
        {!authRequired && state === "error" && (
          <div className="border border-error/30 bg-error/5 rounded p-8 text-center">
            <div className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-error/30 bg-error/10 text-error text-lg mb-3">
              !
            </div>
            <div className="text-sm font-mono font-semibold text-error">{t("profile.loadError")}</div>
          </div>
        )}

        {/* ─── Profile loaded ─── */}
        {!authRequired && state === "done" && profile && (
          <div className="space-y-0">

            {/* ═══════════════════════════════════════════════
                SECTION 1 — IDENTITY CARD
                ═══════════════════════════════════════════════ */}
            <section className="profile-reveal relative border border-border rounded-t-lg overflow-hidden bg-surface/50">
              {/* Ambient grid */}
              <div className="absolute inset-0 tech-grid opacity-30 pointer-events-none" />
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent" />

              <div className="relative p-6">
                {/* Section header */}
                <div className="flex items-center gap-2.5 mb-6">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-primary font-bold">
                    {t("profile.avatar.label")}
                  </span>
                  <div className="flex-1 h-px bg-linear-to-r from-primary/25 to-transparent" />
                  {/* Completion mini-indicator */}
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-end gap-[3px]">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={`w-[3px] rounded-[1px] transition-all duration-500 ${
                            i < completionCount ? "bg-primary" : "bg-border/50"
                          }`}
                          style={{ height: `${(i + 1) * 4 + 4}px` }}
                        />
                      ))}
                    </div>
                    <span className="text-[9px] font-mono text-subtle tabular-nums">
                      {completionCount}/3
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-6">
                  {/* ── Avatar column ── */}
                  <div className="flex flex-col items-center gap-4 shrink-0">
                    {/* Avatar with orbital ring */}
                    <div className="relative">
                      <div className="absolute -inset-2 rounded-full border border-dashed border-primary/20 animate-spin-slow" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarUrl}
                        alt="avatar"
                        className="relative z-10 h-24 w-24 rounded-full border-2 border-primary/30 object-cover avatar-glow"
                      />
                      {/* Online/offline status pip */}
                      <div
                        className={`absolute bottom-0.5 right-0.5 z-20 h-4 w-4 rounded-full border-[2.5px] border-surface transition-colors duration-300 ${
                          available ? "bg-success" : "bg-border"
                        }`}
                      />
                    </div>

                    {/* Preset grid */}
                    <div className="flex gap-1.5">
                      {PRESET_AVATARS.map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => selectAvatar(url)}
                          className={[
                            "h-8 w-8 rounded-full border overflow-hidden transition-all duration-200",
                            avatarUrl === url
                              ? "border-primary ring-1 ring-primary/30 scale-110"
                              : "border-border/50 opacity-50 hover:opacity-100 hover:border-primary/30",
                          ].join(" ")}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>

                    {/* Custom avatar URL */}
                    {!showAvatarInput ? (
                      <button
                        type="button"
                        onClick={() => setShowAvatarInput(true)}
                        className="text-[10px] font-mono text-subtle hover:text-primary transition-colors tracking-wider uppercase group"
                      >
                        {t("profile.avatar.customUrl")}{" "}
                        <span className="inline-block transition-transform group-hover:translate-x-0.5">&rarr;</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 w-full max-w-[280px]">
                        <input
                          type="url"
                          value={customAvatarUrl}
                          onChange={(e) => setCustomAvatarUrl(e.target.value)}
                          onBlur={applyCustomAvatar}
                          onKeyDown={(e) => { if (e.key === "Enter") applyCustomAvatar(); }}
                          placeholder={t("profile.avatar.urlPlaceholder")}
                          className="flex-1 px-2 py-1.5 text-[10px] font-mono bg-bg/80 border border-border rounded text-text placeholder:text-subtle focus:border-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={applyCustomAvatar}
                          className="px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase border border-primary/50 text-primary rounded hover:bg-primary/10 transition-colors"
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Name + Bio column ── */}
                  <div className="flex-1 space-y-4">
                    {/* Display name */}
                    <div>
                      <label className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-mono text-subtle uppercase tracking-widest">
                          {t("profile.fields.displayName")}
                        </span>
                        {nameComplete && <span className="text-[8px] text-success">&#9632;</span>}
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                        placeholder={t("profile.fields.displayNamePlaceholder")}
                        className="w-full px-3 py-2.5 text-sm font-mono bg-bg/60 border-l-2 border-l-primary/30 border border-border rounded-r text-text placeholder:text-subtle focus:border-primary focus:border-l-primary focus:outline-none transition-colors"
                      />
                    </div>

                    {/* Bio */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-mono text-subtle uppercase tracking-widest">
                          {t("profile.fields.bio")}
                        </label>
                        <span className="text-[10px] font-mono text-subtle tabular-nums">
                          {bio.length}
                          <span className="text-border">/2000</span>
                        </span>
                      </div>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value.slice(0, 2000))}
                        placeholder={t("profile.fields.bioPlaceholder")}
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm font-mono bg-bg/60 border-l-2 border-l-primary/30 border border-border rounded-r text-text placeholder:text-subtle focus:border-primary focus:border-l-primary focus:outline-none resize-none transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ═══════════════════════════════════════════════
                SECTION 2 — CLEARANCE LEVEL (completion)
                ═══════════════════════════════════════════════ */}
            {!allComplete && (
              <section
                className="profile-reveal border-x border-b border-border bg-surface/25"
                style={{ animationDelay: "0.06s" }}
              >
                <div className="px-6 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary font-bold">
                      {t("profile.completeBanner.heading")}
                    </span>
                    <div className="flex-1 h-px bg-border/40" />
                  </div>
                  <p className="text-[11px] font-mono text-muted mb-3">{t("profile.completeBanner.subtitle")}</p>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { done: nameComplete, label: t("profile.completeBanner.nameAdded") },
                      { done: locationComplete, label: t("profile.completeBanner.locationAdded") },
                      { done: emailVerified, label: t("profile.completeBanner.emailVerified") },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1.5 rounded-full border transition-all duration-300 ${
                          item.done
                            ? "border-success/25 bg-success/5 text-success/80"
                            : "border-border/40 bg-bg/30 text-muted"
                        }`}
                      >
                        <span className="text-[10px]">{item.done ? "\u2713" : "\u25CB"}</span>
                        <span className={item.done ? "line-through opacity-60" : ""}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* ═══════════════════════════════════════════════
                SECTION 2b — VERIFY EMAIL CTA
                ═══════════════════════════════════════════════ */}
            {!emailVerified && (
              <section
                className="profile-reveal border-x border-b border-border bg-warning/3"
                style={{ animationDelay: "0.1s" }}
              >
                <div className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-warning/10 border border-warning/20 flex items-center justify-center text-warning font-bold text-sm">
                      !
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-warning">{t("profile.verifyBanner.heading")}</h3>
                      <p className="text-[11px] font-mono text-muted mt-0.5">{t("profile.verifyBanner.subtitle")}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => void router.push("/settings/identities")}
                    className="px-4 py-2 text-[11px] font-mono font-bold uppercase border border-warning/30 text-warning rounded hover:bg-warning/10 hover:border-warning/60 transition-all whitespace-nowrap group"
                  >
                    {t("profile.verifyBanner.cta")}{" "}
                    <span className="inline-block transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </button>
                </div>
              </section>
            )}

            {/* ═══════════════════════════════════════════════
                SECTION 3 — GEO COORDINATES
                ═══════════════════════════════════════════════ */}
            <section
              className="profile-reveal border-x border-b border-border bg-surface/25"
              style={{ animationDelay: "0.14s" }}
            >
              <div className="px-6 py-5">
                {/* Section header */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-primary text-sm">&#128205;</span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary font-bold">
                    location
                  </span>
                  <div className="flex-1 h-px bg-linear-to-r from-primary/20 to-transparent" />
                  <span className="text-[9px] font-mono text-warning uppercase tracking-wider">
                    important &mdash; helps agents find you
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-subtle uppercase tracking-wider mb-1.5">
                      {t("profile.fields.city")}
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value.slice(0, 100))}
                      placeholder={t("profile.fields.cityPlaceholder")}
                      className="w-full px-3 py-2.5 text-sm font-mono bg-bg/60 border-l-2 border-l-primary/30 border border-border rounded-r text-text placeholder:text-subtle focus:border-primary focus:border-l-primary focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-subtle uppercase tracking-wider mb-1.5">
                      {t("profile.fields.stateRegion")}
                    </label>
                    <input
                      type="text"
                      value={stateRegion}
                      onChange={(e) => setStateRegion(e.target.value.slice(0, 100))}
                      placeholder={t("profile.fields.stateRegionPlaceholder")}
                      className="w-full px-3 py-2.5 text-sm font-mono bg-bg/60 border-l-2 border-l-primary/30 border border-border rounded-r text-text placeholder:text-subtle focus:border-primary focus:border-l-primary focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-subtle uppercase tracking-wider mb-1.5">
                      {t("profile.fields.country")}
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder={t("profile.fields.countryPlaceholder")}
                      maxLength={2}
                      className="w-full px-3 py-2.5 text-sm font-mono bg-bg/60 border-l-2 border-l-primary/30 border border-border rounded-r text-text placeholder:text-subtle focus:border-primary focus:border-l-primary focus:outline-none uppercase transition-colors"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ═══════════════════════════════════════════════
                SECTION 4 — SYSTEM FLAGS
                ═══════════════════════════════════════════════ */}
            <section
              className="profile-reveal border-x border-b border-border bg-surface/25"
              style={{ animationDelay: "0.18s" }}
            >
              <div className="px-6 py-5">
                <div className="flex items-center gap-2 mb-5">
                  <span className="h-1.5 w-1.5 rounded-sm bg-secondary/50" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-secondary/70 font-bold">
                    system flags
                  </span>
                  <div className="flex-1 h-px bg-linear-to-r from-secondary/15 to-transparent" />
                </div>

                {/* Available toggle */}
                <div className="flex items-center py-3 border-b border-border/25">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-text">{t("profile.fields.available")}</div>
                    <div className="text-[11px] font-mono text-muted mt-0.5">{t("profile.fields.availableDesc")}</div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 ml-4">
                    <span
                      className={`text-[9px] font-mono uppercase tracking-wider transition-colors duration-300 ${
                        available ? "text-success" : "text-subtle"
                      }`}
                    >
                      {available ? "ON" : "OFF"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={available}
                      onClick={() => setAvailable(!available)}
                      className={[
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300",
                        available
                          ? "bg-success/15 ring-1 ring-success/30"
                          : "bg-border/30 ring-1 ring-border/60",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-block h-4 w-4 transform rounded-full transition-all duration-300",
                          available
                            ? "translate-x-6 bg-success shadow-[0_0_8px_rgba(74,222,128,0.4)]"
                            : "translate-x-1 bg-subtle",
                        ].join(" ")}
                      />
                    </button>
                  </div>
                </div>

                {/* Show email toggle */}
                <div className="flex items-center py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-text">{t("profile.fields.showEmail")}</div>
                    <div className="text-[11px] font-mono text-muted mt-0.5">{t("profile.fields.showEmailDesc")}</div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0 ml-4">
                    <span
                      className={`text-[9px] font-mono uppercase tracking-wider transition-colors duration-300 ${
                        showEmail ? "text-success" : "text-subtle"
                      }`}
                    >
                      {showEmail ? "ON" : "OFF"}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showEmail}
                      onClick={() => setShowEmail(!showEmail)}
                      className={[
                        "relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300",
                        showEmail
                          ? "bg-success/15 ring-1 ring-success/30"
                          : "bg-border/30 ring-1 ring-border/60",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "inline-block h-4 w-4 transform rounded-full transition-all duration-300",
                          showEmail
                            ? "translate-x-6 bg-success shadow-[0_0_8px_rgba(74,222,128,0.4)]"
                            : "translate-x-1 bg-subtle",
                        ].join(" ")}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* ═══════════════════════════════════════════════
                SECTION 5 — DEPLOY
                ═══════════════════════════════════════════════ */}
            <section
              className="profile-reveal border-x border-b border-border rounded-b-lg bg-surface/15 overflow-hidden"
              style={{ animationDelay: "0.22s" }}
            >
              <div className="px-6 py-5">
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saveState === "saving"}
                  className="profile-save-sweep w-full sm:w-auto px-8 py-3 text-sm font-mono font-bold uppercase tracking-widest border-2 border-primary bg-primary/10 text-primary rounded hover:bg-primary hover:text-bg transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none group"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {saveState === "saving" ? (
                      <>
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                        {t("profile.saving")}
                      </>
                    ) : (
                      <>
                        <span className="transition-transform group-hover:translate-x-0.5">&#9654;</span>
                        {t("profile.save")}
                      </>
                    )}
                  </span>
                </button>
              </div>
            </section>

          </div>
        )}
      </main>

      <Toast toasts={toasts} />
    </div>
  );
}
