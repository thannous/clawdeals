import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ChevronDown, Settings } from "lucide-react";

import { useTheme } from "../../../theme/theme-context";
import { getPublicLandingUrl } from "../../../shared/urls";
import ShareButton from "../../landing/ShareButton";
import { maskApiKey } from "../api";
import { useConnectSession } from "./useConnectSession";
import { useWizardState } from "./useWizardState";
import PageHeader from "../../shared/PageHeader";
import SettingsNav from "../../settings/SettingsNav";
import StepConnect from "./StepConnect";
import StepVerify from "./StepVerify";
import StepFirstWin from "./StepFirstWin";
import type { ConnectLocale, WizardStep } from "./types";

const LOCALES = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" }
] as const;

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return { open, setOpen, ref } as const;
}

function themeShortLabel(label: string) {
  return (label.split(" ")[0] || label).toUpperCase();
}

const STEPS: WizardStep[] = ["connect", "verify", "firstwin"];
const AUTO_VERIFY_UI_GUARD_MS = 12000;

function stepLabel(step: WizardStep, locale: ConnectLocale) {
  if (step === "connect") return locale === "fr" ? "Connexion" : "Connect";
  if (step === "verify") return locale === "fr" ? "Verifier" : "Verify";
  return locale === "fr" ? "Lancement" : "Go";
}

const START_SOURCE_LABELS = {
  gig: {
    bucket: "Agents",
    items: {
      "101": "Market Watch Agent",
      "102": "SEO Auditor Agent",
      "103": "Meeting Summarizer",
      "104": "Invoice OCR Core"
    }
  },
  npm: {
    bucket: "Skills",
    items: {
      "1": "AgentAuth SDK",
      "2": "Bounties Bridge",
      "3": "Activity Feed Adapter"
    }
  },
  data: {
    bucket: "Data",
    items: {
      "201": "Ops Playbooks (FR/EN)",
      "202": "Policy & Compliance Pack",
      "203": "Product Knowledge Base"
    }
  }
} as const;

function normalizeFromParam(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : null;
  return typeof value === "string" ? value : null;
}

function describeStartSource(fromParam: unknown, locale: ConnectLocale): string | null {
  const raw = normalizeFromParam(fromParam);
  if (!raw) return null;

  const match = /^explore-card-(gig|npm|data)-(\d+)$/.exec(raw);
  if (!match) {
    return locale === "fr"
      ? `Flux initialise via ${raw}.`
      : `Flow initialized from ${raw}.`;
  }

  const sourceType = match[1] as keyof typeof START_SOURCE_LABELS;
  const sourceId = match[2];
  const bucket = START_SOURCE_LABELS[sourceType];
  const itemTitle = bucket.items[sourceId as keyof typeof bucket.items];
  if (!itemTitle) {
    return locale === "fr"
      ? `Flux initialise depuis Explore > ${bucket.bucket}.`
      : `Flow initialized from Explore > ${bucket.bucket}.`;
  }

  return locale === "fr"
    ? `Flux initialise depuis Explore > ${bucket.bucket} > ${itemTitle}.`
    : `Flow initialized from Explore > ${bucket.bucket} > ${itemTitle}.`;
}

function StepIndicator({ currentStep, locale }: { currentStep: WizardStep; locale: ConnectLocale }) {
  const stepIndex = STEPS.findIndex((s) => s === currentStep);

  return (
    <div className="flex items-center gap-2" role="navigation" aria-label="Progress">
      {STEPS.map((step, i) => {
        const isCompleted = i < stepIndex;
        const isCurrent = i === stepIndex;

        return (
          <div key={step} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`w-8 h-px ${isCompleted ? "bg-secondary" : "bg-border"}`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${
                  isCompleted
                    ? "bg-secondary"
                    : isCurrent
                      ? "bg-primary"
                      : "bg-border"
                }`}
              />
              <span
                className={`text-xs font-mono font-bold uppercase tracking-widest ${
                  isCompleted
                    ? "text-secondary"
                    : isCurrent
                      ? "text-primary"
                      : "text-subtle"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {stepLabel(step, locale)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeaderLogo() {
  const router = useRouter();
  const localePrefix = router.locale === "fr" ? "/fr" : "";
  const landingBase = getPublicLandingUrl();
  const href = landingBase === "/" ? `${localePrefix}/` : `${landingBase}${localePrefix}/`;

  return (
    <Link href={href} className="flex items-center gap-2 sm:gap-3 min-w-0">
      <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-primary clip-corner-top-right flex items-center justify-center text-bg font-bold text-base sm:text-xl relative overflow-hidden">
        <div className="absolute inset-0 hazard-stripe opacity-20" />
        CD
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-base sm:text-xl font-bold tracking-tight text-text leading-none">CLAWDEALS</span>
        <span className="text-xs font-mono text-primary tracking-[0.2em] leading-none mt-1 hidden sm:block">
          MARKET_ACCESS_GRANTED
        </span>
      </div>
    </Link>
  );
}

function HeaderActions({ extraActions, locale }: { extraActions?: React.ReactNode; locale: ConnectLocale }) {
  const router = useRouter();
  const { themeId, setTheme, themes } = useTheme();
  const isFr = locale === "fr";
  const asPathNoLocale =
    (router.asPath || "/").replace(/^\/(fr|en)(?=\/|$)/, "") || "/";

  const { open: langOpen, setOpen: setLangOpen, ref: langRef } = useDropdown();
  const { open: themeOpen, setOpen: setThemeOpen, ref: themeRef } = useDropdown();
  const { open: mobileSettingsOpen, setOpen: setMobileSettingsOpen, ref: mobileSettingsRef } = useDropdown();
  const activeTheme = themes.find((t) => t.id === themeId);

  return (
    <>
      {/* Language dropdown — desktop */}
      <div ref={langRef} className="relative hidden sm:block">
        <button
          type="button"
          onClick={() => setLangOpen((p) => !p)}
          className="h-9 px-3 border border-border text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 text-secondary hover:border-border-strong transition-colors"
        >
          {(router.locale || "en").toUpperCase()}
          <ChevronDown className="w-3 h-3" />
        </button>
        {langOpen && (
          <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[100px]">
            {LOCALES.map((loc) => (
              <Link
                key={loc.code}
                href={asPathNoLocale}
                locale={loc.code}
                onClick={() => setLangOpen(false)}
                className={`block px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                  router.locale === loc.code
                    ? "text-secondary bg-secondary/10"
                    : "text-muted hover:text-text hover:bg-surface-alt"
                }`}
              >
                {loc.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Theme dropdown — desktop */}
      <div ref={themeRef} className="relative hidden sm:block">
        <button
          type="button"
          data-testid="theme-switch"
          onClick={() => setThemeOpen((p) => !p)}
          className="h-9 px-3 border border-border text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 text-text hover:border-border-strong transition-colors"
        >
          <span suppressHydrationWarning>
            {activeTheme ? themeShortLabel(activeTheme.label) : "THEME"}
          </span>
          <ChevronDown className="w-3 h-3" />
        </button>
        {themeOpen && (
          <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[160px]">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                className={`block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                  t.id === themeId
                    ? "text-secondary bg-secondary/10"
                    : "text-muted hover:text-text hover:bg-surface-alt"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Share button — desktop */}
      <div className="hidden sm:block">
        <ShareButton locale={router.locale || "en"} />
      </div>

      {/* Extra actions (KEY display + Forget) — desktop only */}
      {extraActions && <div className="hidden sm:flex items-center gap-2">{extraActions}</div>}

      {/* Mobile settings dropdown (language + theme) */}
      <div ref={mobileSettingsRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setMobileSettingsOpen((p) => !p)}
          className="h-9 w-9 border border-primary flex items-center justify-center text-primary hover:bg-primary/10 hover:border-primary transition-colors"
          aria-label={isFr ? "Parametres" : "Settings"}
        >
          <Settings className="w-4 h-4" />
        </button>
        {mobileSettingsOpen && (
          <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[160px]">
            <div className="px-3 py-2 text-[10px] font-mono text-subtle uppercase tracking-widest border-b border-border">
              {isFr ? "Langue" : "Language"}
            </div>
            {LOCALES.map((loc) => (
              <Link
                key={loc.code}
                href={asPathNoLocale}
                locale={loc.code}
                onClick={() => setMobileSettingsOpen(false)}
                className={`block px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                  router.locale === loc.code
                    ? "text-secondary bg-secondary/10"
                    : "text-muted hover:text-text hover:bg-surface-alt"
                }`}
              >
                {loc.label}
              </Link>
            ))}
            <div className="px-3 py-2 text-[10px] font-mono text-subtle uppercase tracking-widest border-b border-t border-border">
              Theme
            </div>
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTheme(t.id); setMobileSettingsOpen(false); }}
                className={`block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                  t.id === themeId
                    ? "text-secondary bg-secondary/10"
                    : "text-muted hover:text-text hover:bg-surface-alt"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Forget button — always visible on mobile too */}
      {extraActions && <div className="flex items-center gap-2 sm:hidden">{extraActions}</div>}
    </>
  );
}

export default function ConnectWizard() {
  const router = useRouter();
  const locale: ConnectLocale = router.locale === "fr" ? "fr" : "en";
  const isFr = locale === "fr";
  const startSourceHint = useMemo(() => describeStartSource(router.query?.from, locale), [router.query?.from, locale]);

  const {
    state,
    selectMethod,
    setApiKey,
    setClaimSession,
    setVerified,
    reset
  } = useWizardState();

  const {
    createSession,
    startPolling,
    stopPolling,
    exchangeForApiKey,
    resetSession,
    pollStatus,
    error: pollError,
    isCreating
  } = useConnectSession();

  const masked = useMemo(() => {
    if (!state.apiKey) return null;
    return maskApiKey(state.apiKey);
  }, [state.apiKey]);
  const [autoVerifyGuardExpired, setAutoVerifyGuardExpired] = useState(false);

  useEffect(() => {
    if (!state.autoVerifying) {
      return;
    }
    // Avoid synchronous setState in effects (eslint react-hooks/set-state-in-effect).
    // This resets a previous cycle where the guard expired.
    const reset = setTimeout(() => setAutoVerifyGuardExpired(false), 0);
    const timer = setTimeout(() => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[start.wizard] auto_verify_ui_guard_expired", { timeout_ms: AUTO_VERIFY_UI_GUARD_MS });
      }
      setAutoVerifyGuardExpired(true);
    }, AUTO_VERIFY_UI_GUARD_MS);
    return () => {
      clearTimeout(reset);
      clearTimeout(timer);
    };
  }, [state.autoVerifying]);

  const handleForget = useCallback(() => {
    stopPolling();
    resetSession();
    reset();
  }, [stopPolling, resetSession, reset]);

  const forgetButton = masked ? (
    <button
      onClick={handleForget}
      className="border border-border px-3 py-1 text-xs font-mono hover:border-border-strong hover:text-text transition-colors"
    >
      {isFr ? "Oublier" : "Forget"}
    </button>
  ) : null;

  const maskedKeyDisplay = masked ? (
    <span data-testid="api-key-masked" className="text-xs font-mono text-muted hidden sm:inline">
      KEY: {masked}
    </span>
  ) : null;

  const headerExtraActions = masked ? (
    <>
      {maskedKeyDisplay}
      {forgetButton}
    </>
  ) : null;

  const headerLeft = <HeaderLogo />;
  const headerActions = (
    <HeaderActions extraActions={headerExtraActions} locale={locale} />
  );

  const handleCreateSession = useCallback(async (agentName?: string) => {
    const session = await createSession(agentName);
    setClaimSession(session);
    startPolling(session);
    return session;
  }, [createSession, setClaimSession, startPolling]);

  const handleBack = useCallback(() => {
    stopPolling();
    resetSession();
    reset();
  }, [stopPolling, resetSession, reset]);

  // Loading state while auto-verifying
  if (state.autoVerifying && !autoVerifyGuardExpired) {
    return (
      <div className="min-h-screen bg-bg text-text">
        <PageHeader left={headerLeft} actions={headerActions} containerClassName="px-6 py-4">
          {state.hasOwnerSession ? <SettingsNav current="start" locale={locale} /> : null}
        </PageHeader>
        <main className="w-full px-6 py-6 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <span className="text-xs font-mono text-subtle">
              {isFr ? "Verification de la connexion existante..." : "Checking existing connection..."}
            </span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <PageHeader left={headerLeft} actions={headerActions} containerClassName="px-6 py-4">
        {state.hasOwnerSession ? <SettingsNav current="start" locale={locale} /> : null}
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-6 py-6 space-y-6">
        {state.autoVerifying && autoVerifyGuardExpired && (
          <div className="border border-warning/30 bg-warning/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-warning-muted uppercase">
              {isFr ? "Verification auto expiree" : "Auto-check timed out"}
            </div>
            <div className="text-xs font-mono text-muted mt-1">
              {isFr
                ? "Passage en mode manuel. Vous pouvez verifier a nouveau ou coller une cle API."
                : "Continuing in manual mode. You can verify again or paste an API key."}
            </div>
          </div>
        )}

        {startSourceHint && (
          <div className="border border-border bg-surface/70 rounded clip-corner p-3">
            <div className="text-xs font-mono text-subtle uppercase">
              {isFr ? "Contexte de depart" : "Start context"}
            </div>
            <div className="text-xs font-mono text-text mt-1">{startSourceHint}</div>
          </div>
        )}

        {/* Step indicator */}
        <StepIndicator currentStep={state.step} locale={locale} />

        {/* Step content */}
        {state.step === "connect" && (
          <StepConnect
            apiKey={state.apiKey}
            onMethodSelected={selectMethod}
            onApiKeySet={setApiKey}
            onClaimSessionCreated={setClaimSession}
            claimSession={state.claimSession}
            pollStatus={pollStatus}
            pollError={pollError}
            isCreatingSession={isCreating}
            onCreateSession={handleCreateSession}
            locale={locale}
          />
        )}

        {state.step === "verify" && state.method && (
          <StepVerify
            method={state.method}
            apiKey={state.apiKey}
            claimSession={state.claimSession}
            pollStatus={pollStatus}
            pollError={pollError}
            onVerified={setVerified}
            onApiKeySet={setApiKey}
            onExchangeForApiKey={exchangeForApiKey}
            onBack={handleBack}
            locale={locale}
          />
        )}

        {state.step === "firstwin" && (
          <StepFirstWin
            apiKey={state.apiKey}
            agentMe={state.agentMe}
            locale={locale}
          />
        )}
      </main>
    </div>
  );
}
