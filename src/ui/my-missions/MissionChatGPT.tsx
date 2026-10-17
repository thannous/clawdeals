import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { probeOwnerSession } from "../auth/ownerSessionProbe";
import { randomUuid } from "../../webmcp/utils";
import type { OwnerMission } from "./missionClient";

type Connection = { connected: boolean; account: string | null; available: boolean; models: { id: string; name: string }[] };
type Analysis = { completed: boolean; text: string; model: string; listingCount: number };

export default function MissionChatGPT({ mission }: { mission: OwnerMission }) {
  const t = useTranslations("missionChatGPT");
  const router = useRouter();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const generation = useRef(0);

  const request = useCallback(async <T,>(action?: string): Promise<T> => {
    const owner = await probeOwnerSession({ fresh: true });
    if (owner.state !== "authenticated" || !owner.ownerId) throw new Error("OWNER_SESSION_CHANGED");
    const response = await fetch("/api/local/chatgpt", {
      method: action ? "POST" : "GET", credentials: "include", cache: "no-store", signal: AbortSignal.timeout(115000),
      headers: { "X-Expected-Owner-Id": owner.ownerId,
        ...(action ? { "Content-Type": "application/json", "Idempotency-Key": randomUuid() } : {}) },
      ...(action ? { body: JSON.stringify({ action, missionId: mission.watchlist_id, model, locale: router.locale }) } : {})
    });
    const body = await response.json();
    const after = await probeOwnerSession({ fresh: true });
    if (after.state !== "authenticated" || after.ownerId !== owner.ownerId) throw new Error("OWNER_SESSION_CHANGED");
    if (!response.ok) throw new Error(body.error?.code || "CHATGPT_UNAVAILABLE");
    return body;
  }, [mission.watchlist_id, model, router.locale]);

  // A model choice changes the request callback, but must not re-fetch the account.
  const requestRef = useRef(request);
  useEffect(() => { requestRef.current = request; }, [request]);
  const loadConnection = useCallback(async () => {
    const current = ++generation.current;
    try {
      const state = await requestRef.current<Connection>();
      if (current !== generation.current) return;
      setConnection(state); setModel(state.models[0]?.id || "");
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : "CHATGPT_UNAVAILABLE");
    } finally { if (current === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { void loadConnection(); return () => { generation.current += 1; }; }, [loadConnection]);
  const refresh = async () => {
    // The new connection generation also owns the idle state. A completed
    // disconnect cannot clear busy later through its previous generation.
    setLoading(true); setBusy(false); setError(null); setAnalysis(null); setConnection(null);
    await loadConnection();
  };

  const act = async (action: "connect" | "analyze" | "disconnect") => {
    const current = generation.current;
    setBusy(true); setError(null); setAnalysis(null);
    try {
      if (action === "connect") {
        const { redirect } = await request<{ redirect: string }>(action);
        const target = new URL(redirect);
        if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.pathname !== "/connect") throw new Error("CHATGPT_UNAVAILABLE");
        if (current === generation.current) window.location.assign(redirect);
      } else if (action === "analyze") {
        const result = await request<Analysis>(action);
        if (!result.completed || !result.text) throw new Error("INFERENCE_NOT_COMPLETED");
        if (current === generation.current) setAnalysis(result);
      } else { await request(action); if (current === generation.current) await refresh(); }
    } catch (e) {
      if (current === generation.current) {
        const code = e instanceof Error ? e.message : "CHATGPT_UNAVAILABLE";
        setError(code);
        if (code === "OWNER_SESSION_CHANGED") setConnection(null);
      }
    } finally { if (current === generation.current) setBusy(false); }
  };
  const quota = error?.includes("usage_limit");
  const errorKey = quota ? "quota" : error === "NO_MATCHES" ? "noMatches" : error === "MISSION_INACTIVE" ? "inactive"
    : error === "OWNER_SESSION_CHANGED" ? "sessionChanged" : error === "CHATGPT_BOUND_TO_OTHER_OWNER" ? "otherOwner" : "error";

  return <section aria-labelledby="mission-chatgpt-title" data-testid="mission-chatgpt" className="border border-border bg-surface p-4 sm:p-6 space-y-4">
    <div className="space-y-2">
      <h2 id="mission-chatgpt-title" className="font-semibold text-xl text-text">{t("title")}</h2>
      <p className="text-sm text-muted">{t("intro")}</p>
      <p className="text-xs text-muted">{t("usageHint")}</p>
    </div>
    {loading ? <p role="status" className="text-muted">{t("loading")}</p> : connection?.connected ? <>
      <p className="text-sm text-text" data-testid="chatgpt-connected">{t("connected", { account: connection.account || "ChatGPT" })}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-2 text-sm text-muted min-w-0 max-w-full">{t("model")}
          <select value={model} onChange={event => { setModel(event.target.value); setAnalysis(null); }} disabled={busy} className="bg-bg text-text border border-border p-2 max-w-full">
            {connection.models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <button onClick={() => void act("analyze")} disabled={busy || !model || mission.status !== "ACTIVE"} className="px-4 py-2 bg-primary text-bg disabled:opacity-50">{t(busy ? "analyzing" : "analyze")}</button>
        <button onClick={() => void act("disconnect")} disabled={busy} className="text-sm text-muted underline disabled:opacity-50">{t("disconnect")}</button>
      </div>
      {busy ? <p role="status" className="text-sm text-muted">{t("working")}</p> : null}
    </> : <button onClick={() => void act("connect")} disabled={busy || connection?.available === false} className="px-4 py-2 bg-primary text-bg disabled:opacity-50">{t("connect")}</button>}
    {connection?.available === false ? <p role="status" className="text-sm text-muted">{t("otherOwner")}</p> : null}
    {error ? <div role="alert" className="space-y-2 text-warning"><p>{t(errorKey)}</p><button disabled={busy} onClick={() => void refresh()} className="underline">{t("retry")}</button></div> : null}
    <a href="https://chatgpt.com/#settings/Usage" target="_blank" rel="noreferrer" className={`inline-block text-sm underline ${quota ? "text-primary font-semibold" : "text-muted"}`}>{t("manage")}</a>
    {analysis ? <div role="status" data-testid="chatgpt-analysis" className="border-t border-border pt-4 space-y-3">
      <h3 className="font-semibold text-text">{t("result", { count: analysis.listingCount })}</h3>
      <p className="whitespace-pre-wrap break-words text-sm text-text">{analysis.text}</p>
      <p className="text-xs text-muted">{t("reviewHint")}</p>
    </div> : null}
  </section>;
}
