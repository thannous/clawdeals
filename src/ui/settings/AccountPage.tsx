import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "../console/shared/ConfirmModal";
import Toast from "../console/shared/Toast";
import { useToast } from "../console/shared/useToast";
import SettingsNav from "./SettingsNav";
import PageHeader from "../shared/PageHeader";
import AppNav from "../shared/AppNav";

type OwnerSummary = {
  owner_id: string;
  email: string | null;
  email_verified_at: string | null;
};

type OwnerAgent = {
  agent_id: string;
  name: string | null;
  status: string | null;
  created_at: string | null;
  trust_score: number | null;
  suspended_at: string | null;
};

type OwnerClaim = {
  claim_id: string;
  source: "connect_link" | "device_code" | string;
  status: string | null;
  requested_agent_name: string | null;
  requested_scopes: string[];
  agent_id: string | null;
  created_at: string | null;
  decided_at: string | null;
};

type OwnerAgentActivity = {
  activity_id: string;
  ts: string | null;
  agent_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  outcome: string | null;
  request_id: string | null;
};

type RotateAllResponseData = {
  agent_id: string;
  rotated: boolean;
  api_key?: string;
  api_key_id?: string;
  previous_api_key_id?: string | null;
  grace_seconds?: number | null;
  revoked_installations_count: number;
  revoked_installation_ids: string[];
  rotated_at: string;
};

type RevokeAllResponseData = {
  agent_id: string;
  revoked_global_keys_count: number;
  revoked_global_api_key_ids: string[];
  revoked_installations_count: number;
  revoked_installation_ids: string[];
  revoked_at: string;
};

function getErrorMessage(body: any, status: number): string {
  return body?.error?.message || body?.message || `HTTP ${status}`;
}

function randomIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function formatActionError(body: any, status: number) {
  const base = getErrorMessage(body, status);
  const installationId = body?.error?.details?.installation_id;
  if (!installationId) return base;
  return `${base} (installation: ${installationId})`;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(dt);
}

function formatAgentName(agent: OwnerAgent, index: number): string {
  const raw = String(agent?.name || "").trim();
  if (raw) return raw;
  return `agent-${index + 1}`;
}

function activityOutcomeClass(outcome: string | null): string {
  const value = String(outcome || "").toUpperCase();
  if (value === "SUCCESS") return "border-success/30 text-success bg-success/8";
  if (value === "BLOCKED") return "border-warning/30 text-warning bg-warning/8";
  if (value === "FAILURE") return "border-error/30 text-error bg-error/8";
  return "border-border text-subtle bg-bg/40";
}

function formatActionLabel(action: string): string {
  const raw = String(action || "").trim();
  if (!raw) return "unknown.action";
  return raw;
}

function trustScoreColor(score: number | null): string {
  if (score === null || score === undefined) return "text-subtle";
  if (score >= 40) return "text-success";
  if (score >= 20) return "text-warning";
  return "text-error";
}

export default function AccountPage() {
  const router = useRouter();
  const { toasts, show } = useToast();
  const [owner, setOwner] = useState<OwnerSummary | null>(null);
  const [agents, setAgents] = useState<OwnerAgent[]>([]);
  const [claims, setClaims] = useState<OwnerClaim[]>([]);
  const [activities, setActivities] = useState<OwnerAgentActivity[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  const [actionState, setActionState] = useState<"idle" | "loading" | "error">("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [rotatedGlobalSecret, setRotatedGlobalSecret] = useState<RotateAllResponseData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchAccount = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState("loading");
    setError(null);
    setAuthRequired(false);

    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const [meResp, agentsResp, claimsResp, activitiesResp] = await Promise.all([
          fetch("/api/v1/auth/me", { signal: controller.signal }),
          fetch("/api/v1/owner/agents?limit=100", { signal: controller.signal }),
          fetch("/api/v1/owner/claims?limit=100", { signal: controller.signal }),
          fetch("/api/v1/owner/activity?limit=100", { signal: controller.signal })
        ]);

        const [meBody, agentsBody, claimsBody, activitiesBody] = await Promise.all([
          meResp.json().catch(() => ({})),
          agentsResp.json().catch(() => ({})),
          claimsResp.json().catch(() => ({})),
          activitiesResp.json().catch(() => ({}))
        ]);

        const hasUnauthorized =
          meResp.status === 401 ||
          agentsResp.status === 401 ||
          claimsResp.status === 401 ||
          activitiesResp.status === 401;

        if (hasUnauthorized && attempt === 0) {
          await sleep(180);
          continue;
        }

        if (hasUnauthorized) {
          setOwner(null);
          setAgents([]);
          setClaims([]);
          setActivities([]);
          setAuthRequired(true);
          setState("done");
          return;
        }

        if (!meResp.ok) throw new Error(getErrorMessage(meBody, meResp.status));
        if (!agentsResp.ok) throw new Error(getErrorMessage(agentsBody, agentsResp.status));
        if (!claimsResp.ok) throw new Error(getErrorMessage(claimsBody, claimsResp.status));
        if (!activitiesResp.ok) throw new Error(getErrorMessage(activitiesBody, activitiesResp.status));

        setOwner({
          owner_id: meBody?.data?.owner_id ? String(meBody.data.owner_id) : "",
          email: meBody?.data?.email ? String(meBody.data.email) : null,
          email_verified_at: meBody?.data?.email_verified_at ? String(meBody.data.email_verified_at) : null
        });

        setAgents(Array.isArray(agentsBody?.data?.agents) ? agentsBody.data.agents : []);
        setClaims(Array.isArray(claimsBody?.data?.claims) ? claimsBody.data.claims : []);
        setActivities(Array.isArray(activitiesBody?.data?.activities) ? activitiesBody.data.activities : []);
        setState("done");
        return;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setState("error");
      setAuthRequired(false);
      setError(String(err?.message || "Failed to load account"));
    }
  }, []);

  useEffect(() => {
    void fetchAccount();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchAccount]);

  useEffect(() => {
    if (!authRequired) return;
    const next = encodeURIComponent(router.asPath || "/settings/account");
    void router.replace(`/auth/login?next=${next}`);
  }, [authRequired, router]);

  useEffect(() => {
    if (agents.length === 0) {
      setSelectedAgentId("");
      return;
    }
    const selectedStillExists = agents.some((agent) => String(agent.agent_id) === selectedAgentId);
    if (!selectedAgentId || !selectedStillExists) {
      setSelectedAgentId(String(agents[0]?.agent_id || ""));
    }
  }, [agents, selectedAgentId]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => String(agent.agent_id) === selectedAgentId) || null,
    [agents, selectedAgentId]
  );

  const selectedAgentName = useMemo(() => {
    if (!selectedAgent) return "onboarding";
    const index = Math.max(0, agents.findIndex((agent) => String(agent.agent_id) === String(selectedAgent.agent_id)));
    return formatAgentName(selectedAgent, index);
  }, [agents, selectedAgent]);

  const filteredActivities = useMemo(() => {
    const rows = selectedAgentId
      ? activities.filter((activity) => String(activity.agent_id || "") === selectedAgentId)
      : activities;
    return [...rows].sort((a, b) => {
      const aTs = Date.parse(String(a.ts || "")) || 0;
      const bTs = Date.parse(String(b.ts || "")) || 0;
      return bTs - aTs;
    });
  }, [activities, selectedAgentId]);

  const pendingClaims = useMemo(
    () => claims.filter((claim) => String(claim.status || "").toUpperCase() === "PENDING").length,
    [claims]
  );

  const refetchAccount = useCallback(() => {
    void fetchAccount();
  }, [fetchAccount]);

  const closeRotateConfirm = useCallback(() => {
    if (actionState === "loading") return;
    setRotateConfirmOpen(false);
    setActionState("idle");
    setActionError(null);
  }, [actionState]);

  const closeRevokeConfirm = useCallback(() => {
    if (actionState === "loading") return;
    setRevokeConfirmOpen(false);
    setActionState("idle");
    setActionError(null);
  }, [actionState]);

  const closeRotatedGlobalSecret = useCallback(() => {
    setRotatedGlobalSecret(null);
  }, []);

  const copyRotatedGlobalSecret = useCallback(async () => {
    const secret = rotatedGlobalSecret?.api_key || "";
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      show("Global API key copied to clipboard", "success");
    } catch {
      show("Copy failed. Copy manually before closing.", "error");
    }
  }, [rotatedGlobalSecret, show]);

  const onRotateCredentials = useCallback(async () => {
    if (!selectedAgentId) return;
    if (actionState === "loading") return;
    setActionState("loading");
    setActionError(null);

    try {
      const resp = await fetch(`/api/v1/agents/${encodeURIComponent(selectedAgentId)}/keys:rotate-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": randomIdempotencyKey()
        },
        body: JSON.stringify({})
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(formatActionError(body, resp.status));
      }

      const data = body?.data as RotateAllResponseData | undefined;
      if (!data?.agent_id) {
        throw new Error("Rotate completed but response was invalid");
      }

      setActionState("idle");
      setRotateConfirmOpen(false);
      show(
        `Credentials rotated. Revoked ${Number(data.revoked_installations_count || 0)} installation(s).`,
        "success"
      );

      if (data.rotated && data.api_key) {
        setRotatedGlobalSecret(data);
      }
      refetchAccount();
    } catch (err: any) {
      const message = String(err?.message || "Rotate failed");
      setActionState("error");
      setActionError(message);
      show(message, "error");
    }
  }, [selectedAgentId, actionState, show, refetchAccount]);

  const onRevokeCredentials = useCallback(async () => {
    if (!selectedAgentId) return;
    if (actionState === "loading") return;
    setActionState("loading");
    setActionError(null);

    try {
      const resp = await fetch(`/api/v1/agents/${encodeURIComponent(selectedAgentId)}/keys:revoke-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": randomIdempotencyKey()
        },
        body: JSON.stringify({})
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(formatActionError(body, resp.status));
      }

      const data = body?.data as RevokeAllResponseData | undefined;
      if (!data?.agent_id) {
        throw new Error("Revoke completed but response was invalid");
      }

      setActionState("idle");
      setRevokeConfirmOpen(false);
      show(
        `Credentials revoked. Global keys: ${Number(data.revoked_global_keys_count || 0)}. Installations: ${Number(
          data.revoked_installations_count || 0
        )}.`,
        "success"
      );
      refetchAccount();
    } catch (err: any) {
      const message = String(err?.message || "Revoke failed");
      setActionState("error");
      setActionError(message);
      show(message, "error");
    }
  }, [selectedAgentId, actionState, show, refetchAccount]);

  return (
    <div data-testid="account-page" className="min-h-screen bg-bg">
      {/* ---- Header ---- */}
      <PageHeader title="MY ACCOUNT" containerClassName="px-6 py-4">
        <AppNav current="settings" />
        <SettingsNav current="account" />
      </PageHeader>

      {/* ---- Main ---- */}
      <main id="main-content" tabIndex={-1} className="w-full px-6 py-6">
        {/* Loading */}
        {!authRequired && state === "loading" && (
          <div data-testid="account-loading" className="flex items-center gap-3 py-12">
            <div className="h-4 w-4 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
            <span className="text-sm font-mono text-subtle">Loading account data...</span>
          </div>
        )}

        {/* Error */}
        {!authRequired && state === "error" && (
          <div data-testid="account-error" className="border border-error/30 bg-error/5 rounded clip-corner p-4">
            <div className="text-sm font-mono font-semibold text-error">Error</div>
            <div className="text-sm font-mono text-muted mt-1.5">{error || "Failed to load account"}</div>
          </div>
        )}

        {/* Loaded */}
        {!authRequired && state === "done" && (
          <div className="border border-border rounded-lg overflow-hidden bg-surface/40 min-h-[75vh]">
            <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] min-h-[75vh]">

              {/* ======= Sidebar ======= */}
              <aside className="border-r border-border/50 bg-surface/80 tech-grid">
                <div className="p-5 space-y-6">

                  {/* Owner card */}
                  <div data-testid="account-owner-card" className="rounded-lg border border-border bg-bg/60 p-4">
                    <div className="text-xs font-mono uppercase tracking-widest text-subtle mb-3">Workspace</div>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/15 border border-primary/25 text-primary text-sm font-mono font-bold flex items-center justify-center shrink-0">
                        {String(owner?.email || "OW").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text truncate">{owner?.email || "owner"}</div>
                        <div className="text-xs font-mono text-subtle truncate mt-0.5">{owner?.owner_id || "-"}</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-2">
                        {owner?.email_verified_at ? (
                          <>
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                            <span className="text-xs font-mono text-success">VERIFIED</span>
                            <span className="text-xs font-mono text-subtle ml-auto">{formatDate(owner.email_verified_at)}</span>
                          </>
                        ) : (
                          <>
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
                            <span className="text-xs font-mono text-warning">UNVERIFIED</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Channels */}
                  <section data-testid="account-agents">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono uppercase tracking-widest text-subtle">Channels</span>
                      <span className="text-xs font-mono font-bold text-muted bg-bg/60 border border-border rounded-full px-2.5 py-0.5">
                        {agents.length}
                      </span>
                    </div>
                    {agents.length === 0 ? (
                      <div className="text-sm font-mono text-muted leading-relaxed">
                        No agent channels.{" "}
                        <Link href="/start" className="text-primary hover:underline">
                          Connect your first app
                        </Link>
                        .
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {agents.map((agent, index) => {
                          const active = String(agent.agent_id) === selectedAgentId;
                          return (
                            <button
                              key={agent.agent_id}
                              onClick={() => setSelectedAgentId(String(agent.agent_id))}
                              className={[
                                "w-full text-left flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-all",
                                active
                                  ? "bg-primary/10 border border-primary/25 text-text"
                                  : "border border-transparent text-muted hover:bg-bg/60 hover:text-text hover:border-border/50"
                              ].join(" ")}
                            >
                              <span className="truncate text-sm font-medium">
                                <span className="text-primary/70 mr-1">#</span>
                                {formatAgentName(agent, index)}
                              </span>
                              <span className={`text-xs font-mono shrink-0 ${active ? trustScoreColor(agent.trust_score) : "opacity-60"}`}>
                                {typeof agent.trust_score === "number" ? agent.trust_score : "-"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Requests */}
                  <section data-testid="account-claims">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono uppercase tracking-widest text-subtle">Requests</span>
                      <span className={`text-xs font-mono font-bold rounded-full px-2.5 py-0.5 ${
                        pendingClaims > 0
                          ? "text-primary bg-primary/10 border border-primary/25"
                          : "text-muted bg-bg/60 border border-border"
                      }`}>
                        {pendingClaims}
                      </span>
                    </div>
                    {claims.length === 0 ? (
                      <div className="text-sm font-mono text-muted">No claim requests yet.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {claims.slice(0, 8).map((claim) => {
                          const isPending = String(claim.status || "").toUpperCase() === "PENDING";
                          return (
                            <div
                              key={claim.claim_id}
                              className={`rounded-lg border px-3 py-2.5 ${
                                isPending
                                  ? "border-primary/20 bg-primary/5"
                                  : "border-border/50 bg-bg/40"
                              }`}
                            >
                              <div className="text-sm text-text truncate">{claim.requested_agent_name || "Unnamed request"}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs font-mono font-bold uppercase ${isPending ? "text-primary" : "text-subtle"}`}>
                                  {String(claim.status || "unknown").toUpperCase()}
                                </span>
                                <span className="text-xs font-mono text-subtle">{formatDate(claim.created_at)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              </aside>

              {/* ======= Main panel ======= */}
              <section className="min-w-0 flex flex-col">

                {/* Agent header */}
                <header className="border-b border-border/50 px-6 py-5 bg-bg/40">
                  <div className="flex items-center gap-3">
                    <span className="text-primary/60 text-lg font-mono">#</span>
                    <h2 className="text-xl font-semibold tracking-tight text-text">{selectedAgentName}</h2>
                  </div>
                  <div className="mt-1.5 text-xs font-mono text-subtle truncate pl-8">
                    {selectedAgent ? selectedAgent.agent_id : "Select or create an agent channel to start."}
                  </div>
                </header>

                <div className="p-6 space-y-6 flex-1">
                  {/* Empty state */}
                  {agents.length === 0 && (
                    <div className="border border-border bg-surface/60 rounded-lg p-6">
                      <div className="text-base font-semibold text-text">No channels yet</div>
                      <p className="mt-2 text-sm font-mono text-muted leading-relaxed">
                        Create your first agent from the onboarding flow, then come back here.
                      </p>
                      <Link
                        href="/start"
                        className="inline-flex mt-4 px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
                      >
                        Open /start
                      </Link>
                    </div>
                  )}

                  {/* Selected agent details */}
                  {selectedAgent && (
                    <>
                      {/* Stat cards */}
                      <div className="grid sm:grid-cols-3 gap-4">
                        <div className="border border-border bg-surface/50 rounded-lg p-4 group hover:border-border-strong transition-colors">
                          <div className="text-xs font-mono uppercase tracking-wider text-subtle">Status</div>
                          <div className="mt-2 text-lg font-semibold text-text">
                            {selectedAgent.status || "-"}
                          </div>
                        </div>
                        <div className="border border-border bg-surface/50 rounded-lg p-4 group hover:border-border-strong transition-colors">
                          <div className="text-xs font-mono uppercase tracking-wider text-subtle">Trust score</div>
                          <div className={`mt-2 text-lg font-semibold font-mono ${trustScoreColor(selectedAgent.trust_score)}`}>
                            {typeof selectedAgent.trust_score === "number" ? String(selectedAgent.trust_score) : "-"}
                          </div>
                        </div>
                        <div className="border border-border bg-surface/50 rounded-lg p-4 group hover:border-border-strong transition-colors">
                          <div className="text-xs font-mono uppercase tracking-wider text-subtle">Created</div>
                          <div className="mt-2 text-sm font-semibold text-text">
                            {formatDate(selectedAgent.created_at)}
                          </div>
                        </div>
                      </div>

                      <section
                        data-testid="account-security-actions"
                        className="border border-warning/30 bg-warning/5 rounded-lg p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-xs font-mono uppercase tracking-wider text-warning">
                              Credentials Security
                            </div>
                            <div className="text-xs font-mono text-muted max-w-2xl leading-relaxed">
                              Rotate updates the global legacy key and revokes connected installations (reconnect
                              required). Revoke immediately cuts global and installation credentials.
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              data-testid="account-rotate-credentials"
                              onClick={() => {
                                setActionState("idle");
                                setActionError(null);
                                setRotateConfirmOpen(true);
                              }}
                              disabled={!selectedAgentId || actionState === "loading"}
                              className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-primary/40 text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                            >
                              Rotate credentials
                            </button>
                            <button
                              data-testid="account-revoke-credentials"
                              onClick={() => {
                                setActionState("idle");
                                setActionError(null);
                                setRevokeConfirmOpen(true);
                              }}
                              disabled={!selectedAgentId || actionState === "loading"}
                              className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-error/40 text-error rounded hover:bg-error/10 transition-colors disabled:opacity-50"
                            >
                              Revoke credentials
                            </button>
                          </div>
                        </div>
                      </section>

                      {/* Activity log */}
                      <div className="border border-border bg-surface/30 rounded-lg overflow-hidden">
                        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
                          <div className="text-xs font-mono uppercase tracking-wider text-subtle">Agent actions</div>
                          <span className="text-xs font-mono text-subtle">{filteredActivities.length} events</span>
                        </div>

                        {filteredActivities.length === 0 ? (
                          <div className="px-5 py-8 text-center">
                            <div className="text-sm font-mono text-subtle">No tracked actions for this channel yet.</div>
                          </div>
                        ) : (
                          <div className="divide-y divide-border/30">
                            {filteredActivities.map((activity) => (
                              <article
                                key={activity.activity_id}
                                className="px-5 py-3.5 hover:bg-bg/30 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-semibold text-text">{formatActionLabel(activity.action)}</span>
                                      <span
                                        className={`inline-flex px-2 py-0.5 text-xs font-mono uppercase rounded border shrink-0 ${activityOutcomeClass(activity.outcome)}`}
                                      >
                                        {String(activity.outcome || "unknown")}
                                      </span>
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-3 text-xs font-mono text-subtle">
                                      <span>{activity.entity_type || "-"}</span>
                                      {activity.entity_id && (
                                        <>
                                          <span className="text-border">|</span>
                                          <span className="truncate max-w-[200px]">{activity.entity_id}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-xs font-mono text-subtle shrink-0 text-right">
                                    <div>{formatDate(activity.ts)}</div>
                                    {activity.request_id && (
                                      <div className="mt-0.5 truncate max-w-[140px] opacity-60" title={activity.request_id}>
                                        {activity.request_id}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      <ConfirmModal
        open={rotateConfirmOpen}
        title="Rotate credentials"
        message="Rotate global key and revoke all active connected installations for this agent? Clients must reconnect."
        confirmLabel="Rotate + revoke apps"
        variant="default"
        loading={actionState === "loading"}
        onCancel={closeRotateConfirm}
        onConfirm={onRotateCredentials}
      >
        {actionError && <div className="text-xs font-mono text-error">{actionError}</div>}
      </ConfirmModal>

      <ConfirmModal
        open={revokeConfirmOpen}
        title="Revoke credentials"
        message="Revoke all global and installation credentials for this agent immediately?"
        confirmLabel="Revoke all"
        variant="danger"
        loading={actionState === "loading"}
        onCancel={closeRevokeConfirm}
        onConfirm={onRevokeCredentials}
      >
        {actionError && <div className="text-xs font-mono text-error">{actionError}</div>}
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(rotatedGlobalSecret)}
        title="Global key rotated"
        message="Copy the new global API key now. It may not be shown again."
        confirmLabel="Copy key"
        cancelLabel="Close"
        variant="success"
        onCancel={closeRotatedGlobalSecret}
        onConfirm={copyRotatedGlobalSecret}
      >
        <div className="space-y-2">
          <label className="block text-xs font-mono text-subtle uppercase">New global key</label>
          <textarea
            data-testid="account-rotated-global-key"
            value={rotatedGlobalSecret?.api_key || ""}
            readOnly
            className="w-full min-h-[84px] px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text"
          />
          <div className="text-xs font-mono text-subtle">
            {rotatedGlobalSecret?.api_key_id ? `api_key_id: ${rotatedGlobalSecret.api_key_id}` : ""}
          </div>
        </div>
      </ConfirmModal>

      <Toast toasts={toasts} />
    </div>
  );
}
