import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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

function getErrorMessage(body: any, status: number): string {
  return body?.error?.message || body?.message || `HTTP ${status}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(dt);
}

function formatScopes(scopes: string[]): string {
  if (!Array.isArray(scopes) || scopes.length === 0) return "-";
  return scopes.join(", ");
}

export default function AccountPage() {
  const [owner, setOwner] = useState<OwnerSummary | null>(null);
  const [agents, setAgents] = useState<OwnerAgent[]>([]);
  const [claims, setClaims] = useState<OwnerClaim[]>([]);
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
      const [meResp, agentsResp, claimsResp] = await Promise.all([
        fetch("/api/v1/auth/me", { signal: controller.signal }),
        fetch("/api/v1/owner/agents?limit=100", { signal: controller.signal }),
        fetch("/api/v1/owner/claims?limit=100", { signal: controller.signal })
      ]);

      const [meBody, agentsBody, claimsBody] = await Promise.all([
        meResp.json().catch(() => ({})),
        agentsResp.json().catch(() => ({})),
        claimsResp.json().catch(() => ({}))
      ]);

      if (meResp.status === 401 || agentsResp.status === 401 || claimsResp.status === 401) {
        setOwner(null);
        setAgents([]);
        setClaims([]);
        setAuthRequired(true);
        setState("done");
        return;
      }

      if (!meResp.ok) throw new Error(getErrorMessage(meBody, meResp.status));
      if (!agentsResp.ok) throw new Error(getErrorMessage(agentsBody, agentsResp.status));
      if (!claimsResp.ok) throw new Error(getErrorMessage(claimsBody, claimsResp.status));

      setOwner({
        owner_id: meBody?.data?.owner_id ? String(meBody.data.owner_id) : "",
        email: meBody?.data?.email ? String(meBody.data.email) : null,
        email_verified_at: meBody?.data?.email_verified_at ? String(meBody.data.email_verified_at) : null
      });

      setAgents(Array.isArray(agentsBody?.data?.agents) ? agentsBody.data.agents : []);
      setClaims(Array.isArray(claimsBody?.data?.claims) ? claimsBody.data.claims : []);
      setState("done");
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

  return (
    <div data-testid="account-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>MY ACCOUNT
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-end">
          <button
            data-testid="account-refresh"
            onClick={fetchAccount}
            className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            Refresh
          </button>
        </div>

        {authRequired && (
          <div data-testid="account-unauthorized" className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-red-400">Login required</div>
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
          <div data-testid="account-error" className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
            <div className="text-xs font-mono text-red-400">Error</div>
            <div className="text-xs font-mono text-muted mt-1">{error || "Failed to load account"}</div>
          </div>
        )}

        {!authRequired && state === "done" && (
          <>
            <section data-testid="account-owner-card" className="border border-border bg-surface rounded clip-corner p-4 space-y-3">
              <div className="text-xs font-mono text-subtle uppercase">Owner</div>
              <div className="grid sm:grid-cols-3 gap-3 text-xs font-mono">
                <div>
                  <div className="text-subtle">Owner ID</div>
                  <div className="text-text break-all">{owner?.owner_id || "-"}</div>
                </div>
                <div>
                  <div className="text-subtle">Email</div>
                  <div className="text-text">{owner?.email || "-"}</div>
                </div>
                <div>
                  <div className="text-subtle">Verification</div>
                  <div className={owner?.email_verified_at ? "text-secondary" : "text-yellow-300"}>
                    {owner?.email_verified_at ? `VERIFIED (${formatDate(owner.email_verified_at)})` : "UNVERIFIED"}
                  </div>
                </div>
              </div>
            </section>

            <section data-testid="account-agents" className="border border-border bg-surface rounded clip-corner p-4 space-y-3">
              <div className="text-xs font-mono text-subtle uppercase">Agents</div>
              {agents.length === 0 ? (
                <div className="text-xs font-mono text-subtle">No agents found.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="py-2 pr-3 text-subtle font-semibold">Agent ID</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Name</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Status</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Trust</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((agent) => (
                        <tr key={agent.agent_id} className="border-b border-border/50">
                          <td className="py-2 pr-3 text-text break-all">{agent.agent_id}</td>
                          <td className="py-2 pr-3 text-text">{agent.name || "-"}</td>
                          <td className="py-2 pr-3 text-text">{agent.status || "-"}</td>
                          <td className="py-2 pr-3 text-text">
                            {typeof agent.trust_score === "number" ? String(agent.trust_score) : "-"}
                          </td>
                          <td className="py-2 pr-3 text-text">{formatDate(agent.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section data-testid="account-claims" className="border border-border bg-surface rounded clip-corner p-4 space-y-3">
              <div className="text-xs font-mono text-subtle uppercase">Claims</div>
              {claims.length === 0 ? (
                <div className="text-xs font-mono text-subtle">No claims found.</div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-left border-b border-border">
                        <th className="py-2 pr-3 text-subtle font-semibold">Source</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Status</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Requested Agent</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Scopes</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Created</th>
                        <th className="py-2 pr-3 text-subtle font-semibold">Decided</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claims.map((claim) => (
                        <tr key={`${claim.source}:${claim.claim_id}`} className="border-b border-border/50">
                          <td className="py-2 pr-3 text-text">{claim.source}</td>
                          <td className="py-2 pr-3 text-text">{claim.status || "-"}</td>
                          <td className="py-2 pr-3 text-text">{claim.requested_agent_name || "-"}</td>
                          <td className="py-2 pr-3 text-text">{formatScopes(claim.requested_scopes)}</td>
                          <td className="py-2 pr-3 text-text">{formatDate(claim.created_at)}</td>
                          <td className="py-2 pr-3 text-text">{formatDate(claim.decided_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
