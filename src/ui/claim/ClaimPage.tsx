import { useCallback, useEffect, useMemo, useState } from "react";

import ClaimStatusBadge from "./ClaimStatusBadge";
import { claimSession, denySession, fetchClaimSession } from "./api";
import type { ClaimMode, ConnectSessionClaimView } from "./types";

const SCOPE_EXPLANATIONS: Record<string, string> = {
  "agent:read": "Read listings, offers, and account state for this installation.",
  "agent:write": "Create and update listings, offers, and messages.",
  "approvals:read": "View pending approval requests from this installation.",
  "approvals:write": "Approve or deny sensitive actions from this installation.",
  "installations:read": "View connected app installation status and metadata."
};

function describeScope(scope: string) {
  return SCOPE_EXPLANATIONS[String(scope || "").trim()] || "Additional API access requested by this installation.";
}

function formatExpires(expiresAt: string | null) {
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

  return { label: isExpired ? `expired ${rel} ago` : `in ${rel}`, isExpired };
}

export default function ClaimPage({ claimToken }: { claimToken: string }) {
  const token = useMemo(() => String(claimToken || "").trim(), [claimToken]);

  const [session, setSession] = useState<ConnectSessionClaimView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<ClaimMode>("create_agent");
  const [agentName, setAgentName] = useState("");
  const [attachAgentId, setAttachAgentId] = useState("");

  const [submitState, setSubmitState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

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
        setError(res.error || "Failed to load claim session");
        return;
      }
      setError(null);
      setSession(res.data);
      setAgentName(String(res.data.requested_agent_name || "").trim());
      const ownerAgents = Array.isArray(res.data.owner_agents) ? res.data.owner_agents : [];
      const defaultMode = res.data.default_mode === "attach_agent" ? "attach_agent" : "create_agent";
      const firstAgentId = ownerAgents[0]?.agent_id ? String(ownerAgents[0].agent_id) : "";
      setMode(defaultMode);
      setAttachAgentId(firstAgentId);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const expires = useMemo(() => formatExpires(session?.expires_at || null), [session?.expires_at]);
  const ownerAgents = useMemo(
    () => (Array.isArray(session?.owner_agents) ? session.owner_agents : []),
    [session]
  );
  const fallbackAttachAgentId = ownerAgents[0]?.agent_id ? String(ownerAgents[0].agent_id) : "";
  const resolvedAttachAgentId = useMemo(() => {
    const selected = String(attachAgentId || "").trim();
    if (!selected) return fallbackAttachAgentId;
    const stillAvailable = ownerAgents.some((agent) => String(agent?.agent_id) === selected);
    return stillAvailable ? selected : fallbackAttachAgentId;
  }, [attachAgentId, fallbackAttachAgentId, ownerAgents]);
  const ownerContextAvailable = Boolean(session?.owner_context_available);
  const allowCreateAgent = session?.allow_create_agent !== false;
  const showCreateMode = !ownerContextAvailable || allowCreateAgent;

  const actionable = Boolean(session && session.status === "PENDING_CLAIM" && !expires.isExpired);
  const canSubmitClaim = actionable && (mode !== "attach_agent" || Boolean(resolvedAttachAgentId));

  const onClaim = useCallback(async () => {
    if (!session) return;
    if (submitState === "loading") return;
    if (mode === "attach_agent" && !resolvedAttachAgentId) {
      setSubmitError("Select an existing agent to attach.");
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
      setSubmitError(resp.error || "Claim failed");
      setSubmitState("error");
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
  }, [session, submitState, token, mode, agentName, resolvedAttachAgentId]);

  const onDeny = useCallback(async () => {
    if (!session) return;
    if (submitState === "loading") return;
    const confirmed = window.confirm("Refuse this connection request? This cannot be undone.");
    if (!confirmed) return;

    setSubmitState("loading");
    setSubmitError(null);
    setResult(null);

    const resp = await denySession({ sessionId: session.session_id, claimToken: token });
    if (!resp.ok) {
      setSubmitError(resp.error || "Deny failed");
      setSubmitState("error");
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
  }, [session, submitState, token]);

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
                <p className="text-xs font-mono text-subtle">
                  Connect an external client to your Clawdeals owner account.
                </p>
              </div>
              {session?.status && (
                <div data-testid="claim-status">
                  <ClaimStatusBadge status={session.status} />
                </div>
              )}
            </div>

            {!token && (
              <div className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-red-400">Missing token</div>
                <div className="text-xs font-mono text-muted mt-1">The claim link is incomplete.</div>
              </div>
            )}

            {fetchState === "loading" && (
              <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                <div className="text-xs font-mono text-subtle">Loading…</div>
              </div>
            )}

            {error && (
              <div className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-red-400">Error</div>
                <div className="text-xs font-mono text-muted mt-1">{error}</div>
              </div>
            )}

            {session && (
              <div data-testid="claim-loaded" className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                    <div className="text-[10px] font-mono text-subtle uppercase">Client</div>
                    <div className="text-xs font-mono text-text mt-1">
                      {session.client_type || "\u2014"}
                      {session.client_version ? (
                        <span className="text-muted"> v{session.client_version}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                    <div className="text-[10px] font-mono text-subtle uppercase">Expires</div>
                    <div className="text-xs font-mono text-text mt-1">
                      {session.expires_at ? new Date(session.expires_at).toISOString() : "\u2014"}
                    </div>
                    <div className="text-[10px] font-mono text-muted mt-1">{expires.label}</div>
                  </div>
                </div>

                <div className="border border-border bg-surface/40 rounded clip-corner p-3 space-y-2">
                  <div className="text-[10px] font-mono text-subtle uppercase">Requested Permissions</div>
                  <div className="space-y-2" data-testid="claim-requested-scopes">
                    {(session.requested_scopes || []).length === 0 && (
                      <span className="text-xs font-mono text-muted">none</span>
                    )}
                    {(session.requested_scopes || []).map((scope) => (
                      <div
                        key={scope}
                        className="border border-border rounded bg-surface/20 px-2 py-1 space-y-1"
                      >
                        <div className="text-[10px] font-mono font-bold uppercase text-subtle">{scope}</div>
                        <div className="text-[10px] font-mono text-muted">{describeScope(scope)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {session.status !== "PENDING_CLAIM" && (
                  <div className="border border-border bg-surface-alt/20 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-subtle">
                      This session is not claimable (status={session.status}).
                    </div>
                  </div>
                )}

                <div className="border border-border rounded clip-corner p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-xs font-mono text-subtle uppercase">Choose agent</div>
                    <div className="flex items-center gap-2">
                      {showCreateMode && (
                        <button
                          data-testid="claim-mode-create"
                          disabled={!actionable || submitState === "loading"}
                          onClick={() => setMode("create_agent")}
                          className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border rounded transition-colors disabled:opacity-50 ${
                            mode === "create_agent"
                              ? "border-primary/40 text-primary bg-primary/10"
                              : "border-border text-muted hover:border-border-strong hover:text-text"
                          }`}
                        >
                          Create
                        </button>
                      )}
                      <button
                        data-testid="claim-mode-attach"
                        disabled={!actionable || submitState === "loading"}
                        onClick={() => setMode("attach_agent")}
                        className={`px-3 py-1.5 text-xs font-mono font-bold uppercase border rounded transition-colors disabled:opacity-50 ${
                          mode === "attach_agent"
                            ? "border-primary/40 text-primary bg-primary/10"
                            : "border-border text-muted hover:border-border-strong hover:text-text"
                        }`}
                      >
                        Attach
                      </button>
                    </div>
                  </div>
                  {ownerContextAvailable && !allowCreateAgent && (
                    <div
                      data-testid="claim-agent-limit-note"
                      className="border border-border bg-surface-alt/20 rounded clip-corner p-3"
                    >
                      <div className="text-xs font-mono text-subtle">
                        This owner already reached the agent limit ({String(session.owner_agent_limit || 1)}). Attach to
                        an existing agent.
                      </div>
                    </div>
                  )}

                  {mode === "create_agent" && showCreateMode && (
                    <div>
                      <label className="block text-[10px] font-mono text-subtle uppercase mb-1" htmlFor="claim-agent-name">
                        New Agent Name
                      </label>
                      <input
                        id="claim-agent-name"
                        disabled={!actionable || submitState === "loading"}
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder={session.requested_agent_name || "OpenClaw"}
                        name="agent_name"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors disabled:opacity-50"
                      />
                      <div className="text-[10px] font-mono text-muted mt-1">Defaulted from requested agent name.</div>
                    </div>
                  )}

                  {mode === "attach_agent" && (
                    <div>
                      {ownerContextAvailable && ownerAgents.length > 0 ? (
                        <>
                          <label
                            className="block text-[10px] font-mono text-subtle uppercase mb-1"
                            htmlFor="claim-attach-agent-select"
                          >
                            Existing Agent
                          </label>
                          <select
                            id="claim-attach-agent-select"
                            data-testid="claim-attach-agent-select"
                            disabled={!actionable || submitState === "loading"}
                            value={resolvedAttachAgentId}
                            onChange={(e) => setAttachAgentId(e.target.value)}
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
                          <label
                            className="block text-[10px] font-mono text-subtle uppercase mb-1"
                            htmlFor="claim-attach-agent-id"
                          >
                            Existing Agent ID
                          </label>
                          <input
                            id="claim-attach-agent-id"
                            data-testid="claim-attach-agent-id"
                            disabled={!actionable || submitState === "loading"}
                            value={resolvedAttachAgentId}
                            onChange={(e) => setAttachAgentId(e.target.value)}
                            placeholder="uuid"
                            name="attach_agent_id"
                            autoComplete="off"
                            spellCheck={false}
                            className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors disabled:opacity-50"
                          />
                        </>
                      )}
                      <div className="text-[10px] font-mono text-muted mt-1">Agent must belong to the same owner.</div>
                    </div>
                  )}
                </div>

                {submitError && (
                  <div className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-red-400">Error</div>
                    <div className="text-xs font-mono text-muted mt-1">{submitError}</div>
                  </div>
                )}

                {submitState === "done" && result && (
                  <div className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-secondary">Success</div>
                    <div className="text-xs font-mono text-muted mt-1">
                      status={String(result.status || session.status)} agent_id={String(result.agent_id || session.agent_id || "\u2014")}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    data-testid="claim-approve"
                    disabled={!canSubmitClaim || submitState === "loading"}
                    onClick={onClaim}
                    className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    {submitState === "loading" ? "Claiming…" : "Claim & Connect"}
                  </button>
                  <button
                    data-testid="claim-deny"
                    disabled={!actionable || submitState === "loading"}
                    onClick={onDeny}
                    className="px-4 py-2 text-xs font-mono font-bold uppercase border border-red-400/40 text-red-400 rounded hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    Refuse
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-[10px] font-mono text-subtle">
            If this wasn’t expected, close this page. Never paste tokens into chat.
          </div>
        </div>
      </div>
    </div>
  );
}
