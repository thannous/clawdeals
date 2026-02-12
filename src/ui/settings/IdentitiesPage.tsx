import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ConsoleTable, { type Column } from "../console/shared/ConsoleTable";
import SkeletonTable from "../console/shared/SkeletonTable";
import EmptyState from "../console/shared/EmptyState";
import ErrorState from "../console/shared/ErrorState";
import ConfirmModal from "../console/shared/ConfirmModal";
import Toast from "../console/shared/Toast";
import { useToast } from "../console/shared/useToast";
import TruncatedId from "../console/shared/TruncatedId";
import ConsoleStatusBadge from "../console/shared/ConsoleStatusBadge";
import { formatDate } from "../console/shared/formatDate";
import SettingsNav from "./SettingsNav";

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

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type ChannelIdentity = {
  identity_id: string;
  channel_type: string;
  display_name: string | null;
  role: string | null;
  state: "PENDING" | "ACTIVE" | "REVOKED" | string;
  created_at: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
};

export default function IdentitiesPage() {
  const { toasts, show } = useToast();

  const [owner, setOwner] = useState<{ owner_id: string; email_masked: string | null; email_verified_at: string | null } | null>(
    null
  );
  const [channels, setChannels] = useState<ChannelIdentity[]>([]);
  const [authRequired, setAuthRequired] = useState(false);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchIdentities = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    setFetchState("loading");
    setError(null);
    setAuthRequired(false);

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const resp = await fetch("/api/v1/owner/identities?limit=50", {
          signal: controller.signal
        });
        const body = await resp.json().catch(() => ({}));
        if (resp.status === 401 && attempt < 2) {
          await sleep(140 * (attempt + 1));
          continue;
        }
        if (resp.status === 401) {
          setOwner(null);
          setChannels([]);
          setAuthRequired(true);
          setFetchState("done");
          return;
        }
        if (!resp.ok) {
          throw new Error(getErrorMessage(body, resp.status));
        }
        setOwner({
          owner_id: body?.data?.owner_id ? String(body.data.owner_id) : "",
          email_masked: body?.data?.email_masked ? String(body.data.email_masked) : null,
          email_verified_at: body?.data?.email_verified_at ? String(body.data.email_verified_at) : null
        });
        setChannels(Array.isArray(body?.data?.channels) ? body.data.channels : []);
        setFetchState("done");
        return;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setAuthRequired(false);
      setError(String(err?.message || "Failed to load identities"));
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    void fetchIdentities();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchIdentities]);

  const refetch = useCallback(() => {
    void fetchIdentities();
  }, [fetchIdentities]);

  const columns: Column[] = useMemo(
    () => [
      { key: "identity_id", label: "Identity" },
      { key: "channel_type", label: "Channel" },
      { key: "display_name", label: "Display" },
      { key: "role", label: "Role" },
      { key: "state", label: "Status" },
      { key: "approved_at", label: "Paired" },
      { key: "last_seen_at", label: "Last Seen" },
      { key: "actions", label: "" }
    ],
    []
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<ChannelIdentity | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const openConfirm = useCallback((identity: ChannelIdentity) => {
    setSelected(identity);
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
      const resp = await fetch(`/api/v1/owner/identities/${encodeURIComponent(selected.identity_id)}`, {
        method: "DELETE",
        headers: {
          "Idempotency-Key": idempotencyKey
        }
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(getErrorMessage(body, resp.status));
      }
      const updated = body?.data || null;
      if (updated?.identity_id) {
        setChannels((prev) => prev.map((it) => (it.identity_id === updated.identity_id ? updated : it)));
      } else {
        void fetchIdentities();
      }
      show("Identity unlinked", "success");
      closeConfirm();
    } catch (err: any) {
      const message = String(err?.message || "Unlink failed");
      setSubmitError(message);
      setSubmitState("error");
      show(message, "error");
    }
  }, [selected, submitState, show, closeConfirm, fetchIdentities]);

  return (
    <div data-testid="identities-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>LINKED IDENTITIES
          </h1>
          <SettingsNav current="identities" />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-mono text-subtle">
            Linked identities are stored securely. Values may be hidden for privacy.
          </div>
          <button
            onClick={refetch}
            className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
          >
            Refresh
          </button>
        </div>

        {authRequired && (
          <div data-testid="identities-missing-owner" className="border border-red-400/30 bg-red-400/5 rounded clip-corner p-3">
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

        {!authRequired && fetchState === "loading" && (
          <div data-testid="identities-loading">
            <SkeletonTable columns={8} rows={8} />
          </div>
        )}

        {!authRequired && fetchState === "error" && (
          <div data-testid="identities-error">
            <ErrorState message={error || "Failed to load identities"} onRetry={refetch} />
          </div>
        )}

        {!authRequired && fetchState === "done" && (
          <div data-testid="identities-email" className="border border-border bg-surface rounded clip-corner p-4 space-y-2">
            <div className="text-xs font-mono text-subtle">Email</div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-mono text-text" data-testid="identities-email-value">
                {owner?.email_masked || "\u2014"}
              </div>
              <div className="text-xs font-mono text-subtle" data-testid="identities-email-status">
                {owner?.email_verified_at ? "VERIFIED" : "UNVERIFIED"}
              </div>
            </div>
          </div>
        )}

        {!authRequired && fetchState === "done" && channels.length === 0 && (
          <div data-testid="identities-empty">
            <EmptyState title="No channel identities linked" subtitle="Pair Telegram to enable chat commands." />
          </div>
        )}

        {!authRequired && fetchState === "done" && channels.length > 0 && (
          <div data-testid="identities-table">
            <ConsoleTable
              columns={columns}
              rows={channels}
              getRowKey={(row) => row.identity_id}
              renderCell={(row, col) => {
                if (col.key === "identity_id") return <TruncatedId id={row.identity_id} />;
                if (col.key === "channel_type") return String(row.channel_type || "").toUpperCase() || "\u2014";
                if (col.key === "display_name") return row.display_name || "\u2014";
                if (col.key === "role") return row.role || "\u2014";
                if (col.key === "state") return <ConsoleStatusBadge value={row.state} variant="channel" />;
                if (col.key === "approved_at") return formatDate(row.approved_at);
                if (col.key === "last_seen_at") return formatDate(row.last_seen_at);
                if (col.key === "actions") {
                  if (row.state === "REVOKED") {
                    return <span className="text-xs font-mono text-subtle">\u2014</span>;
                  }
                  return (
                    <button
                      data-testid={`identities-unlink-${row.identity_id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openConfirm(row);
                      }}
                      className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-red-400/40 text-red-400 rounded hover:bg-red-400/10 transition-colors"
                    >
                      Unlink
                    </button>
                  );
                }
                return row[col.key as keyof ChannelIdentity] as any;
              }}
            />
          </div>
        )}
      </main>

      <ConfirmModal
        open={confirmOpen}
        title="Unlink identity"
        message="Unlink this identity? You may lose access to flows that depend on it."
        confirmLabel="Unlink"
        variant="danger"
        loading={submitState === "loading"}
        onCancel={closeConfirm}
        onConfirm={onConfirm}
      >
        {submitError && <div className="text-xs font-mono text-red-400">{submitError}</div>}
      </ConfirmModal>

      <Toast toasts={toasts} />
    </div>
  );
}
