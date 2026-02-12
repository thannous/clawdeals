const STATE_OPTIONS = ["PENDING", "ACTIVE", "REVOKED"];
const CHANNEL_TYPE_OPTIONS = ["", "telegram", "discord", "whatsapp"];
const ROLE_OPTIONS = ["viewer", "approver", "owner"];

interface Props {
  state: string;
  onStateChange: (s: string) => void;
  channelType: string;
  onChannelTypeChange: (v: string) => void;
  approveRole: string;
  onApproveRoleChange: (v: string) => void;
  pairingCode: string;
  onPairingCodeChange: (v: string) => void;
  onLookupCode: () => void;
  lookupDisabled?: boolean;
  onConnectTelegram?: () => void;
  connectTelegramDisabled?: boolean;
  connectTelegramLoading?: boolean;
}

export default function ChannelsToolbar({
  state,
  onStateChange,
  channelType,
  onChannelTypeChange,
  approveRole,
  onApproveRoleChange,
  pairingCode,
  onPairingCodeChange,
  onLookupCode,
  lookupDisabled = false,
  onConnectTelegram,
  connectTelegramDisabled = false,
  connectTelegramLoading = false,
}: Props) {
  return (
    <div data-testid="channels-toolbar" className="space-y-4">
      {/* State pills */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-mono text-subtle uppercase mr-1">State:</span>
          {STATE_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onStateChange(s)}
              className={`px-2 py-0.5 text-xs font-mono font-bold rounded border transition-colors ${
                state === s
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-border text-subtle hover:border-border-strong"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {onConnectTelegram && (
          <button
            data-testid="channels-connect-telegram"
            disabled={connectTelegramDisabled || connectTelegramLoading}
            onClick={onConnectTelegram}
            className="px-4 py-1.5 text-xs font-mono font-bold uppercase border border-primary text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {connectTelegramLoading ? "Starting…" : "Connect Telegram"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Channel type select */}
        <div>
          <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="channels-channel-type">
            Channel
          </label>
          <select
            id="channels-channel-type"
            data-testid="channels-channel-type"
            name="channel_type"
            value={channelType}
            onChange={(e) => onChannelTypeChange(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          >
            {CHANNEL_TYPE_OPTIONS.map((opt) => (
              <option key={opt || "all"} value={opt}>
                {opt ? opt : "all"}
              </option>
            ))}
          </select>
        </div>

        {/* Default approve role */}
        <div>
          <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="channels-approve-role">
            Approve Role
          </label>
          <select
            id="channels-approve-role"
            data-testid="channels-approve-role"
            name="approve_role"
            value={approveRole}
            onChange={(e) => onApproveRoleChange(e.target.value)}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          >
            {ROLE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Pairing code lookup */}
        <div>
          <label className="block text-xs font-mono text-subtle uppercase mb-1" htmlFor="channels-pairing-code">
            Find by Pairing Code
          </label>
          <div className="flex items-center gap-2">
            <input
              id="channels-pairing-code"
              data-testid="channels-pairing-code"
              type="text"
              value={pairingCode}
              onChange={(e) => onPairingCodeChange(e.target.value)}
              placeholder="CD-XXXXXX"
              aria-label="Pairing code"
              name="pairing_code"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
            />
            <button
              disabled={lookupDisabled}
              onClick={onLookupCode}
              className="px-3 py-1.5 text-xs font-mono font-bold uppercase border border-border rounded text-muted hover:border-border-strong hover:text-text transition-colors disabled:opacity-50"
            >
              Find
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
