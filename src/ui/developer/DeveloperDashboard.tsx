import Link from "next/link";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { apiRequest, maskApiKey } from "./api";
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from "./storage";
import PageHeader from "../shared/PageHeader";
import AppNav from "../shared/AppNav";

const noopSubscribe = () => () => {};

export default function DeveloperDashboard() {
  const t = useTranslations("developer");
  const storedKey = useSyncExternalStore(noopSubscribe, getStoredApiKey, () => null);
  const [keyOverride, setKeyOverride] = useState<string | null | undefined>(undefined);
  const apiKey = keyOverride !== undefined ? keyOverride : storedKey;
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  const masked = useMemo(() => (apiKey ? maskApiKey(apiKey) : null), [apiKey]);

  const handleForget = useCallback(() => {
    clearStoredApiKey();
    setKeyOverride(null);
    setStatus("idle");
    setMessage("");
  }, []);

  const handleTest = useCallback(async () => {
    if (!apiKey) return;
    setStatus("loading");
    setMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey });
      setStatus("ok");
      setMessage(t("apiReachable"));
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || t("apiTestFailed"));
    }
  }, [apiKey, t]);

  const handlePaste = useCallback(() => {
    setShowPasteInput(true);
    setPasteValue("");
  }, []);

  const handlePasteSubmit = useCallback(async () => {
    const key = pasteValue.trim();
    if (!key) return;
    setStatus("loading");
    setMessage("");
    try {
      await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: key });
      setStoredApiKey(key);
      setKeyOverride(key);
      setStatus("ok");
      setMessage(t("keySaved"));
      setShowPasteInput(false);
      setPasteValue("");
    } catch (error: any) {
      setStatus("error");
      setMessage(error?.message || t("invalidKey"));
    }
  }, [pasteValue, t]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <PageHeader
        title={t("title")}
        actions={
          <span className="text-xs font-mono text-subtle">
            {masked ? <span data-testid="dev-key">{t("keyLabel")} {masked}</span> : <span>{t("noKey")}</span>}
          </span>
        }
      >
        <AppNav current="developer" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-10 space-y-8">
        <div className="border border-border bg-surface p-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="space-y-1">
              <div className="text-xs font-mono uppercase tracking-widest text-subtle">{t("session")}</div>
              <div className="text-sm text-muted font-mono">
                {apiKey ? t("apiKeyLoaded") : t("noKeyFound")}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePaste}
                className="border border-border px-3 py-2 text-xs font-bold uppercase tracking-widest hover:border-border-strong"
              >
                {t("pasteKey")}
              </button>
              <button
                onClick={handleForget}
                className="border border-border px-3 py-2 text-xs font-bold uppercase tracking-widest hover:border-border-strong"
                disabled={!apiKey}
              >
                {t("forget")}
              </button>
              <button
                onClick={handleTest}
                className="border border-primary px-3 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-bg"
                disabled={!apiKey || status === "loading"}
              >
                {status === "loading" ? t("testing") : t("testApi")}
              </button>
            </div>
          </div>
          {message && (
            <div
              className={`text-xs font-mono ${
                status === "error" ? "text-error" : status === "ok" ? "text-success" : "text-subtle"
              }`}
              aria-live="polite"
            >
              {message}
            </div>
          )}

          {showPasteInput && (
            <div className="flex gap-2 items-center">
              <input
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                placeholder={t("apiKeyPlaceholder")}
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="flex-1 h-10 px-3 bg-bg border border-border text-text font-mono text-xs focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                disabled={status === "loading"}
                onKeyDown={(e) => { if (e.key === "Enter") handlePasteSubmit(); }}
              />
              <button
                onClick={handlePasteSubmit}
                disabled={!pasteValue.trim() || status === "loading"}
                className={`h-10 px-4 text-xs font-bold uppercase tracking-widest border border-primary ${
                  !pasteValue.trim() || status === "loading"
                    ? "bg-surface-alt text-subtle cursor-not-allowed"
                    : "bg-primary text-bg hover:bg-text hover:text-bg"
                } transition-colors`}
              >
                {status === "loading" ? "..." : t("save")}
              </button>
              <button
                onClick={() => { setShowPasteInput(false); setPasteValue(""); }}
                className="h-10 px-3 text-xs font-bold uppercase tracking-widest border border-border hover:border-border-strong transition-colors"
              >
                {t("cancel")}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/start"
            className="border border-border bg-bg p-5 hover:border-border-strong transition-colors"
          >
            <div className="text-xs font-mono uppercase tracking-widest text-subtle">01</div>
            <div className="mt-2 font-bold tracking-wide">{t("card01Title")}</div>
            <div className="mt-2 text-xs font-mono text-muted">{t("card01Desc")}</div>
          </Link>
          <Link
            href="/developer/watchlists/new"
            className={`border border-border bg-bg p-5 transition-colors ${
              apiKey ? "hover:border-border-strong" : "opacity-60 pointer-events-none"
            }`}
          >
            <div className="text-xs font-mono uppercase tracking-widest text-subtle">02</div>
            <div className="mt-2 font-bold tracking-wide">{t("card02Title")}</div>
            <div className="mt-2 text-xs font-mono text-muted">{t("card02Desc")}</div>
          </Link>
          <Link
            href="/developer/events"
            className={`border border-border bg-bg p-5 transition-colors ${
              apiKey ? "hover:border-border-strong" : "opacity-60 pointer-events-none"
            }`}
          >
            <div className="text-xs font-mono uppercase tracking-widest text-subtle">03</div>
            <div className="mt-2 font-bold tracking-wide">{t("card03Title")}</div>
            <div className="mt-2 text-xs font-mono text-muted">{t("card03Desc")}</div>
          </Link>
        </div>
      </main>
    </div>
  );
}
