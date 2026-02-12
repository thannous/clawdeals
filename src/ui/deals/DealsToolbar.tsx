import { Search, X, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

const SORT_OPTIONS = [
  { value: "new", label: "NEW" },
  { value: "temp", label: "TEMP" },
  { value: "trend", label: "TREND" }
];

const STATUS_OPTIONS = ["NEW", "ACTIVE", "EXPIRED"];

export default function DealsToolbar({ sort, onSortChange, statuses, onStatusChange, q, onSearchChange, tags, onTagRemove }) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggleStatus = (status) => {
    const current = new Set(statuses);
    if (current.has(status)) {
      current.delete(status);
    } else {
      current.add(status);
    }
    onStatusChange(Array.from(current));
  };

  const isStatusLocked = sort === "temp" || sort === "trend";

  return (
    <div data-testid="deals-toolbar" className="space-y-3">
      {/* Top row: Sort + Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        {/* Sort tabs */}
        <div className="flex gap-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              data-testid={`sort-${opt.value}`}
              onClick={() => onSortChange(opt.value)}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase rounded border transition-colors ${
                sort === opt.value
                  ? "border-primary text-primary bg-primary/10 shadow-[0_0_8px_rgb(var(--theme-primary-rgb)/0.2)]"
                  : "border-border text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            data-testid="search-input"
            type="text"
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search deals…"
            aria-label="Search deals"
            name="q"
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>

        {/* Mobile filter toggle */}
        <button
          data-testid="filters-toggle"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-label="Toggle filters"
          className="sm:hidden px-3 py-1.5 text-xs font-mono border border-border rounded text-muted hover:text-text"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {/* Filters row (collapsible on mobile) */}
      <div className={`flex flex-wrap gap-2 items-center ${filtersOpen ? "" : "hidden sm:flex"}`}>
        {/* Status pills */}
        <span className="text-xs font-mono text-subtle uppercase mr-1">Status:</span>
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            data-testid={`status-filter-${status}`}
            onClick={() => !isStatusLocked && toggleStatus(status)}
            disabled={isStatusLocked}
            className={`px-2 py-0.5 text-xs font-mono font-bold uppercase rounded border transition-colors ${
              statuses.includes(status)
                ? "border-secondary text-secondary bg-secondary/10"
                : "border-border text-subtle hover:border-border-strong"
            } ${isStatusLocked ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {status}
          </button>
        ))}

        {/* Active tags */}
        {tags?.length > 0 && (
          <>
            <span className="text-xs font-mono text-subtle uppercase ml-2 mr-1">Tags:</span>
            {tags.map((tag) => (
              <button
                key={tag}
                data-testid={`tag-pill-${tag}`}
                onClick={() => onTagRemove(tag)}
                className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded bg-surface-alt text-muted hover:text-text border border-border transition-colors"
              >
                {tag}
                <X size={10} />
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
