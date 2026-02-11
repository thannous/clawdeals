import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import SkeletonTable from "../console/shared/SkeletonTable";
import EmptyState from "../console/shared/EmptyState";
import ErrorState from "../console/shared/ErrorState";
import ConfirmModal from "../console/shared/ConfirmModal";
import Toast from "../console/shared/Toast";
import { useToast } from "../console/shared/useToast";
import ConsoleTable, { type Column } from "../console/shared/ConsoleTable";
import TruncatedId from "../console/shared/TruncatedId";
import ConsoleStatusBadge from "../console/shared/ConsoleStatusBadge";
import { formatDate } from "../console/shared/formatDate";
import { V1_SCOPES_UPGRADE_ONLY, sortScopesStable } from "../../shared/scopes/v1";

function randomIdempotencyKey(): string {
  try {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function getErrorMessage(body: any, status: number): string {
  return body?.error?.message || body?.message || `HTTP ${status}`;
}

function pickString(...values: any[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function pickNumber(...values: any[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && /^\d+$/.test(value.trim())) {
      const parsed = Number.parseInt(value.trim(), 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

type RotateCredentialResponse = {
  credential: string;
  credentialId: string | null;
  previousCredentialId: string | null;
  rotatedAt: string | null;
  graceSeconds: number | null;
  installationId: string | null;
};

function parseRotateCredentialResponse(body: any): RotateCredentialResponse | null {
  const data = body?.data && typeof body.data === "object" ? body.data : {};
  const credential = pickString(body?.credential, body?.api_key, data?.credential, data?.api_key);
  if (!credential) return null;

  return {
    credential,
    credentialId: pickString(body?.credential_id, body?.api_key_id, data?.credential_id, data?.api_key_id),
    previousCredentialId: pickString(
      body?.previous_credential_id,
      body?.previous_api_key_id,
      data?.previous_credential_id,
      data?.previous_api_key_id
    ),
    rotatedAt: pickString(body?.rotated_at, data?.rotated_at),
    graceSeconds: pickNumber(body?.grace_seconds, data?.grace_seconds),
    installationId: pickString(body?.installation_id, data?.installation_id),
  };
}

type Installation = {
  installation_id: string;
  agent_id: string;
  client_type: string;
  client_version: string | null;
  oauth_scopes: string[];
  status: "ACTIVE" | "REVOKED" | string;
  created_at: string;
  last_seen_at: string | null;
};

function renderScopePills(scopes: string[]) {
  const items = Array.isArray(scopes) ? scopes : [];
  if (items.length === 0) {
    return <span className="text-[10px] font-mono text-subtle">\u2014</span>;
  }

  const sorted = sortScopesStable(items);
  const max = 3;
  const visible = sorted.slice(0, max);
  const remaining = Math.max(0, sorted.length - visible.length);

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((scope) => (
        <span
          key={scope}
          className="px-1.5 py-0.5 text-[10px] font-mono uppercase border border-border text-muted rounded"
          title={scope}
        >
          {scope}
        </span>
      ))}
      {remaining > 0 && (
        <span className="px-1.5 py-0.5 text-[10px] font-mono text-subtle" title={sorted.join("\n")}>
          +{remaining} more
        </span>
      )}
    </div>
  );
}

export default function ConnectedAppsPage() {
  const { toasts, show } = useToast();

  const [items, setItems] = useState<Installation[]>([]);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchInstallations = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFetchState("loading");
    setError(null);

    try {
      const resp = await fetch("/api/console/owner/installations", { signal: controller.signal });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(getErrorMessage(body, resp.status));
      }
      setItems(Array.isArray(body.installations) ? body.installations : []);
      setFetchState("done");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(String(err?.message || "Failed to load installations"));
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    void fetchInstallations();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchInstallations]);

  const refetch = useCallback(() => {
    void fetchInstallations();
  }, [fetchInstallations]);

  const columns: Column[] = useMemo(
    () => [
      { key: "installation_id", label: "Installation" },
      { key: "agent_id", label: "Agent" },
      { key: "client_type", label: "Client" },
      { key: "client_version", label: "Version" },
      { key: "oauth_scopes", label: "Scopes" },
      { key: "status", label: "Status" },
      { key: "created_at", label: "Created" },
      { key: "last_seen_at", label: "Last Seen" },
      { key: "actions", label: "" },
    ],
    []
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<Installation | null>(null);
  const [reason, setReason] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeSelectedScopes, setUpgradeSelectedScopes] = useState<string[]>([]);
  const [upgradeState, setUpgradeState] = useState<"idle" | "loading" | "error">("idle");
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotateGraceSeconds, setRotateGraceSeconds] = useState("");
  const [rotateState, setRotateState] = useState<"idle" | "loading" | "error">("idle");
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotatedCredential, setRotatedCredential] = useState<RotateCredentialResponse | null>(null);

  const openRevokeConfirm = useCallback((installation: Installation) => {
    setSelected(installation);
    setReason("");
    setSubmitState("idle");
    setSubmitError(null);
    setConfirmOpen(true);
  }, []);

  const closeConfirm = useCallback(() => {
    if (submitState === "loading") return;
    setConfirmOpen(false);
    setSelected(null);
    setSubmitState("idle");
    setSubmitError(null);
  }, [submitState]);

  const openUpgrade = useCallback((installation: Installation) => {
    setSelected(installation);
    setUpgradeSelectedScopes([]);
    setUpgradeState("idle");
    setUpgradeError(null);
    setUpgradeOpen(true);
  }, []);

  const openRotate = useCallback((installation: Installation) => {
    setSelected(installation);
    setRotateGraceSeconds("");
    setRotateState("idle");
    setRotateError(null);
    setRotateOpen(true);
  }, []);

  const closeUpgrade = useCallback(() => {
    if (upgradeState === "loading") return;
    setUpgradeOpen(false);
    setUpgradeSelectedScopes([]);
    setUpgradeState("idle");
    setUpgradeError(null);
  }, [upgradeState]);

  const closeRotate = useCallback(() => {
    if (rotateState === "loading") return;
    setRotateOpen(false);
    setRotateGraceSeconds("");
    setRotateState("idle");
    setRotateError(null);
  }, [rotateState]);

  const closeRotatedCredential = useCallback(() => {
    setRotatedCredential(null);
  }, []);

  const copyRotatedCredential = useCallback(async () => {
    const credential = rotatedCredential?.credential || "";
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential);
      show("Credential copied to clipboard", "success");
    } catch {
      show("Copy failed. Copy manually before closing.", "error");
    }
  }, [rotatedCredential, show]);

  const onConfirm = useCallback(async () => {
    if (!selected) return;
    if (submitState === "loading") return;

    setSubmitState("loading");
    setSubmitError(null);

    try {
      const idempotencyKey = randomIdempotencyKey();
      const resp = await fetch(`/api/console/installations/${encodeURIComponent(selected.installation_id)}:revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(getErrorMessage(body, resp.status));
      }

      show("Installation revoked", "success");
      closeConfirm();
      refetch();
    } catch (err: any) {
      const message = String(err?.message || "Revoke failed");
      setSubmitError(message);
      setSubmitState("error");
      show(message, "error");
    }
  }, [selected, submitState, reason, closeConfirm, refetch, show]);

  const onRequestUpgrade = useCallback(async () => {
    if (!selected) return;
    if (upgradeState === "loading") return;

    setUpgradeState("loading");
    setUpgradeError(null);

    try {
      const idempotencyKey = randomIdempotencyKey();
      const resp = await fetch(
        `/api/console/installations/${encodeURIComponent(selected.installation_id)}:scopes-upgrade`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ requested_scopes: upgradeSelectedScopes }),
        }
      );
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(getErrorMessage(body, resp.status));
      }

      if (resp.status === 202 && body?.approval_id) {
        show(
          `Upgrade requested (approval ${String(body.approval_id)}). Review in /console/approvals.`,
          "success"
        );
      } else {
        show("Scopes already granted (no upgrade needed)", "success");
      }

      closeUpgrade();
      refetch();
    } catch (err: any) {
      const message = String(err?.message || "Scope upgrade request failed");
      setUpgradeError(message);
      setUpgradeState("error");
      show(message, "error");
    }
  }, [selected, upgradeState, upgradeSelectedScopes, closeUpgrade, refetch, show]);

  const onRotateCredential = useCallback(async () => {
    if (!selected) return;
    if (rotateState === "loading") return;

    const trimmedGraceSeconds = rotateGraceSeconds.trim();
    let graceSeconds: number | undefined;
    if (trimmedGraceSeconds) {
      if (!/^\d+$/.test(trimmedGraceSeconds)) {
        const validationMessage = "Grace seconds must be a non-negative integer";
        setRotateState("error");
        setRotateError(validationMessage);
        return;
      }
      graceSeconds = Number.parseInt(trimmedGraceSeconds, 10);
    }

    setRotateState("loading");
    setRotateError(null);

    try {
      const idempotencyKey = randomIdempotencyKey();
      const resp = await fetch(`/api/console/installations/${encodeURIComponent(selected.installation_id)}:rotate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(typeof graceSeconds === "number" ? { grace_seconds: graceSeconds } : {}),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(getErrorMessage(body, resp.status));
      }

      const parsed = parseRotateCredentialResponse(body);
      if (!parsed?.credential) {
        throw new Error("Rotate succeeded but no credential was returned");
      }

      setRotatedCredential({
        ...parsed,
        installationId: parsed.installationId || selected.installation_id,
      });
      show("Credential rotated. Copy it now.", "success");
      closeRotate();
      refetch();
    } catch (err: any) {
      const message = String(err?.message || "Rotate failed");
      setRotateError(message);
      setRotateState("error");
      show(message, "error");
    }
  }, [selected, rotateState, rotateGraceSeconds, show, closeRotate, refetch]);

  return (
    <div data-testid="connected-apps-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>CONNECTED APPS
          </h1>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-mono text-subtle">
            Manage your connected installations (OpenClaw/ClawdBot). Revoke to invalidate immediately, or rotate to issue
            a new credential.
          </div>
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            Refresh
          </button>
        </div>

        {fetchState === "loading" && (
          <div data-testid="connected-apps-loading">
            <SkeletonTable columns={9} rows={8} />
          </div>
        )}

        {fetchState === "error" && (
          <div data-testid="connected-apps-error">
            <ErrorState message={error || "Failed to load connected apps"} onRetry={refetch} />
          </div>
        )}

        {fetchState === "done" && items.length === 0 && (
          <div data-testid="connected-apps-empty">
            <EmptyState title="No connected apps found" subtitle="Installations will appear here after you connect a client." />
          </div>
        )}

        {fetchState === "done" && items.length > 0 && (
          <div data-testid="connected-apps-table">
            <ConsoleTable
              columns={columns}
              rows={items}
              getRowKey={(row) => row.installation_id}
              renderCell={(row, col) => {
                if (col.key === "installation_id") return <TruncatedId id={row.installation_id} />;
                if (col.key === "agent_id") return <TruncatedId id={row.agent_id} />;
                if (col.key === "client_version") return row.client_version || "\u2014";
                if (col.key === "oauth_scopes") return renderScopePills(row.oauth_scopes);
                if (col.key === "status") return <ConsoleStatusBadge value={row.status} variant="channel" />;
                if (col.key === "created_at") return formatDate(row.created_at);
                if (col.key === "last_seen_at") return formatDate(row.last_seen_at);
                if (col.key === "actions") {
                  if (row.status !== "ACTIVE") {
                    return <span className="text-[10px] font-mono text-subtle">\u2014</span>;
                  }
                  return (
                    <div className="flex items-center justify-end gap-2">
                      <button
                        data-testid={`connected-apps-upgrade-${row.installation_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openUpgrade(row);
                        }}
                        className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
                      >
                        Upgrade
                      </button>
                      <button
                        data-testid={`connected-apps-rotate-${row.installation_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openRotate(row);
                        }}
                        className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase border border-primary/40 text-primary rounded hover:bg-primary/10 transition-colors"
                      >
                        Rotate
                      </button>
                      <button
                        data-testid={`connected-apps-revoke-${row.installation_id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openRevokeConfirm(row);
                        }}
                        className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase border border-red-400/40 text-red-400 rounded hover:bg-red-400/10 transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  );
                }
                return row[col.key as keyof Installation] as any;
              }}
            />
          </div>
        )}
      </main>

      <ConfirmModal
        open={rotateOpen}
        title="Rotate credential"
        message="Rotate this installation credential? The newly returned credential is shown once."
        confirmLabel="Rotate"
        variant="default"
        loading={rotateState === "loading"}
        onCancel={closeRotate}
        onConfirm={onRotateCredential}
      >
        <div className="space-y-2">
          <label className="block text-[10px] font-mono text-subtle uppercase">Grace seconds (optional)</label>
          <input
            data-testid="connected-apps-rotate-grace-seconds"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={rotateGraceSeconds}
            onChange={(e) => setRotateGraceSeconds(e.target.value)}
            placeholder="e.g. 300"
            className="w-full h-10 px-3 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors"
          />
          <div className="text-[10px] font-mono text-subtle">Leave blank to use server default grace duration.</div>
          {rotateError && <div className="text-[10px] font-mono text-red-400">{rotateError}</div>}
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={confirmOpen}
        title="Revoke installation"
        message="Revoke this installation? This will invalidate all credentials associated with it."
        confirmLabel="Revoke"
        variant="danger"
        loading={submitState === "loading"}
        onCancel={closeConfirm}
        onConfirm={onConfirm}
      >
        <div className="space-y-2">
          <label className="block text-[10px] font-mono text-subtle uppercase">Reason (optional)</label>
          <textarea
            data-testid="connected-apps-revoke-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. suspected abuse"
            className="w-full min-h-[72px] px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:outline-none focus:border-primary transition-colors"
          />
          {submitError && <div className="text-[10px] font-mono text-red-400">{submitError}</div>}
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={upgradeOpen}
        title="Request scope upgrade"
        message="Select additional scopes to request. Non-default scopes always require approval."
        confirmLabel="Request"
        variant="default"
        loading={upgradeState === "loading"}
        onCancel={closeUpgrade}
        onConfirm={onRequestUpgrade}
      >
        <div className="space-y-3">
          <div className="text-[10px] font-mono text-subtle">
            Current scopes:{" "}
            <span className="text-muted">{selected?.oauth_scopes?.length ? selected.oauth_scopes.length : 0}</span>
          </div>

          <div className="grid gap-2">
            {V1_SCOPES_UPGRADE_ONLY.map((scope) => {
              const granted = Array.isArray(selected?.oauth_scopes)
                ? new Set(sortScopesStable(selected?.oauth_scopes || [])).has(scope)
                : false;
              const checked = upgradeSelectedScopes.includes(scope);
              return (
                <label
                  key={scope}
                  className={`flex items-center justify-between gap-3 px-3 py-2 rounded border ${
                    granted ? "border-border bg-surface/50 opacity-60" : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={granted}
                      checked={granted ? true : checked}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setUpgradeSelectedScopes((prev) => {
                          const set = new Set(prev);
                          if (next) set.add(scope);
                          else set.delete(scope);
                          return Array.from(set);
                        });
                      }}
                    />
                    <span className="text-xs font-mono text-text">{scope}</span>
                  </div>
                  {granted ? (
                    <span className="text-[10px] font-mono text-subtle uppercase">Granted</span>
                  ) : (
                    <span className="text-[10px] font-mono text-subtle uppercase">Upgrade</span>
                  )}
                </label>
              );
            })}
          </div>

          {upgradeError && <div className="text-[10px] font-mono text-red-400">{upgradeError}</div>}
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(rotatedCredential)}
        title="Credential rotated"
        message="Copy the new credential now. For security, it is cleared after this dialog is closed."
        confirmLabel="Copy"
        cancelLabel="Close"
        variant="success"
        onCancel={closeRotatedCredential}
        onConfirm={copyRotatedCredential}
      >
        <div className="space-y-3">
          <label className="block text-[10px] font-mono text-subtle uppercase">New credential</label>
          <textarea
            data-testid="connected-apps-rotate-credential"
            value={rotatedCredential?.credential || ""}
            readOnly
            className="w-full min-h-[84px] px-3 py-2 text-xs font-mono bg-surface border border-border rounded text-text"
          />
          <div className="space-y-1 text-[10px] font-mono text-subtle">
            {rotatedCredential?.credentialId && <div>credential_id: {rotatedCredential.credentialId}</div>}
            {rotatedCredential?.previousCredentialId && (
              <div>previous_credential_id: {rotatedCredential.previousCredentialId}</div>
            )}
            {rotatedCredential && rotatedCredential.graceSeconds !== null && (
              <div>grace_seconds: {rotatedCredential.graceSeconds}</div>
            )}
            {rotatedCredential?.rotatedAt && <div>rotated_at: {formatDate(rotatedCredential.rotatedAt)}</div>}
          </div>
        </div>
      </ConfirmModal>

      <Toast toasts={toasts} />
    </div>
  );
}
