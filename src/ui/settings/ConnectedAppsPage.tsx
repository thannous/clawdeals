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

type Installation = {
  installation_id: string;
  agent_id: string;
  client_type: string;
  client_version: string | null;
  status: "ACTIVE" | "REVOKED" | string;
  created_at: string;
  last_seen_at: string | null;
};

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

  return (
    <div data-testid="connected-apps-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>CONNECTED APPS
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-mono text-subtle">
            Manage your connected installations (OpenClaw/ClawdBot). Revoking invalidates credentials immediately.
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
            <SkeletonTable columns={8} rows={8} />
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
                if (col.key === "status") return <ConsoleStatusBadge value={row.status} variant="channel" />;
                if (col.key === "created_at") return formatDate(row.created_at);
                if (col.key === "last_seen_at") return formatDate(row.last_seen_at);
                if (col.key === "actions") {
                  if (row.status !== "ACTIVE") {
                    return <span className="text-[10px] font-mono text-subtle">\u2014</span>;
                  }
                  return (
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
                  );
                }
                return row[col.key as keyof Installation] as any;
              }}
            />
          </div>
        )}
      </main>

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

      <Toast toasts={toasts} />
    </div>
  );
}

