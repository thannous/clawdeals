import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import DeviceStatusBadge from "./DeviceStatusBadge";
import { approveDevice, denyDevice, fetchDeviceRequest } from "./api";
import type { DeviceAuthorizationView, DeviceMode } from "./types";

function resolveQueryParam(value: unknown) {
  if (Array.isArray(value)) return value[0] || "";
  if (typeof value === "string") return value;
  return "";
}

function normalizeUserCode(value: string): { normalized: string; valid: boolean } {
  // Keep this consistent with the backend (no I/O/1/0) to reduce retries and rate-limit pressure.
  const allowed = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split(""));

  const raw = String(value || "").trim();
  if (!raw) return { normalized: "", valid: false };

  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 8) return { normalized: raw.toUpperCase(), valid: false };

  for (const ch of compact) {
    if (!allowed.has(ch)) return { normalized: raw.toUpperCase(), valid: false };
  }

  const normalized = `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return { normalized, valid: true };
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

export default function DevicePage() {
  const router = useRouter();
  const queryUserCode = useMemo(
    () => resolveQueryParam(router.query?.user_code ?? router.query?.userCode).trim(),
    [router.query?.user_code, router.query?.userCode]
  );

  const [userCode, setUserCode] = useState("");
  const [request, setRequest] = useState<DeviceAuthorizationView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<DeviceMode>("create_agent");
  const [agentName, setAgentName] = useState("");
  const [attachAgentId, setAttachAgentId] = useState("");

  const [submitState, setSubmitState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const expires = useMemo(() => formatExpires(request?.expires_at || null), [request?.expires_at]);
  const actionable = Boolean(request && request.status === "PENDING" && !expires.isExpired);

  const doLookup = useCallback(async (code: string) => {
    const { normalized, valid } = normalizeUserCode(code);
    setUserCode(normalized);
    setRequest(null);
    setSubmitState("idle");
    setSubmitError(null);

    if (!valid) {
      setError("Invalid code format. Expected ABCD-EFGH.");
      return;
    }

    setError(null);
    const resp = await fetchDeviceRequest(normalized);
    if (!resp.ok) {
      setError(resp.error || "Failed to load device request");
      return;
    }
    setRequest(resp.data);
    setAgentName(String(resp.data.requested_agent_name || "").trim());
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (!queryUserCode) return;
    // Avoid calling setState synchronously in an effect (eslint react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      void doLookup(queryUserCode);
    });
  }, [router.isReady, queryUserCode, doLookup]);

  const onSubmitLookup = useCallback(async () => {
    await doLookup(userCode);
  }, [doLookup, userCode]);

  const onApprove = useCallback(async () => {
    if (!request) return;
    if (!actionable) return;
    if (submitState === "loading") return;

    setSubmitState("loading");
    setSubmitError(null);

    const resp = await approveDevice({
      userCode,
      mode,
      agentName: mode === "create_agent" ? agentName : undefined,
      attachAgentId: mode === "attach_agent" ? attachAgentId : undefined
    });

    if (!resp.ok) {
      setSubmitError(resp.error || "Approve failed");
      setSubmitState("error");
      return;
    }

    setRequest((prev) =>
      prev
        ? {
            ...prev,
            status: resp.data?.status || "AUTHORIZED",
            owner_id: resp.data?.owner_id || prev.owner_id,
            agent_id: resp.data?.agent_id || prev.agent_id,
            authorized_at: resp.data?.authorized_at || prev.authorized_at
          }
        : prev
    );
    setSubmitState("done");
  }, [request, actionable, submitState, userCode, mode, agentName, attachAgentId]);

  const onDeny = useCallback(async () => {
    if (!request) return;
    if (!actionable) return;
    if (submitState === "loading") return;
    const confirmed = window.confirm("Deny this device request? This cannot be undone.");
    if (!confirmed) return;

    setSubmitState("loading");
    setSubmitError(null);

    const resp = await denyDevice({ userCode });
    if (!resp.ok) {
      setSubmitError(resp.error || "Deny failed");
      setSubmitState("error");
      return;
    }

    setRequest((prev) =>
      prev
        ? {
            ...prev,
            status: resp.data?.status || "DENIED",
            denied_at: resp.data?.denied_at || prev.denied_at
          }
        : prev
    );
    setSubmitState("done");
  }, [request, actionable, submitState, userCode]);

  return (
    <div data-testid="device-page" className="min-h-screen bg-bg relative overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-60" />
      <div className="animate-scanline" />

      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-surface border border-border rounded clip-corner p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
                  <span className="text-primary">/ </span>DEVICE VERIFY
                </h1>
                <p className="text-xs font-mono text-subtle">
                  Enter the code shown on your device to approve or deny access.
                </p>
              </div>
              {request?.status && <DeviceStatusBadge status={request.status} />}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-mono text-subtle uppercase" htmlFor="device-user-code">
                User Code
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="device-user-code"
                  data-testid="device-user-code"
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value)}
                  placeholder="ABCD-EFGH"
                  name="user_code"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                  className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
                />
                <button
                  data-testid="device-lookup"
                  onClick={onSubmitLookup}
                  className="px-4 py-2 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
                >
                  Lookup
                </button>
              </div>
            </div>

            {error && (
              <div data-testid="device-error" className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
                <div className="text-xs font-mono text-red-400">Error</div>
                <div className="text-xs font-mono text-muted mt-1">{error}</div>
              </div>
            )}

            {request && (
              <div data-testid="device-loaded" className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-subtle uppercase">Client</div>
                    <div className="text-xs font-mono text-text mt-1">{request.client_id || "\u2014"}</div>
                  </div>
                  <div className="border border-border bg-surface/40 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-subtle uppercase">Expires</div>
                    <div className="text-xs font-mono text-text mt-1">
                      {request.expires_at ? new Date(request.expires_at).toISOString() : "\u2014"}
                    </div>
                    <div className="text-xs font-mono text-muted mt-1">{expires.label}</div>
                  </div>
                </div>

                <div className="border border-border bg-surface/40 rounded clip-corner p-3 space-y-2">
                  <div className="text-xs font-mono text-subtle uppercase">Requested Permissions</div>
                  <div className="flex flex-wrap gap-2">
                    {(request.requested_scopes || []).length === 0 && (
                      <span className="text-xs font-mono text-muted">none</span>
                    )}
                    {(request.requested_scopes || []).map((scope) => (
                      <span
                        key={scope}
                        className="px-2 py-0.5 text-xs font-mono font-bold uppercase border border-border rounded text-subtle bg-surface/20"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>

                {request.status !== "PENDING" && (
                  <div className="border border-border bg-surface-alt/20 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-subtle">
                      This request is not actionable (status={request.status}).
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
                      <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="device-agent-name">
                        New Agent Name
                      </label>
                      <input
                        id="device-agent-name"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        disabled={!actionable || submitState === "loading"}
                        placeholder={request.requested_agent_name || "OpenClaw"}
                        name="agent_name"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors disabled:opacity-50"
                      />
                      <div className="text-xs font-mono text-muted mt-1">Defaulted from requested agent name.</div>
                    </div>
                  )}

                  {mode === "attach_agent" && (
                    <div>
                      <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="device-attach-agent-id">
                        Existing Agent ID
                      </label>
                      <input
                        id="device-attach-agent-id"
                        value={attachAgentId}
                        onChange={(e) => setAttachAgentId(e.target.value)}
                        disabled={!actionable || submitState === "loading"}
                        placeholder="uuid"
                        name="attach_agent_id"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors disabled:opacity-50"
                      />
                      <div className="text-xs font-mono text-muted mt-1">
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

                {submitState === "done" && (
                  <div className="border border-secondary/30 bg-secondary/5 rounded clip-corner p-3">
                    <div className="text-xs font-mono text-secondary">Success</div>
                    <div className="text-xs font-mono text-muted mt-1">
                      status={request.status} agent_id={String(request.agent_id || "\u2014")}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    data-testid="device-approve"
                    disabled={!actionable || submitState === "loading"}
                    onClick={onApprove}
                    className="px-4 py-2 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
                  >
                    {submitState === "loading" ? "Approving…" : "Approve"}
                  </button>
                  <button
                    data-testid="device-deny"
                    disabled={!actionable || submitState === "loading"}
                    onClick={onDeny}
                    className="px-4 py-2 text-xs font-mono font-bold uppercase border border-red-400/40 text-red-400 rounded hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    Deny
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="text-xs font-mono text-subtle">
            If this wasn’t expected, close this page. Never paste codes into chat.
          </div>
        </div>
      </div>
    </div>
  );
}
