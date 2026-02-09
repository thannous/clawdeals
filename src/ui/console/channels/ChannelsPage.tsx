import { useMemo, useState, useCallback } from "react";

import ChannelsToolbar from "./ChannelsToolbar";
import ChannelsList from "./ChannelsList";
import { useChannelIdentities } from "./useChannelIdentities";
import { usePairingCodeLookup } from "./usePairingCodeLookup";
import { useChannelIdentityAction } from "./useChannelIdentityAction";
import SkeletonTable from "../shared/SkeletonTable";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import ConfirmModal from "../shared/ConfirmModal";
import Toast from "../shared/Toast";
import { useToast } from "../shared/useToast";
import TruncatedId from "../shared/TruncatedId";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import { formatDate } from "../shared/formatDate";

type PendingAction = "approve" | "deny" | "revoke";

export default function ChannelsPage() {
  const { toasts, show } = useToast();

  const {
    items,
    state,
    setState,
    channelType,
    setChannelType,
    fetchState,
    error,
    refetch
  } = useChannelIdentities();

  const [approveRole, setApproveRole] = useState("approver");
  const [pairingCode, setPairingCode] = useState("");

  const {
    lookup,
    clear: clearLookup,
    lookupState,
    error: lookupError,
    identity: lookupIdentity
  } = usePairingCodeLookup();

  const { execute, submitState, error: actionError } = useChannelIdentityAction({
    onSuccess: () => {
      show("Updated pairing", "success");
      refetch();
      clearLookup();
    }
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<any | null>(null);

  const openConfirm = useCallback((identity: any, action: PendingAction) => {
    setSelectedIdentity(identity);
    setPendingAction(action);
    setConfirmOpen(true);
  }, []);

  const closeConfirm = useCallback(() => {
    if (submitState === "loading") return;
    setConfirmOpen(false);
    setPendingAction(null);
    setSelectedIdentity(null);
  }, [submitState]);

  const confirmCopy = useMemo(() => {
    if (!pendingAction || !selectedIdentity) {
      return { title: "Confirm", message: "Confirm action", confirmLabel: "Confirm", variant: "default" as const };
    }
    if (pendingAction === "approve") {
      return {
        title: "Approve pairing",
        message: `Activate this identity with role=${approveRole}?`,
        confirmLabel: "Approve",
        variant: "success" as const
      };
    }
    if (pendingAction === "deny") {
      return {
        title: "Deny pairing",
        message: "Reject this pending pairing request?",
        confirmLabel: "Deny",
        variant: "danger" as const
      };
    }
    return {
      title: "Revoke pairing",
      message: "Revoke this active identity (commands will be blocked)?",
      confirmLabel: "Revoke",
      variant: "danger" as const
    };
  }, [pendingAction, selectedIdentity, approveRole]);

  const onConfirm = useCallback(async () => {
    if (!pendingAction || !selectedIdentity) return;
    const channelIdentityId = selectedIdentity.channel_identity_id;
    await execute({
      channelIdentityId,
      action: pendingAction,
      role: pendingAction === "approve" ? approveRole : undefined
    });
    closeConfirm();
  }, [pendingAction, selectedIdentity, execute, approveRole, closeConfirm]);

  const onLookupCode = useCallback(async () => {
    const result: any = await lookup(pairingCode);
    if (result && result.ok === false) {
      show(result.error || "Lookup failed", "error");
    }
  }, [lookup, pairingCode, show]);

  const onApprove = useCallback((identity: any) => openConfirm(identity, "approve"), [openConfirm]);
  const onDeny = useCallback((identity: any) => openConfirm(identity, "deny"), [openConfirm]);
  const onRevoke = useCallback((identity: any) => openConfirm(identity, "revoke"), [openConfirm]);

  const effectiveError = actionError || lookupError || error;

  return (
    <div data-testid="channels-page" className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <h1 className="text-lg font-bold tracking-wider text-text text-shadow-glow">
            <span className="text-primary">/ </span>CHANNELS
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <ChannelsToolbar
          state={state}
          onStateChange={setState}
          channelType={channelType}
          onChannelTypeChange={setChannelType}
          approveRole={approveRole}
          onApproveRoleChange={setApproveRole}
          pairingCode={pairingCode}
          onPairingCodeChange={setPairingCode}
          onLookupCode={onLookupCode}
          lookupDisabled={lookupState === "loading"}
        />

        {lookupIdentity && (
          <div className="bg-surface border border-border rounded clip-corner p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs font-mono text-subtle uppercase">Lookup result</div>
              <TruncatedId id={lookupIdentity.channel_identity_id} />
              <ConsoleStatusBadge value={lookupIdentity.state || "\u2014"} variant="channel" />
              <span className="text-xs font-mono text-muted">role={lookupIdentity.role || "\u2014"}</span>
            </div>
            <div className="text-xs font-mono text-muted">
              channel={lookupIdentity.channel_type || "\u2014"} display={lookupIdentity.display_name || "\u2014"} expires=
              {formatDate(lookupIdentity.pairing_expires_at)}
            </div>
            <div className="flex items-center gap-2">
              {lookupIdentity.state === "PENDING" && (
                <>
                  <button
                    onClick={() => onApprove(lookupIdentity)}
                    className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-secondary/40 text-secondary rounded hover:bg-secondary/10 transition-colors"
                  >
                    Approve (role={approveRole})
                  </button>
                  <button
                    onClick={() => onDeny(lookupIdentity)}
                    className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-red-400/40 text-red-400 rounded hover:bg-red-400/10 transition-colors"
                  >
                    Deny
                  </button>
                </>
              )}
              {lookupIdentity.state === "ACTIVE" && (
                <button
                  onClick={() => onRevoke(lookupIdentity)}
                  className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-red-400/40 text-red-400 rounded hover:bg-red-400/10 transition-colors"
                >
                  Revoke
                </button>
              )}
              <button
                onClick={clearLookup}
                className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-border text-muted rounded hover:border-border-strong hover:text-text transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {fetchState === "loading" && <SkeletonTable columns={8} rows={10} />}

        {fetchState === "error" && (
          <ErrorState message={effectiveError || "Failed to load channels"} onRetry={refetch} />
        )}

        {fetchState === "done" && items.length === 0 && (
          <EmptyState title="No channel identities found" subtitle="Try adjusting your filters or use pairing code lookup" />
        )}

        {fetchState === "done" && items.length > 0 && (
          <ChannelsList items={items} onApprove={onApprove} onDeny={onDeny} onRevoke={onRevoke} />
        )}
      </main>

      <ConfirmModal
        open={confirmOpen}
        title={confirmCopy.title}
        message={confirmCopy.message}
        confirmLabel={confirmCopy.confirmLabel}
        variant={confirmCopy.variant}
        loading={submitState === "loading"}
        onConfirm={onConfirm}
        onCancel={closeConfirm}
      />

      <Toast toasts={toasts} />
    </div>
  );
}
