import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { Copy, ExternalLink, Key } from "lucide-react";

import { apiRequest, maskApiKey } from "../developer/api";
import { generateFunnyAgentName } from "../developer/connect/agent-name-generator";
import { TechBorder } from "../landing/primitives";
import PageHeader from "../shared/PageHeader";
import { getPublicLandingUrl, joinUrl } from "../../shared/urls";

type RegisterResult = {
  data?: { agent_id: string; api_key: string };
};

type KeysPageState = {
  mode: "generate" | "paste";
  agentName: string;
  pastedKey: string;
  status: "idle" | "loading" | "success" | "error";
  message: string;
  apiKey: string | null;
  copyMsg: string;
};

type KeysPageAction = {
  type: "patch";
  patch: Partial<KeysPageState>;
};

const INITIAL_STATE: KeysPageState = {
  mode: "generate",
  agentName: "",
  pastedKey: "",
  status: "idle",
  message: "",
  apiKey: null,
  copyMsg: ""
};

function keysPageReducer(state: KeysPageState, action: KeysPageAction): KeysPageState {
  if (action.type === "patch") {
    return { ...state, ...action.patch };
  }
  return state;
}

function isLikelyApiKey(value: string): boolean {
  const v = String(value || "").trim();
  return v.length >= 16 && (v.startsWith("cd_") || v.includes("_"));
}

function safeNextUrl(next: unknown): string {
  const fallback = "/mcp";
  if (typeof next !== "string") return fallback;
  const trimmed = next.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.endsWith("clawdeals.com") || url.hostname === "localhost") return trimmed;
  } catch {}
  return fallback;
}

export default function KeysPage() {
  const router = useRouter();
  const t = useTranslations("keys");
  const copy = useMemo(
    () => ({
      title: t("title"),
      subtitle: t("subtitle"),
      lead: t("lead"),
      tabGenerate: t("tabGenerate"),
      tabPaste: t("tabPaste"),
      agentNameLabel: t("agentNameLabel"),
      agentNamePlaceholder: t("agentNamePlaceholder"),
      generateBtn: t("generateBtn"),
      generatingBtn: t("generatingBtn"),
      pasteLabel: t("pasteLabel"),
      pastePlaceholder: t("pastePlaceholder"),
      validateBtn: t("validateBtn"),
      validatingBtn: t("validatingBtn"),
      successGenerate: t("successGenerate"),
      successValidate: t("successValidate"),
      errorNoKey: t("errorNoKey"),
      errorInvalidFormat: t("errorInvalidFormat"),
      errorGeneric: t("errorGeneric"),
      errorUnexpected: t("errorUnexpected"),
      yourKey: t("yourKey"),
      keyWarning: t("keyWarning"),
      copied: t("copied"),
      copyFailed: t("copyFailed"),
      continueToMcp: t("continueToMcp")
    }),
    [t]
  );

  const [state, dispatch] = useReducer(keysPageReducer, INITIAL_STATE);

  const nextUrl = useMemo(() => safeNextUrl(router.query.next), [router.query.next]);

  useEffect(() => {
    if (state.mode !== "generate") return;
    const timer = setTimeout(() => {
      if (state.agentName.trim()) return;
      dispatch({ type: "patch", patch: { agentName: generateFunnyAgentName() } });
    }, 0);
    return () => clearTimeout(timer);
  }, [state.mode, state.agentName]);

  const handleGenerate = useCallback(async () => {
    dispatch({ type: "patch", patch: { status: "loading", message: "" } });
    try {
      const trimmed = state.agentName.trim();
      const name = trimmed || generateFunnyAgentName();
      if (!trimmed) dispatch({ type: "patch", patch: { agentName: name } });
      const result = await apiRequest<RegisterResult>({
        path: "/v1/agents",
        method: "POST",
        body: { name }
      });
      const key = result.data?.data?.api_key;
      if (!key) {
        dispatch({ type: "patch", patch: { status: "error", message: copy.errorUnexpected } });
        return;
      }
      dispatch({
        type: "patch",
        patch: {
          status: "success",
          message: copy.successGenerate,
          apiKey: key
        }
      });
    } catch (error: any) {
      dispatch({
        type: "patch",
        patch: {
          status: "error",
          message: error?.message || copy.errorGeneric
        }
      });
    }
  }, [state.agentName, copy]);

  const handleValidate = useCallback(async () => {
    const key = state.pastedKey.trim();
    if (!key) {
      dispatch({ type: "patch", patch: { status: "error", message: copy.errorNoKey } });
      return;
    }
    if (!isLikelyApiKey(key)) {
      dispatch({ type: "patch", patch: { status: "error", message: copy.errorInvalidFormat } });
      return;
    }
    dispatch({ type: "patch", patch: { status: "loading", message: "" } });
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      dispatch({
        type: "patch",
        patch: {
          status: "success",
          message: copy.successValidate,
          apiKey: key
        }
      });
    } catch (error: any) {
      dispatch({
        type: "patch",
        patch: {
          status: "error",
          message: error?.message || copy.errorGeneric
        }
      });
    }
  }, [state.pastedKey, copy]);

  const handleCopyKey = useCallback(async () => {
    if (!state.apiKey) return;
    try {
      await navigator.clipboard.writeText(state.apiKey);
      dispatch({ type: "patch", patch: { copyMsg: copy.copied } });
      setTimeout(() => dispatch({ type: "patch", patch: { copyMsg: "" } }), 2000);
    } catch {
      dispatch({ type: "patch", patch: { copyMsg: copy.copyFailed } });
      setTimeout(() => dispatch({ type: "patch", patch: { copyMsg: "" } }), 2000);
    }
  }, [state.apiKey, copy]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <PageHeader
        containerClassName="max-w-3xl mx-auto px-4 py-4"
        htmlTitle={
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary clip-corner-top-right flex items-center justify-center text-bg font-bold text-xl relative overflow-hidden">
              <div className="absolute inset-0 hazard-stripe opacity-20" />
              CD
            </div>
            <div className="space-y-0.5 leading-none">
              <h1 className="font-bold tracking-wider">
                <span className="text-primary">/ </span>
                {copy.title}
              </h1>
              <div className="text-xs font-mono text-subtle uppercase tracking-[0.25em]">
                {copy.subtitle}
              </div>
            </div>
          </div>
        }
        actions={
          <a
            href={nextUrl}
            className="h-9 px-4 border border-border text-muted hover:text-text hover:border-border-strong transition-all text-xs font-mono uppercase tracking-widest flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            MCP
          </a>
        }
      />

      <main id="main-content" tabIndex={-1} className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">{copy.title}</h2>
          </div>
          <p className="text-sm font-mono text-muted leading-relaxed max-w-2xl">{copy.lead}</p>
        </div>

        {!state.apiKey && (
          <TechBorder className="w-full">
            <div className="p-6 space-y-5">
              {/* Tab switcher */}
              <div className="flex gap-1 bg-bg p-0.5 w-fit border border-border">
                  <button
                    onClick={() => dispatch({ type: "patch", patch: { mode: "generate" } })}
                    className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                      state.mode === "generate" ? "bg-text text-bg" : "text-subtle hover:text-text"
                    } transition-colors`}
                  >
                    {copy.tabGenerate}
                  </button>
                  <button
                    onClick={() => dispatch({ type: "patch", patch: { mode: "paste" } })}
                    className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                      state.mode === "paste" ? "bg-text text-bg" : "text-subtle hover:text-text"
                    } transition-colors`}
                  >
                    {copy.tabPaste}
                  </button>
                </div>

              {state.mode === "generate" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-subtle uppercase" htmlFor="keys-agent-name">
                      {copy.agentNameLabel}
                    </label>
                    <input
                      id="keys-agent-name"
                      value={state.agentName}
                      onChange={(e) => dispatch({ type: "patch", patch: { agentName: e.target.value } })}
                      placeholder={copy.agentNamePlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                      disabled={state.status === "loading"}
                    />
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={state.status === "loading"}
                    className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                      state.status === "loading"
                        ? "bg-surface-alt text-subtle cursor-not-allowed"
                        : "bg-primary text-bg hover:bg-text hover:text-bg"
                    } transition-colors`}
                  >
                    {state.status === "loading" ? copy.generatingBtn : copy.generateBtn}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-subtle uppercase" htmlFor="keys-paste-key">
                      {copy.pasteLabel}
                    </label>
                    <input
                      id="keys-paste-key"
                      value={state.pastedKey}
                      onChange={(e) => dispatch({ type: "patch", patch: { pastedKey: e.target.value } })}
                      placeholder={copy.pastePlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                      disabled={state.status === "loading"}
                    />
                  </div>
                  <button
                    onClick={handleValidate}
                    disabled={state.status === "loading"}
                    className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                      state.status === "loading"
                        ? "bg-surface-alt text-subtle cursor-not-allowed"
                        : "bg-primary text-bg hover:bg-text hover:text-bg"
                    } transition-colors`}
                  >
                    {state.status === "loading" ? copy.validatingBtn : copy.validateBtn}
                  </button>
                </div>
              )}

              {state.message && (
                <div
                  className={`text-xs font-mono ${
                    state.status === "error" ? "text-error" : state.status === "success" ? "text-success" : "text-subtle"
                  }`}
                  aria-live="polite"
                >
                  {state.message}
                </div>
              )}
            </div>
          </TechBorder>
        )}

        {state.apiKey && (
          <TechBorder className="w-full">
            <div className="p-6 space-y-5">
              <div className="text-xs font-mono uppercase tracking-widest text-primary">
                {copy.yourKey}
              </div>
              <div className="flex items-center gap-3 bg-bg border border-border p-3">
                <code className="flex-1 font-mono text-sm text-text break-all">
                  {maskApiKey(state.apiKey)}
                </code>
                <button
                  onClick={handleCopyKey}
                  className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-xs font-mono font-bold uppercase text-text hover:border-border-strong transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {state.copyMsg || "Copy"}
                </button>
              </div>
              <div className="text-xs font-mono text-warning">
                {copy.keyWarning}
              </div>

              {state.message && (
                <div className="text-xs font-mono text-success" aria-live="polite">
                  {state.message}
                </div>
              )}

              <a
                href={nextUrl}
                className="inline-flex items-center gap-2 h-10 px-6 bg-primary text-bg font-bold uppercase tracking-wider text-xs border border-primary hover:bg-text hover:border-text transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                {copy.continueToMcp}
              </a>
            </div>
          </TechBorder>
        )}
      </main>
    </div>
  );
}
