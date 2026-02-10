const SORT_OPTIONS = [
  { value: "recent", label: "Recent" },
  { value: "price_asc", label: "Price Low" },
  { value: "price_desc", label: "Price High" },
];

const STATUS_OPTIONS = [
  "LIVE",
  "PENDING_APPROVAL",
  "RESERVED",
  "CONTACT_REVEALED",
  "COMPLETED",
  "DRAFT",
  "REMOVED",
  "EXPIRED",
];
const CONDITION_OPTIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"];

interface Props {
  sort: string;
  onSortChange: (s: string) => void;
  status: string | null;
  onStatusChange: (s: string | null) => void;
  condition: string | null;
  onConditionChange: (c: string | null) => void;
  q: string;
  onSearchChange: (q: string) => void;
  priceMin: string;
  onPriceMinChange: (v: string) => void;
  priceMax: string;
  onPriceMaxChange: (v: string) => void;
}

export default function ListingsToolbar({
  sort, onSortChange,
  status, onStatusChange,
  condition, onConditionChange,
  q, onSearchChange,
  priceMin, onPriceMinChange,
  priceMax, onPriceMaxChange,
}: Props) {
  return (
    <div data-testid="listings-toolbar" className="space-y-3">
      {/* Sort pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Sort:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSortChange(opt.value)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-colors ${
              sort === opt.value
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative max-w-sm">
        <input
          data-testid="listings-search"
          type="text"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search listings…"
          aria-label="Search listings"
          name="q"
          autoComplete="off"
          spellCheck={false}
          className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
        />
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

      {/* Condition pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-[10px] font-mono text-subtle uppercase mr-1">Condition:</span>
        <button
          onClick={() => onConditionChange(null)}
          className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-colors ${
            condition === null
              ? "border-secondary/40 text-secondary bg-secondary/10"
              : "border-border text-subtle hover:border-border-strong"
          }`}
        >
          All
        </button>
        {CONDITION_OPTIONS.map((c) => (
          <button
            key={c}
            onClick={() => onConditionChange(condition === c ? null : c)}
            className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border transition-colors ${
              condition === c
                ? "border-secondary/40 text-secondary bg-secondary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Price range */}
      <div className="flex gap-2 items-center max-w-xs">
        <span className="text-[10px] font-mono text-subtle uppercase shrink-0">Price:</span>
        <input
          data-testid="listings-price-min"
          type="number"
          inputMode="numeric"
          value={priceMin}
          onChange={(e) => onPriceMinChange(e.target.value)}
          placeholder="Min"
          aria-label="Minimum price"
          name="price_min"
          autoComplete="off"
          className="w-20 px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
        />
        <span className="text-[10px] font-mono text-subtle">-</span>
        <input
          data-testid="listings-price-max"
          type="number"
          inputMode="numeric"
          value={priceMax}
          onChange={(e) => onPriceMaxChange(e.target.value)}
          placeholder="Max"
          aria-label="Maximum price"
          name="price_max"
          autoComplete="off"
          className="w-20 px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
        />
      </div>
    </div>
  );
}
