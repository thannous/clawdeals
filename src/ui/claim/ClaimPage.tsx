import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import ClaimStatusBadge from "./ClaimStatusBadge";
import { claimSession, denySession, fetchClaimSession } from "./api";
import { extractClaimTokenFromPath, resolveSupportedLocale, stripLocalePrefix } from "../../shared/i18n";
import { getLocaleLabels } from "../../shared/seo";
import type { ClaimLocale, ClaimMode, ConnectSessionClaimView } from "./types";

type ClaimCopy = {
  subtitle: string;
  missingTokenTitle: string;
  missingTokenBody: string;
  loading: string;
  loadSessionFailed: string;
  errorTitle: string;
  ownerSignInRequired: string;
  ownerSignInBody: string;
  ownerLogin: string;
  client: string;
  expires: string;
  requestedPermissions: string;
  none: string;
  notClaimable: (status: string) => string;
  alreadyApproved: string;
  chooseAgent: string;
  create: string;
  attach: string;
  ownerLimitReached: (limit: string) => string;
  ownerLimitReachedAttachHint: string;
  ownerLimitReachedWrongOwnerHint: string;
  newAgentName: string;
  requestedAgentDefault: string;
  existingAgent: string;
  existingAgentId: string;
  agentOwnerHint: string;
  successTitle: string;
  signedInAs: string;
  approving: string;
  approveAndConnect: string;
  refuse: string;
  denyConfirm: string;
  denyFailed: string;
  selectAttachAgent: string;
  claimFailed: string;
  signInRequiredToApprove: string;
  footerWarning: string;
  in: (rel: string) => string;
  expiredAgo: (rel: string) => string;
  requestedAgent: string;
  agentInitiatedHint: string;
  connectionApproved: string;
  manageAgents: string;
};

type ClaimT = (key: string, values?: Record<string, string | number>) => string;

function buildCopy(t: ClaimT): ClaimCopy {
  return {
    subtitle: t("subtitle"),
    missingTokenTitle: t("missingTokenTitle"),
    missingTokenBody: t("missingTokenBody"),
    loading: t("loading"),
    loadSessionFailed: t("loadSessionFailed"),
    errorTitle: t("errorTitle"),
    ownerSignInRequired: t("ownerSignInRequired"),
    ownerSignInBody: t("ownerSignInBody"),
    ownerLogin: t("ownerLogin"),
    client: t("client"),
    expires: t("expires"),
    requestedPermissions: t("requestedPermissions"),
    none: t("none"),
    notClaimable: (status) => t("notClaimable", { status }),
    alreadyApproved: t("alreadyApproved"),
    chooseAgent: t("chooseAgent"),
    create: t("create"),
    attach: t("attach"),
    ownerLimitReached: (limit) => t("ownerLimitReached", { limit }),
    ownerLimitReachedAttachHint: t("ownerLimitReachedAttachHint"),
    ownerLimitReachedWrongOwnerHint: t("ownerLimitReachedWrongOwnerHint"),
    newAgentName: t("newAgentName"),
    requestedAgentDefault: t("requestedAgentDefault"),
    existingAgent: t("existingAgent"),
    existingAgentId: t("existingAgentId"),
    agentOwnerHint: t("agentOwnerHint"),
    successTitle: t("successTitle"),
    signedInAs: t("signedInAs"),
    approving: t("approving"),
    approveAndConnect: t("approveAndConnect"),
    refuse: t("refuse"),
    denyConfirm: t("denyConfirm"),
    denyFailed: t("denyFailed"),
    selectAttachAgent: t("selectAttachAgent"),
    claimFailed: t("claimFailed"),
    signInRequiredToApprove: t("signInRequiredToApprove"),
    footerWarning: t("footerWarning"),
    in: (rel) => t("in", { rel }),
    expiredAgo: (rel) => t("expiredAgo", { rel }),
    requestedAgent: t("requestedAgent"),
    agentInitiatedHint: t("agentInitiatedHint"),
    connectionApproved: t("connectionApproved"),
    manageAgents: t("manageAgents")
  };
}

const AGENT_INITIATED_CLIENT_TYPES = new Set([
  "cursor",
  "claude-desktop",
  "claude-code",
  "codex",
  "windsurf",
  "gemini",
  "openclaw"
]);

function describeScope(scope: string, t: ClaimT) {
  const normalized = String(scope || "").trim();
  if (normalized === "agent:read") return t("scope.agentRead");
  if (normalized === "agent:write") return t("scope.agentWrite");
  if (normalized === "approvals:read") return t("scope.approvalsRead");
  if (normalized === "approvals:write") return t("scope.approvalsWrite");
  if (normalized === "installations:read") return t("scope.installationsRead");
  return t("scope.fallback");
}

function normalizeClaimError(rawError: string, options: { ownerAgentsCount: number; copy: ClaimCopy }) {
  const message = String(rawError || options.copy.claimFailed);
  if (/owner agent limit reached/i.test(message)) {
    if (options.ownerAgentsCount > 0) return options.copy.ownerLimitReachedAttachHint;
    return options.copy.ownerLimitReachedWrongOwnerHint;
  }
  if (/owner authentication required/i.test(message) || /unauthorized/i.test(message)) {
    return options.copy.signInRequiredToApprove;
  }
  return message;
}

function formatExpires(expiresAt: string | null, copy: ClaimCopy) {
  if (!expiresAt) return { label: "\u2014", isExpired: false };

  const dt = new Date(expiresAt);
  if (Number.isNaN(dt.getTime())) return { label: String(expiresAt), isExpired: false };

  const now = Date.now();
  const deltaMs = dt.getTime() - now;
  const isExpired = deltaMs <= 0;
  const abs = Math.abs(deltaMs);

  const seconds = Math.floor(abs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  let rel = "";
  if (hours > 0) rel = `${hours}h ${minutes % 60}m`;
  else if (minutes > 0) rel = `${minutes}m ${seconds % 60}s`;
  else rel = `${seconds}s`;

  return { label: isExpired ? copy.expiredAgo(rel) : copy.in(rel), isExpired };
}

function subscribeToNothing() {
  return () => {};
}

export default function ClaimPage({ claimToken }: { claimToken: string }) {
  const router = useRouter();
  const locale = resolveSupportedLocale(router.locale) as ClaimLocale;
  const tClaim = useTranslations("claim");
  const copy = useMemo(() => buildCopy(tClaim), [tClaim]);
  const pathToken = useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (typeof window === "undefined") return "";
      return extractClaimTokenFromPath(window.location.pathname || "");
    },
    () => ""
  );
  const asPathNoLocale = useMemo(() => stripLocalePrefix(router.asPath || "/"), [router.asPath]);
  const token = useMemo(() => {
    const fromProp = String(claimToken || "").trim();
    if (fromProp) return fromProp;
    return String(pathToken || "").trim();
  }, [claimToken, pathToken]);
  const localeSwitchHref = useMemo(
    () => (token ? `/claim/${encodeURIComponent(token)}` : asPathNoLocale),
    [token, asPathNoLocale]
  );

  const [session, setSession] = useState<ConnectSessionClaimView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ClaimMode>("create_agent");
  const [agentName, setAgentName] = useState("");
  const [attachAgentId, setAttachAgentId] = useState("");

  const [submitState, setSubmitState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);

  const feedbackRef = useRef<HTMLDivElement>(null);

  const fetchState: "idle" | "loading" | "done" | "error" = !token
    ? "idle"
    : error
      ? "error"
      : session
        ? "done"
        : "loading";

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    fetchClaimSession(token).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error || copy.loadSessionFailed);
        return;
      }
      setError(null);
      setSession(res.data);
      setAgentName(String(res.data.requested_agent_name || "").trim());
      const ownerAgents = Array.isArray(res.data.owner_agents) ? res.data.owner_agents : [];
      const defaultMode = res.data.default_mode === "attach_agent" ? "attach_agent" : "create_agent";
      const firstActive = ownerAgents.find((a: any) => a.status === "active");
      const firstAgentId = (firstActive || ownerAgents[0])?.agent_id;
      setMode(defaultMode);
      setAttachAgentId(firstAgentId ? String(firstAgentId) : "");
    });

    return () => {
      cancelled = true;
    };
  }, [token, copy.loadSessionFailed]);

  const [expiresTick, setExpiresTick] = useState(0);
  useEffect(() => {
    if (!session?.expires_at) return;
    const id = setInterval(() => setExpiresTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [session?.expires_at]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- expiresTick drives the re-render
  const expires = useMemo(() => formatExpires(session?.expires_at || null, copy), [session?.expires_at, copy, expiresTick]);
  const ownerAgents = useMemo(
    () => (Array.isArray(session?.owner_agents) ? session.owner_agents : []),
    [session]
  );
  const fallbackAttachAgentId = useMemo(() => {
    const firstActive = ownerAgents.find((a) => a.status === "active");
    const fallback = firstActive || ownerAgents[0];
    return fallback?.agent_id ? String(fallback.agent_id) : "";
  }, [ownerAgents]);
  const resolvedAttachAgentId = useMemo(() => {
    const selected = String(attachAgentId || "").trim();
    if (!selected) return fallbackAttachAgentId;
    const stillAvailable = ownerAgents.some((agent) => String(agent?.agent_id) === selected);
    return stillAvailable ? selected : fallbackAttachAgentId;
  }, [attachAgentId, fallbackAttachAgentId, ownerAgents]);
  const ownerContextAvailable = Boolean(session?.owner_context_available);

  useEffect(() => {
    if (!ownerContextAvailable) return;
    let cancelled = false;
    fetch("/api/v1/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        const email = body?.data?.email || body?.email || null;
        if (email) setOwnerEmail(String(email));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ownerContextAvailable]);
  const allowCreateAgent = session?.allow_create_agent !== false;
  const showCreateMode = !ownerContextAvailable || allowCreateAgent;
  const isPendingClaim = session?.status === "PENDING_CLAIM";
  const isClaimFinalized = session?.status === "CLAIMED" || session?.status === "DELIVERED";
  const isAgentInitiatedClaim = useMemo(() => {
    const normalizedClientType = String(session?.client_type || "").trim().toLowerCase();
    if (!normalizedClientType) return false;
    return AGENT_INITIATED_CLIENT_TYPES.has(normalizedClientType);
  }, [session?.client_type]);

  const actionable = Boolean(session && session.status === "PENDING_CLAIM" && !expires.isExpired && ownerContextAvailable);
  const canSubmitClaim = actionable && (mode !== "attach_agent" || Boolean(resolvedAttachAgentId));

  const clearSubmitFeedback = useCallback(() => {
    if (submitState !== "idle") setSubmitState("idle");
    if (submitError) setSubmitError(null);
    if (result) setResult(null);
  }, [submitState, submitError, result]);

  const switchMode = useCallback((nextMode: ClaimMode) => {
    setMode(nextMode);
    clearSubmitFeedback();
  }, [clearSubmitFeedback]);

  const onClaim = useCallback(async () => {
    if (!session) return;
    if (submitState === "loading") return;
    if (mode === "attach_agent" && !resolvedAttachAgentId) {
      setSubmitError(copy.selectAttachAgent);
      setSubmitState("error");
      return;
    }

    setSubmitState("loading");
    setSubmitError(null);
    setResult(null);

    const resp = await claimSession({
      sessionId: session.session_id,
      claimToken: token,
      mode,
      agentName: mode === "create_agent" ? agentName : undefined,
      attachAgentId: mode === "attach_agent" ? resolvedAttachAgentId : undefined
    });

    if (!resp.ok) {
      const rawError = resp.error || copy.claimFailed;
      if (/owner agent limit reached/i.test(rawError) && ownerAgents.length > 0) {
        setMode("attach_agent");
      }
      setSubmitError(normalizeClaimError(rawError, { ownerAgentsCount: ownerAgents.length, copy }));
      setSubmitState("error");
      queueMicrotask(() => feedbackRef.current?.focus());
      return;
    }

    setResult(resp.data || null);
    setSession((prev) =>
      prev
        ? {
            ...prev,
            status: resp.data?.status || prev.status,
            owner_id: resp.data?.owner_id || prev.owner_id,
            agent_id: resp.data?.agent_id || prev.agent_id,
            claimed_at: resp.data?.claimed_at || prev.claimed_at
          }
        : prev
    );
    setSubmitState("done");
    queueMicrotask(() => feedbackRef.current?.focus());
  }, [session, submitState, mode, resolvedAttachAgentId, token, agentName, copy, ownerAgents.length]);

  const onDeny = useCallback(async () => {
    if (!session) return;
    if (submitState === "loading") return;
    const confirmed = window.confirm(copy.denyConfirm);
    if (!confirmed) return;

    setSubmitState("loading");
    setSubmitError(null);
    setResult(null);

    const resp = await denySession({ sessionId: session.session_id, claimToken: token });
    if (!resp.ok) {
      setSubmitError(resp.error || copy.denyFailed);
      setSubmitState("error");
      queueMicrotask(() => feedbackRef.current?.focus());
      return;
    }

    setResult(resp.data || null);
    setSession((prev) =>
      prev
        ? {
            ...prev,
            status: resp.data?.status || "CANCELLED",
            cancelled_at: resp.data?.cancelled_at || prev.cancelled_at
          }
        : prev
    );
    setSubmitState("done");
    queueMicrotask(() => feedbackRef.current?.focus());
  }, [session, submitState, token, copy]);

  return (
    <div data-testid="claim-page" className="min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-60" />
      <div className="animate-scanline" />

      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-surface border border-border rounded clip-corner p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
                  <span className="text-primary">/ </span>CLAIM
                </h1>
                <p className="text-xs font-mono text-subtle">{copy.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                {getLocaleLabels().map((loc) => (
                  <Link
                    key={loc.code}
                    href={localeSwitchHref}
                    locale={loc.code}
                    className={`px-2 py-1 text-[10px] font-mono font-bold uppercase border rounded ${
                      locale === loc.code ? "border-primary text-primary bg-primary/10" : "border-border text-subtle hover:text-text"
                    }`}
                  >
                    {loc.label}
                  </Link>
                ))}
                {session?.status && (
                  <div data-testid="claim-status">
                    <ClaimStatusBadge status={session.status} locale={locale} />
                  </div>
                )}
              </div>
            </div>

            {!token && (
              <div className="border border-error/30 bg-error/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-error">{copy.missingTokenTitle}</div>
                <div className="text-xs font-mono text-muted mt-1">{copy.missingTokenBody}</div>
              </div>
            )}

            {fetchState === "loading" && (
              <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                <div className="text-xs font-mono text-subtle">{copy.loading}</div>
              </div>
            )}

            {error && (
              <div role="alert" aria-live="polite" className="border border-error/30 bg-error/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-error">{copy.errorTitle}</div>
                <div className="text-xs font-mono text-muted mt-1">{error}</div>
              </div>
            )}

            {session && (
              <div data-testid="claim-loaded" className="space-y-4">
                {!ownerContextAvailable && isPendingClaim && (
                  <div className="border border-warning/40 bg-warning/10 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-warning-muted uppercase">{copy.ownerSignInRequired}</div>
                    <div className="text-xs font-mono text-muted mt-1">{copy.ownerSignInBody}</div>
                    <Link
                      href={`/auth/login?next=${encodeURIComponent(`/claim/${token}`)}`}
                      locale={locale}
                      className="inline-block mt-2 px-3 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
                    >
                      {copy.ownerLogin}
                    </Link>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {session.requested_agent_name && (
                    <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                      <div className="text-xs font-mono text-subtle uppercase">{copy.requestedAgent}</div>
                      <div className="text-sm font-mono font-bold text-text mt-1">
                        {session.requested_agent_name}
                      </div>
                    </div>
                  )}
                  <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-subtle uppercase">{copy.client}</div>
                    <div className="text-xs font-mono text-text mt-1">
                      {session.client_type || "\u2014"}
                      {session.client_version ? <span className="text-muted"> v{session.client_version}</span> : null}
                    </div>
                  </div>
                  <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-subtle uppercase">{copy.expires}</div>
                    <div className="text-xs font-mono text-text mt-1">
                      {session.expires_at ? new Date(session.expires_at).toISOString() : "\u2014"}
                    </div>
                    <div className="text-xs font-mono text-muted mt-1">{expires.label}</div>
                  </div>
                </div>

                {isAgentInitiatedClaim && (
                  <div className="border border-secondary/20 bg-secondary/5 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-secondary">{copy.agentInitiatedHint}</div>
                  </div>
                )}

                <div className="border border-border bg-surface/40 rounded clip-corner p-3 space-y-2">
                  <div className="text-xs font-mono text-subtle uppercase">{copy.requestedPermissions}</div>
                  <div className="space-y-2" data-testid="claim-requested-scopes">
                    {(session.requested_scopes || []).length === 0 && (
                      <span className="text-xs font-mono text-muted">{copy.none}</span>
                    )}
                    {(session.requested_scopes || []).map((scope) => (
                      <div key={scope} className="border border-border rounded bg-surface/20 px-2 py-1 space-y-1">
                        <div className="text-xs font-mono font-bold uppercase text-subtle">{scope}</div>
                        <div className="text-xs font-mono text-muted">{describeScope(scope, tClaim)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {session.status !== "PENDING_CLAIM" && submitState !== "done" && (
                  <div className="border border-border bg-surface-alt/20 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-subtle">{copy.notClaimable(session.status)}</div>
                  </div>
                )}

                {isClaimFinalized && (
                  <div className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-secondary uppercase">{copy.alreadyApproved}</div>
                    <div className="text-xs font-mono text-muted mt-1">
                      status={String(session.status)} agent_id={String(session.agent_id || result?.agent_id || "\u2014")}
                    </div>
                  </div>
                )}

                {isPendingClaim && (
                  <>
                    <div className="border border-border rounded clip-corner p-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="text-xs font-mono text-subtle uppercase">{copy.chooseAgent}</div>
                        <div className="flex items-center gap-2">
                          {showCreateMode && (
                            <button
                              data-testid="claim-mode-create"
                              disabled={!actionable || submitState === "loading"}
                              onClick={() => switchMode("create_agent")}
                              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border rounded transition-colors disabled:opacity-50 ${
                                mode === "create_agent"
                                  ? "border-primary/40 text-primary bg-primary/10"
                                  : "border-border text-muted hover:border-border-strong hover:text-text"
                              }`}
                            >
                              {copy.create}
                            </button>
                          )}
                          <button
                            data-testid="claim-mode-attach"
                            disabled={!actionable || submitState === "loading"}
                            onClick={() => switchMode("attach_agent")}
                            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border rounded transition-colors disabled:opacity-50 ${
                              mode === "attach_agent"
                                ? "border-primary/40 text-primary bg-primary/10"
                                : "border-border text-muted hover:border-border-strong hover:text-text"
                            }`}
                          >
                            {copy.attach}
                          </button>
                        </div>
                      </div>
                      {ownerContextAvailable && !allowCreateAgent && (
                        <div data-testid="claim-agent-limit-note" className="border border-border bg-surface-alt/20 rounded clip-corner p-3">
                          <div className="text-xs font-mono text-subtle">{copy.ownerLimitReached(String(session.owner_agent_limit || 1))}</div>
                          <Link href="/settings/connected-apps" className="inline-block mt-2 text-xs font-mono font-bold uppercase text-primary hover:underline">
                            {copy.manageAgents}
                          </Link>
                        </div>
                      )}

                      {mode === "create_agent" && showCreateMode && (
                        <div>
                          <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="claim-agent-name">
                            {copy.newAgentName}
                          </label>
                          <input
                            id="claim-agent-name"
                            disabled={!actionable || submitState === "loading"}
                            value={agentName}
                            onChange={(e) => {
                              setAgentName(e.target.value);
                              clearSubmitFeedback();
                            }}
                            placeholder={session.requested_agent_name || "OpenClaw"}
                            name="agent_name"
                            autoComplete="off"
                            spellCheck={false}
                            className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors disabled:opacity-50"
                          />
                          <div className="text-xs font-mono text-muted mt-1">{copy.requestedAgentDefault}</div>
                        </div>
                      )}

                      {mode === "attach_agent" && (
                        <div>
                          {ownerContextAvailable && ownerAgents.length > 0 ? (
                            <>
                              <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="claim-attach-agent-select">
                                {copy.existingAgent}
                              </label>
                              <select
                                id="claim-attach-agent-select"
                                data-testid="claim-attach-agent-select"
                                disabled={!actionable || submitState === "loading"}
                                value={resolvedAttachAgentId}
                                onChange={(e) => {
                                  setAttachAgentId(e.target.value);
                                  clearSubmitFeedback();
                                }}
                                className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors disabled:opacity-50"
                              >
                                {ownerAgents.map((agent) => (
                                  <option key={agent.agent_id} value={agent.agent_id}>
                                    {agent.name || agent.agent_id} [{agent.status || "active"}]
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <>
                              <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="claim-attach-agent-id">
                                {copy.existingAgentId}
                              </label>
                              <input
                                id="claim-attach-agent-id"
                                data-testid="claim-attach-agent-id"
                                disabled={!actionable || submitState === "loading"}
                                value={resolvedAttachAgentId}
                                onChange={(e) => {
                                  setAttachAgentId(e.target.value);
                                  clearSubmitFeedback();
                                }}
                                placeholder="uuid"
                                name="attach_agent_id"
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors disabled:opacity-50"
                              />
                            </>
                          )}
                          <div className="text-xs font-mono text-muted mt-1">{copy.agentOwnerHint}</div>
                        </div>
                      )}
                    </div>

                    {submitError && (
                      <div
                        ref={feedbackRef}
                        tabIndex={-1}
                        role="alert"
                        aria-live="assertive"
                        className="border border-error/30 bg-error/5 rounded clip-corner p-3 focus:outline-none"
                      >
                        <div className="text-xs font-mono text-error">{copy.errorTitle}</div>
                        <div className="text-xs font-mono text-muted mt-1">{submitError}</div>
                      </div>
                    )}

                    {submitState === "done" && result && (
                      <div
                        ref={feedbackRef}
                        tabIndex={-1}
                        role="status"
                        aria-live="polite"
                        className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3 focus:outline-none"
                      >
                        <div className="text-xs font-mono text-secondary">{copy.connectionApproved}</div>
                      </div>
                    )}

                    {ownerEmail && (
                      <div className="text-xs font-mono text-subtle">
                        {copy.signedInAs} <span className="text-text">{ownerEmail}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        data-testid="claim-approve"
                        disabled={!canSubmitClaim || submitState === "loading"}
                        onClick={onClaim}
                        className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                      >
                        {submitState === "loading" ? copy.approving : copy.approveAndConnect}
                      </button>
                      <button
                        data-testid="claim-deny"
                        disabled={!actionable || submitState === "loading"}
                        onClick={onDeny}
                        className="px-4 py-2 text-xs font-mono font-bold uppercase border border-error/40 text-error rounded hover:bg-error/10 transition-colors disabled:opacity-50"
                      >
                        {copy.refuse}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="text-xs font-mono text-subtle">{copy.footerWarning}</div>
        </div>
      </div>
    </div>
  );
}
