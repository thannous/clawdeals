import { useMemo, useReducer, useCallback } from "react";

import ChannelsToolbar from "./ChannelsToolbar";
import ChannelsList from "./ChannelsList";
import { useChannelIdentities } from "./useChannelIdentities";
import { usePairingCodeLookup } from "./usePairingCodeLookup";
import { useChannelIdentityAction } from "./useChannelIdentityAction";
import { useTelegramPairStart } from "./useTelegramPairStart";
import SkeletonTable from "../shared/SkeletonTable";
import EmptyState from "../shared/EmptyState";
import ErrorState from "../shared/ErrorState";
import ConfirmModal from "../shared/ConfirmModal";
import Toast from "../shared/Toast";
import { useToast } from "../shared/useToast";
import TruncatedId from "../shared/TruncatedId";
import ConsoleStatusBadge from "../shared/ConsoleStatusBadge";
import { formatDate } from "../shared/formatDate";
import PageHeader from "../../shared/PageHeader";

type PendingAction = "approve" | "deny" | "revoke";

type ChannelsUiState = {
  approveRole: string;
  pairingCode: string;
  confirmOpen: boolean;
  pendingAction: PendingAction | null;
  selectedIdentity: any | null;
};

type ChannelsUiAction = {
  type: "patch";
  patch: Partial<ChannelsUiState>;
};

const INITIAL_UI_STATE: ChannelsUiState = {
  approveRole: "approver",
  pairingCode: "",
  confirmOpen: false,
  pendingAction: null,
  selectedIdentity: null
};

function channelsUiReducer(state: ChannelsUiState, action: ChannelsUiAction): ChannelsUiState {
  if (action.type === "patch") {
    return { ...state, ...action.patch };
  }
  return state;
}

export default function ChannelsPage() {
  const { toasts, show } = useToast();
  const [uiState, dispatch] = useReducer(channelsUiReducer, INITIAL_UI_STATE);

  const { start: startTelegramPairing, startState: telegramStartState, error: telegramStartError } = useTelegramPairStart();

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

  const openConfirm = useCallback((identity: any, action: PendingAction) => {
    dispatch({
      type: "patch",
      patch: {
        selectedIdentity: identity,
        pendingAction: action,
        confirmOpen: true
      }
    });
  }, []);

  const closeConfirm = useCallback(() => {
    if (submitState === "loading") return;
    dispatch({
      type: "patch",
      patch: {
        confirmOpen: false,
        pendingAction: null,
        selectedIdentity: null
      }
    });
  }, [submitState]);

  const confirmCopy = useMemo(() => {
    if (!uiState.pendingAction || !uiState.selectedIdentity) {
      return { title: "Confirm", message: "Confirm action", confirmLabel: "Confirm", variant: "default" as const };
    }
    if (uiState.pendingAction === "approve") {
      return {
        title: "Approve pairing",
        message: `Activate this identity with role=${uiState.approveRole}?`,
        confirmLabel: "Approve",
        variant: "success" as const
      };
    }
    if (uiState.pendingAction === "deny") {
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
  }, [uiState.pendingAction, uiState.selectedIdentity, uiState.approveRole]);

  const onConfirm = useCallback(async () => {
    if (!uiState.pendingAction || !uiState.selectedIdentity) return;
    const channelIdentityId = uiState.selectedIdentity.channel_identity_id;
    await execute({
      channelIdentityId,
      action: uiState.pendingAction,
      role: uiState.pendingAction === "approve" ? uiState.approveRole : undefined
    });
    closeConfirm();
  }, [uiState.pendingAction, uiState.selectedIdentity, uiState.approveRole, execute, closeConfirm]);

  const onLookupCode = useCallback(async () => {
    const result: any = await lookup(uiState.pairingCode);
    if (result && result.ok === false) {
      show(result.error || "Lookup failed", "error");
    }
  }, [lookup, uiState.pairingCode, show]);

  const onConnectTelegram = useCallback(async () => {
    const result: any = await startTelegramPairing();
    if (!result?.ok) {
      show(result?.error || "Failed to start Telegram pairing", "error");
      return;
    }
    try {
      window.location.assign(result.telegram_deeplink);
    } catch {
      show("Redirect failed", "error");
    }
  }, [startTelegramPairing, show]);

  const onApprove = useCallback((identity: any) => openConfirm(identity, "approve"), [openConfirm]);
  const onDeny = useCallback((identity: any) => openConfirm(identity, "deny"), [openConfirm]);
  const onRevoke = useCallback((identity: any) => openConfirm(identity, "revoke"), [openConfirm]);

  const effectiveError = actionError || telegramStartError || lookupError || error;

  return (
    <div data-testid="channels-page" className="min-h-screen bg-bg">
      <PageHeader title="CHANNELS" />

      <main id="main-content" tabIndex={-1} className="w-full px-4 py-6 space-y-6">
        <ChannelsToolbar
          state={state}
          onStateChange={setState}
          channelType={channelType}
          onChannelTypeChange={setChannelType}
          approveRole={uiState.approveRole}
          onApproveRoleChange={(value) => dispatch({ type: "patch", patch: { approveRole: value } })}
          pairingCode={uiState.pairingCode}
          onPairingCodeChange={(value) => dispatch({ type: "patch", patch: { pairingCode: value } })}
          lookupAction={{
            onLookup: onLookupCode,
            state: lookupState === "loading" ? "loading" : "idle"
          }}
          telegramConnectAction={{
            onConnect: onConnectTelegram,
            state: telegramStartState === "loading" ? "loading" : "idle"
          }}
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
                    Approve (role={uiState.approveRole})
                  </button>
                  <button
                    onClick={() => onDeny(lookupIdentity)}
                    className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-error/40 text-error rounded hover:bg-error/10 transition-colors"
                  >
                    Deny
                  </button>
                </>
              )}
              {lookupIdentity.state === "ACTIVE" && (
                <button
                  onClick={() => onRevoke(lookupIdentity)}
                  className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-error/40 text-error rounded hover:bg-error/10 transition-colors"
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
        open={uiState.confirmOpen}
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
