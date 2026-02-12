import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SettingsNav from "./SettingsNav";

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

function getErrorMessage(body: any, status: number): string {
  return body?.error?.message || body?.message || `HTTP ${status}`;
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
  if (value === "SUCCESS") return "border-success-muted/40 text-success-muted bg-success-muted/10";
  if (value === "BLOCKED") return "border-warning-muted/40 text-warning-muted bg-warning-muted/10";
  if (value === "FAILURE") return "border-error-muted/40 text-error-muted bg-error-muted/10";
  return "border-border text-subtle bg-bg/40";
}

function formatActionLabel(action: string): string {
  const raw = String(action || "").trim();
  if (!raw) return "unknown.action";
  return raw;
}

export default function AccountPage() {
  const [owner, setOwner] = useState<OwnerSummary | null>(null);
  const [agents, setAgents] = useState<OwnerAgent[]>([]);
  const [claims, setClaims] = useState<OwnerClaim[]>([]);
  const [activities, setActivities] = useState<OwnerAgentActivity[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div data-testid="account-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-[1440px] mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
              <span className="text-primary">/ </span>MY ACCOUNT
            </h1>
            <button
              data-testid="account-refresh"
              onClick={fetchAccount}
              className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
            >
              Refresh
            </button>
          </div>
          <SettingsNav current="account" />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-[1440px] mx-auto px-4 py-6 space-y-6">
        {authRequired && (
          <div data-testid="account-unauthorized" className="border border-error/30 bg-error/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-error">Login required</div>
            <div className="text-xs font-mono text-muted mt-1">
              Go to{" "}
              <Link className="text-text underline" href="/auth/login">
                /auth/login
              </Link>{" "}
              to authenticate your owner session.
            </div>
          </div>
        )}

        {!authRequired && state === "loading" && (
          <div data-testid="account-loading" className="text-xs font-mono text-subtle">
            Loading account data...
          </div>
        )}

        {!authRequired && state === "error" && (
          <div data-testid="account-error" className="border border-error/30 bg-error/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-error">Error</div>
            <div className="text-xs font-mono text-muted mt-1">{error || "Failed to load account"}</div>
          </div>
        )}

        {!authRequired && state === "done" && (
          <div className="border border-border rounded clip-corner overflow-hidden bg-surface min-h-[70vh]">
            <div className="grid md:grid-cols-[320px_minmax(0,1fr)] min-h-[70vh]">
              <aside className="border-r border-border/60 p-4 bg-[linear-gradient(180deg,rgba(78,26,110,0.95)_0%,rgba(47,16,68,0.95)_55%,rgba(30,14,46,0.95)_100%)]">
                <div data-testid="account-owner-card" className="rounded clip-corner border border-white/15 bg-black/20 p-3">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-white/70">Workspace</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-8 w-8 rounded bg-white/20 text-white text-xs font-mono font-bold flex items-center justify-center">
                      {String(owner?.email || "OW").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{owner?.email || "owner"}</div>
                      <div className="text-[11px] font-mono text-white/60 truncate">{owner?.owner_id || "-"}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-white/80">
                    {owner?.email_verified_at ? `VERIFIED ${formatDate(owner.email_verified_at)}` : "UNVERIFIED"}
                  </div>
                </div>

                <section data-testid="account-agents" className="mt-4">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-white/60 mb-2 flex items-center justify-between">
                    <span>Channels</span>
                    <span className="rounded-full border border-white/20 bg-black/20 px-2 py-0.5 text-white/80">
                      {agents.length}
                    </span>
                  </div>
                  {agents.length === 0 ? (
                    <div className="text-xs font-mono text-white/70">
                      No agent channels.{" "}
                      <Link href="/start" className="text-white underline">
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
                              "w-full text-left flex items-center justify-between gap-2 rounded px-2 py-1.5 transition-colors",
                              active ? "bg-white/20 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                            ].join(" ")}
                          >
                            <span className="truncate text-sm">
                              # {formatAgentName(agent, index)}
                            </span>
                            <span className="text-[11px] font-mono opacity-80">
                              {typeof agent.trust_score === "number" ? agent.trust_score : "-"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section data-testid="account-claims" className="mt-6">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-white/60 mb-2 flex items-center justify-between">
                    <span>Requests</span>
                    <span className="rounded-full border border-white/20 bg-black/20 px-2 py-0.5 text-white/80">
                      {pendingClaims}
                    </span>
                  </div>
                  {claims.length === 0 ? (
                    <div className="text-xs font-mono text-white/70">No claim requests yet.</div>
                  ) : (
                    <div className="space-y-1">
                      {claims.slice(0, 8).map((claim) => (
                        <div key={claim.claim_id} className="rounded border border-white/10 bg-black/15 px-2 py-1.5">
                          <div className="text-xs text-white truncate">{claim.requested_agent_name || "Unnamed request"}</div>
                          <div className="text-[11px] font-mono text-white/60">
                            {String(claim.status || "unknown").toUpperCase()} - {formatDate(claim.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </aside>

              <section className="min-w-0 flex flex-col bg-[radial-gradient(circle_at_top,rgba(34,64,92,0.24),transparent_45%),linear-gradient(180deg,rgba(13,19,31,0.98)_0%,rgba(8,12,20,0.98)_100%)]">
                <header className="border-b border-border/60 px-5 py-4">
                  <div className="text-xl font-semibold tracking-tight text-text"># {selectedAgentName}</div>
                  <div className="mt-1 text-xs font-mono text-subtle truncate">
                    {selectedAgent ? selectedAgent.agent_id : "Select or create an agent channel to start."}
                  </div>
                </header>

                <div className="p-5 space-y-4">
                  {agents.length === 0 && (
                    <div className="border border-border bg-surface/70 rounded clip-corner p-5">
                      <div className="text-sm font-semibold text-text">No channels yet</div>
                      <p className="mt-1 text-xs font-mono text-subtle">
                        Create your first agent from the onboarding flow, then come back here.
                      </p>
                      <Link
                        href="/start"
                        className="inline-flex mt-3 px-3 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors"
                      >
                        Open /start
                      </Link>
                    </div>
                  )}

                  {selectedAgent && (
                    <>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div className="border border-border bg-surface/60 rounded clip-corner p-3">
                          <div className="text-[11px] font-mono uppercase text-subtle">Status</div>
                          <div className="mt-1 text-sm text-text">{selectedAgent.status || "-"}</div>
                        </div>
                        <div className="border border-border bg-surface/60 rounded clip-corner p-3">
                          <div className="text-[11px] font-mono uppercase text-subtle">Trust score</div>
                          <div className="mt-1 text-sm text-text">
                            {typeof selectedAgent.trust_score === "number" ? String(selectedAgent.trust_score) : "-"}
                          </div>
                        </div>
                        <div className="border border-border bg-surface/60 rounded clip-corner p-3">
                          <div className="text-[11px] font-mono uppercase text-subtle">Created</div>
                          <div className="mt-1 text-sm text-text">{formatDate(selectedAgent.created_at)}</div>
                        </div>
                      </div>

                      <div className="border border-border bg-surface/45 rounded clip-corner p-3">
                        <div className="text-[11px] font-mono uppercase text-subtle mb-2">Agent actions</div>
                        {filteredActivities.length === 0 ? (
                          <div className="text-xs font-mono text-subtle">No tracked actions for this channel yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {filteredActivities.map((activity) => (
                              <article
                                key={activity.activity_id}
                                className="border border-border/70 bg-bg/70 rounded clip-corner px-3 py-2"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs font-semibold text-text">{formatActionLabel(activity.action)}</div>
                                  <span
                                    className={`px-2 py-0.5 text-[11px] font-mono uppercase rounded border ${activityOutcomeClass(
                                      activity.outcome
                                    )}`}
                                  >
                                    {String(activity.outcome || "unknown")}
                                  </span>
                                </div>
                                <div className="mt-1 text-[11px] font-mono text-subtle">
                                  Entity: {activity.entity_type || "-"} {activity.entity_id ? `| ${activity.entity_id}` : ""}
                                </div>
                                <div className="mt-1 text-[11px] font-mono text-subtle">
                                  At {formatDate(activity.ts)} {activity.request_id ? `| Request ${activity.request_id}` : ""}
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
    </div>
  );
}
