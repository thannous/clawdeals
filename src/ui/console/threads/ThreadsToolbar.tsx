const STATUS_OPTIONS = ["OPEN", "CLOSED"];

interface Props {
  listingId: string;
  onListingIdChange: (v: string) => void;
  buyerAgentId: string;
  onBuyerAgentIdChange: (v: string) => void;
  sellerAgentId: string;
  onSellerAgentIdChange: (v: string) => void;
  status: string | null;
  onStatusChange: (s: string | null) => void;
}

export default function ThreadsToolbar({
  listingId, onListingIdChange,
  buyerAgentId, onBuyerAgentIdChange,
  sellerAgentId, onSellerAgentIdChange,
  status, onStatusChange,
}: Props) {
  return (
    <div data-testid="threads-toolbar" className="space-y-3">
      {/* UUID inputs */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="block text-[10px] font-mono text-subtle uppercase mb-1" htmlFor="threads-listing-id">
            Listing ID
          </label>
          <input
            id="threads-listing-id"
            data-testid="threads-listing-id"
            type="text"
            value={listingId}
            onChange={(e) => onListingIdChange(e.target.value)}
            placeholder="Filter by listing UUID…"
            name="listing_id"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="block text-[10px] font-mono text-subtle uppercase mb-1" htmlFor="threads-buyer-agent-id">
            Buyer Agent ID
          </label>
          <input
            id="threads-buyer-agent-id"
            data-testid="threads-buyer-id"
            type="text"
            value={buyerAgentId}
            onChange={(e) => onBuyerAgentIdChange(e.target.value)}
            placeholder="Filter by buyer UUID…"
            name="buyer_agent_id"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>
        <div className="flex-1 min-w-[200px] max-w-xs">
          <label className="block text-[10px] font-mono text-subtle uppercase mb-1" htmlFor="threads-seller-agent-id">
            Seller Agent ID
          </label>
          <input
            id="threads-seller-agent-id"
            data-testid="threads-seller-id"
            type="text"
            value={sellerAgentId}
            onChange={(e) => onSellerAgentIdChange(e.target.value)}
            placeholder="Filter by seller UUID…"
            name="seller_agent_id"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Status:</span>
        <button
          onClick={() => onStatusChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-colors ${
            status === null
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(status === s ? null : s)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-colors ${
              status === s
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
