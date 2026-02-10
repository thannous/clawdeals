import { useCallback, useEffect, useMemo, useState } from "react";

import ClaimStatusBadge from "./ClaimStatusBadge";
import { claimSession, denySession, fetchClaimSession } from "./api";
import type { ClaimMode, ConnectSessionClaimView } from "./types";

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
      setSession(res.data);
      setAgentName(String(res.data.requested_agent_name || "").trim());
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const expires = useMemo(() => formatExpires(session?.expires_at || null), [session?.expires_at]);

  const actionable = Boolean(session && session.status === "PENDING_CLAIM" && !expires.isExpired);

  const onClaim = useCallback(async () => {
    if (!session) return;
    if (submitState === "loading") return;

    setSubmitState("loading");
    setSubmitError(null);
    setResult(null);

    const resp = await claimSession({
      sessionId: session.session_id,
      claimToken: token,
      mode,
      agentName: mode === "create_agent" ? agentName : undefined,
      attachAgentId: mode === "attach_agent" ? attachAgentId : undefined
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
  }, [session, submitState, token, mode, agentName, attachAgentId]);

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
    <div className="min-h-screen bg-bg relative overflow-hidden">
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
              {session?.status && <ClaimStatusBadge status={session.status} />}
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
              <div className="space-y-4">
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
                  <div className="flex flex-wrap gap-2">
                    {(session.requested_scopes || []).length === 0 && (
                      <span className="text-xs font-mono text-muted">none</span>
                    )}
                    {(session.requested_scopes || []).map((scope) => (
                      <span
                        key={scope}
                        className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase border border-border rounded text-subtle bg-surface/20"
                      >
                        {scope}
                      </span>
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
                      <button
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
                      <button
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

                  {mode === "create_agent" && (
                    <div>
                      <label className="block text-[10px] font-mono text-subtle uppercase mb-1">New Agent Name</label>
                      <input
                        disabled={!actionable || submitState === "loading"}
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder={session.requested_agent_name || "OpenClaw"}
                        className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                      />
                      <div className="text-[10px] font-mono text-muted mt-1">Defaulted from requested agent name.</div>
                    </div>
                  )}

                  {mode === "attach_agent" && (
                    <div>
                      <label className="block text-[10px] font-mono text-subtle uppercase mb-1">Existing Agent ID</label>
                      <input
                        disabled={!actionable || submitState === "loading"}
                        value={attachAgentId}
                        onChange={(e) => setAttachAgentId(e.target.value)}
                        placeholder="uuid"
                        className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                      />
                      <div className="text-[10px] font-mono text-muted mt-1">
                        Agent must belong to the same owner.
                      </div>
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
                    disabled={!actionable || submitState === "loading"}
                    onClick={onClaim}
                    className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    {submitState === "loading" ? "Claiming..." : "Claim & Connect"}
                  </button>
                  <button
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
