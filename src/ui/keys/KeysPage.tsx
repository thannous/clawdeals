import { useCallback, useEffect, useMemo, useState } from "react";
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

  const [mode, setMode] = useState<"generate" | "paste">("generate");
  const [agentName, setAgentName] = useState("");
  const [pastedKey, setPastedKey] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");

  const nextUrl = useMemo(() => safeNextUrl(router.query.next), [router.query.next]);

  useEffect(() => {
    if (mode !== "generate") return;
    const timer = setTimeout(() => {
      setAgentName((prev) => (prev.trim() ? prev : generateFunnyAgentName()));
    }, 0);
    return () => clearTimeout(timer);
  }, [mode]);

  const handleGenerate = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    try {
      const trimmed = agentName.trim();
      const name = trimmed || generateFunnyAgentName();
      if (!trimmed) setAgentName(name);
      const result = await apiRequest<RegisterResult>({
        path: "/v1/agents",
        method: "POST",
        body: { name }
      });
      const key = result.data?.data?.api_key;
      if (!key) {
        setStatus("error");
        setMessage(copy.errorUnexpected);
        return;
      }
      setStatus("success");
      setMessage(copy.successGenerate);
      setApiKey(key);
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || copy.errorGeneric);
    }
  }, [agentName, copy]);

  const handleValidate = useCallback(async () => {
    const key = pastedKey.trim();
    if (!key) {
      setStatus("error");
      setMessage(copy.errorNoKey);
      return;
    }
    if (!isLikelyApiKey(key)) {
      setStatus("error");
      setMessage(copy.errorInvalidFormat);
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      setStatus("success");
      setMessage(copy.successValidate);
      setApiKey(key);
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || copy.errorGeneric);
    }
  }, [pastedKey, copy]);

  const handleCopyKey = useCallback(async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopyMsg(copy.copied);
      setTimeout(() => setCopyMsg(""), 2000);
    } catch {
      setCopyMsg(copy.copyFailed);
      setTimeout(() => setCopyMsg(""), 2000);
    }
  }, [apiKey, copy]);

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

        {!apiKey && (
          <TechBorder className="w-full">
            <div className="p-6 space-y-5">
              {/* Tab switcher */}
              <div className="flex gap-1 bg-bg p-0.5 w-fit border border-border">
                <button
                  onClick={() => setMode("generate")}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                    mode === "generate" ? "bg-text text-bg" : "text-subtle hover:text-text"
                  } transition-colors`}
                >
                  {copy.tabGenerate}
                </button>
                <button
                  onClick={() => setMode("paste")}
                  className={`px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                    mode === "paste" ? "bg-text text-bg" : "text-subtle hover:text-text"
                  } transition-colors`}
                >
                  {copy.tabPaste}
                </button>
              </div>

              {mode === "generate" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-mono text-subtle uppercase" htmlFor="keys-agent-name">
                      {copy.agentNameLabel}
                    </label>
                    <input
                      id="keys-agent-name"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder={copy.agentNamePlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                      disabled={status === "loading"}
                    />
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={status === "loading"}
                    className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                      status === "loading"
                        ? "bg-surface-alt text-subtle cursor-not-allowed"
                        : "bg-primary text-bg hover:bg-text hover:text-bg"
                    } transition-colors`}
                  >
                    {status === "loading" ? copy.generatingBtn : copy.generateBtn}
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
                      value={pastedKey}
                      onChange={(e) => setPastedKey(e.target.value)}
                      placeholder={copy.pastePlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-full h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                      disabled={status === "loading"}
                    />
                  </div>
                  <button
                    onClick={handleValidate}
                    disabled={status === "loading"}
                    className={`w-full h-10 font-bold uppercase tracking-wider text-xs border border-primary ${
                      status === "loading"
                        ? "bg-surface-alt text-subtle cursor-not-allowed"
                        : "bg-primary text-bg hover:bg-text hover:text-bg"
                    } transition-colors`}
                  >
                    {status === "loading" ? copy.validatingBtn : copy.validateBtn}
                  </button>
                </div>
              )}

              {message && (
                <div
                  className={`text-xs font-mono ${
                    status === "error" ? "text-error" : status === "success" ? "text-success" : "text-subtle"
                  }`}
                  aria-live="polite"
                >
                  {message}
                </div>
              )}
            </div>
          </TechBorder>
        )}

        {apiKey && (
          <TechBorder className="w-full">
            <div className="p-6 space-y-5">
              <div className="text-xs font-mono uppercase tracking-widest text-primary">
                {copy.yourKey}
              </div>
              <div className="flex items-center gap-3 bg-bg border border-border p-3">
                <code className="flex-1 font-mono text-sm text-text break-all">
                  {maskApiKey(apiKey)}
                </code>
                <button
                  onClick={handleCopyKey}
                  className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-xs font-mono font-bold uppercase text-text hover:border-border-strong transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copyMsg || "Copy"}
                </button>
              </div>
              <div className="text-xs font-mono text-warning">
                {copy.keyWarning}
              </div>

              {message && (
                <div className="text-xs font-mono text-success" aria-live="polite">
                  {message}
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
