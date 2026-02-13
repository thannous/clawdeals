import { useCallback, useEffect, useMemo, useState } from "react";

import { maskApiKey } from "../api";
import { useConnectSession } from "./useConnectSession";
import { useWizardState } from "./useWizardState";
import PageHeader from "../../shared/PageHeader";
import SettingsNav from "../../settings/SettingsNav";
import StepConnect from "./StepConnect";
import StepVerify from "./StepVerify";
import StepFirstWin from "./StepFirstWin";
import type { WizardStep } from "./types";

const STEPS: { key: WizardStep; label: string }[] = [
  { key: "connect", label: "Connect" },
  { key: "verify", label: "Verify" },
  { key: "firstwin", label: "Go" }
];
const AUTO_VERIFY_UI_GUARD_MS = 12000;

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center gap-2" role="navigation" aria-label="Progress">
      {STEPS.map((step, i) => {
        const isCompleted = i < stepIndex;
        const isCurrent = i === stepIndex;

        return (
          <div key={step.key} className="flex items-center gap-2">
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
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ConnectWizard() {
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

  const headerActions = masked ? (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span data-testid="api-key-masked" className="text-muted">
        KEY: {masked}
      </span>
      <button
        onClick={handleForget}
        className="border border-border px-3 py-1 hover:border-border-strong hover:text-text transition-colors"
      >
        Forget
      </button>
    </div>
  ) : null;

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
        <PageHeader title="CONNECT" containerClassName="px-6 py-4">
          {state.hasOwnerSession ? <SettingsNav current="start" /> : null}
        </PageHeader>
        <main className="w-full px-6 py-6 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <span className="text-xs font-mono text-subtle">Checking existing connection...</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <PageHeader title="CONNECT" containerClassName="px-6 py-4" actions={headerActions}>
        {state.hasOwnerSession ? <SettingsNav current="start" /> : null}
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-6 py-6 space-y-6">
        {state.autoVerifying && autoVerifyGuardExpired && (
          <div className="border border-warning/30 bg-warning/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-warning-muted uppercase">Auto-check timed out</div>
            <div className="text-xs font-mono text-muted mt-1">
              Continuing in manual mode. You can verify again or paste an API key.
            </div>
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
          />
        )}

        {state.step === "firstwin" && (
          <StepFirstWin
            apiKey={state.apiKey}
            agentMe={state.agentMe}
          />
        )}
      </main>
    </div>
  );
}
