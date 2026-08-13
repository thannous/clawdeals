import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { ChevronDown, Settings, Terminal } from "lucide-react";

import { useTheme } from "../../../theme/theme-context";
import { getPublicLandingUrl } from "../../../shared/urls";
import { getLocaleLabels, localePrefixFor } from "../../../shared/seo";
import { stripLocalePrefix, type SupportedLocale } from "../../../shared/i18n";
import { ACQUISITION_QUERY_PARAM, normalizeAcquisitionId } from "../../../shared/acquisition";
import ShareButton from "../../landing/ShareButton";
import { maskApiKey } from "../api";
import { useConnectSession } from "./useConnectSession";
import { useWizardState } from "./useWizardState";
import PageHeader from "../../shared/PageHeader";
import SettingsNav from "../../settings/SettingsNav";
import AppNav from "../../shared/AppNav";
import StepConnect from "./StepConnect";
import StepVerify from "./StepVerify";
import StepFirstWin from "./StepFirstWin";
import type { WizardStep } from "./types";

const LOCALES = getLocaleLabels();

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

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const t = useTranslations("connect");
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
                {t(`wizard.step.${step}`)}
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
  const t = useTranslations("nav");
  const resolvedLocale: SupportedLocale = (router.locale === "fr" || router.locale === "es") ? router.locale : "en";
  const localePrefix = localePrefixFor(resolvedLocale);
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
          {t("marketAccessGranted")}
        </span>
      </div>
    </Link>
  );
}

function HeaderActions({
  extraActions,
  showLogin,
  loginHref
}: {
  extraActions?: React.ReactNode;
  showLogin?: boolean;
  loginHref: string;
}) {
  const router = useRouter();
  const t = useTranslations("connect");
  const { themeId, setTheme, themes } = useTheme();
  const asPathNoLocale = stripLocalePrefix(router.asPath || "/");

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
            {themes.map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => { setTheme(th.id); setThemeOpen(false); }}
                className={`block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                  th.id === themeId
                    ? "text-secondary bg-secondary/10"
                    : "text-muted hover:text-text hover:bg-surface-alt"
                }`}
              >
                {th.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Share button — desktop */}
      <div className="hidden sm:block">
        <ShareButton locale={router.locale || "en"} />
      </div>

      {/* Login button — desktop, shown when not logged in */}
      {showLogin && (
        <Link
          href={loginHref}
          className="hidden sm:flex h-9 px-4 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest items-center gap-2"
        >
          <Terminal className="w-4 h-4" />
          Login
        </Link>
      )}

      {/* Extra actions (KEY display + Forget) — desktop only */}
      {extraActions && <div className="hidden sm:flex items-center gap-2">{extraActions}</div>}

      {/* Mobile settings dropdown (language + theme) */}
      <div ref={mobileSettingsRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setMobileSettingsOpen((p) => !p)}
          className="h-9 w-9 border border-primary flex items-center justify-center text-primary hover:bg-primary/10 hover:border-primary transition-colors"
          aria-label={t("wizard.settings")}
        >
          <Settings className="w-4 h-4" />
        </button>
        {mobileSettingsOpen && (
          <div className="absolute right-0 top-full mt-2 bg-surface border border-border shadow-lg z-50 min-w-[160px]">
            <div className="px-3 py-2 text-[10px] font-mono text-subtle uppercase tracking-widest border-b border-border">
              {t("wizard.language")}
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
            {themes.map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => { setTheme(th.id); setMobileSettingsOpen(false); }}
                className={`block w-full text-left px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${
                  th.id === themeId
                    ? "text-secondary bg-secondary/10"
                    : "text-muted hover:text-text hover:bg-surface-alt"
                }`}
              >
                {th.label}
              </button>
            ))}
            {showLogin && (
              <>
                <div className="border-t border-border" />
                <Link
                  href={loginHref}
                  onClick={() => setMobileSettingsOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-mono uppercase tracking-widest text-primary hover:bg-primary/10 transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Login
                </Link>
              </>
            )}
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
  const t = useTranslations("connect");

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

  const masked = state.apiKey ? maskApiKey(state.apiKey) : null;

  // Compute start source hint using translation keys
  const startSourceHint = (() => {
    const raw = normalizeFromParam(router.query?.from);
    if (!raw) return null;

    const match = /^explore-card-(gig|npm|data)-(\d+)$/.exec(raw);
    if (!match) {
      return t("wizard.startSourceGeneric", { source: raw });
    }

    const sourceType = match[1] as keyof typeof START_SOURCE_LABELS;
    const sourceId = match[2];
    const bucket = START_SOURCE_LABELS[sourceType];
    const itemTitle = bucket.items[sourceId as keyof typeof bucket.items];
    if (!itemTitle) {
      return t("wizard.startSourceBucket", { bucket: bucket.bucket });
    }

    return t("wizard.startSourceItem", { bucket: bucket.bucket, item: itemTitle });
  })();

  const handleForget = useCallback(() => {
    stopPolling();
    resetSession();
    reset();
  }, [stopPolling, resetSession, reset]);

  const forgetButton = masked ? (
    <button
      onClick={handleForget}
      className="h-9 border border-border px-3 text-xs font-mono hover:border-border-strong hover:text-text transition-colors flex items-center"
    >
      {t("wizard.forget")}
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

  const acquisitionId = normalizeAcquisitionId(router.query?.[ACQUISITION_QUERY_PARAM]);
  const resolvedLocale: SupportedLocale = (router.locale === "fr" || router.locale === "es") ? router.locale : "en";
  const returnParams = new URLSearchParams();
  if (acquisitionId) returnParams.set(ACQUISITION_QUERY_PARAM, acquisitionId);
  const from = normalizeFromParam(router.query?.from);
  if (from) returnParams.set("from", from);
  const returnQuery = returnParams.toString();
  const returnPath = `${localePrefixFor(resolvedLocale)}/start${returnQuery ? `?${returnQuery}` : ""}`;
  const loginHref = `/auth/login?next=${encodeURIComponent(returnPath)}`;
  const signupHref = `${loginHref}&mode=signup`;

  const headerLeft = <HeaderLogo />;
  const headerActions = (
    <HeaderActions
      extraActions={headerExtraActions}
      showLogin={!state.hasOwnerSession}
      loginHref={loginHref}
    />
  );

  const handleCreateSession = useCallback(async (agentName?: string) => {
    const session = await createSession(agentName, acquisitionId);
    setClaimSession(session);
    startPolling(session);
    return session;
  }, [acquisitionId, createSession, setClaimSession, startPolling]);

  const handleBack = useCallback(() => {
    stopPolling();
    resetSession();
    reset();
  }, [stopPolling, resetSession, reset]);

  // Loading state while auto-verifying
  if (state.autoVerifying) {
    return (
      <div className="min-h-screen bg-bg text-text">
        <PageHeader left={headerLeft} actions={headerActions} containerClassName="px-6 pt-4" hideLocale>
          {state.hasOwnerSession && <AppNav current="settings" />}
          {state.hasOwnerSession ? <SettingsNav current="start" /> : null}
        </PageHeader>
        <main className="w-full px-6 py-6 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <span className="text-xs font-mono text-subtle">
              {t("wizard.checkingConnection")}
            </span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <PageHeader left={headerLeft} actions={headerActions} containerClassName="px-6 pt-4" hideLocale>
        {state.hasOwnerSession && <AppNav current="settings" />}
        {state.hasOwnerSession ? <SettingsNav current="start" /> : null}
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-6 py-6 space-y-6">
        {startSourceHint && (
          <div className="border border-border bg-surface/70 rounded clip-corner p-3">
            <div className="text-xs font-mono text-subtle uppercase">
              {t("wizard.startContext")}
            </div>
            <div className="text-xs font-mono text-text mt-1">{startSourceHint}</div>
          </div>
        )}

        {/* Step indicator */}
        <StepIndicator currentStep={state.step} />

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
            hasOwnerSession={state.hasOwnerSession}
            acquisitionId={acquisitionId}
            loginHref={loginHref}
            signupHref={signupHref}
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
            acquisitionId={acquisitionId}
          />
        )}

        {state.step === "firstwin" && (
          <StepFirstWin
            apiKey={state.apiKey}
            agentMe={state.agentMe}
            hasOwnerSession={state.hasOwnerSession}
          />
        )}
      </main>
    </div>
  );
}
