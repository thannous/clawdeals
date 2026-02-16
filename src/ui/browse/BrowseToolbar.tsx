import { Search, SlidersHorizontal, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

const SORT_OPTIONS = [
  { value: "recent", key: "recent" },
  { value: "price_asc", key: "priceAsc" },
  { value: "price_desc", key: "priceDesc" },
] as const;

const CONDITION_OPTIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "POOR"];

type BrowseToolbarProps = {
  sort: string;
  onSortChange: (sort: string) => void;
  q: string;
  onSearchChange: (q: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  condition: string;
  onConditionChange: (condition: string) => void;
  priceMin: string;
  onPriceMinChange: (val: string) => void;
  priceMax: string;
  onPriceMaxChange: (val: string) => void;
};

export default function BrowseToolbar({
  sort,
  onSortChange,
  q,
  onSearchChange,
  category,
  onCategoryChange,
  condition,
  onConditionChange,
  priceMin,
  onPriceMinChange,
  priceMax,
  onPriceMaxChange,
}: BrowseToolbarProps) {
  const t = useTranslations("browse");
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div data-testid="browse-toolbar" className="space-y-3">
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
              {t(`sort.${opt.key}`)}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            data-testid="browse-search"
            type="text"
            value={q}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            autoComplete="off"
            spellCheck={false}
            className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-colors"
          />
        </div>

        {/* Mobile filter toggle */}
        <button
          data-testid="browse-filters-toggle"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-label={t("filters")}
          className="sm:hidden px-3 py-1.5 text-xs font-mono border border-border rounded text-muted hover:text-text"
        >
          <SlidersHorizontal size={14} />
        </button>
      </div>

      {/* Filters row */}
      <div className={`flex flex-wrap gap-2 items-center ${filtersOpen ? "" : "hidden sm:flex"}`}>
        {/* Category */}
        <input
          data-testid="browse-category"
          type="text"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          placeholder={t("categoryPlaceholder")}
          className="w-40 px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none transition-colors"
        />

        {/* Condition pills */}
        <span className="text-xs font-mono text-subtle uppercase mr-1">{t("condition")}:</span>
        {CONDITION_OPTIONS.map((c) => (
          <button
            key={c}
            data-testid={`condition-${c}`}
            onClick={() => onConditionChange(condition === c ? "" : c)}
            className={`px-2 py-0.5 text-xs font-mono font-bold uppercase rounded border transition-colors ${
              condition === c
                ? "border-secondary text-secondary bg-secondary/10"
                : "border-border text-subtle hover:border-border-strong"
            }`}
          >
            {t(`conditions.${c}`)}
          </button>
        ))}

        {/* Price range */}
        <span className="text-xs font-mono text-subtle uppercase ml-2 mr-1">{t("priceRange")}:</span>
        <input
          data-testid="browse-price-min"
          type="number"
          min="0"
          value={priceMin}
          onChange={(e) => onPriceMinChange(e.target.value)}
          placeholder={t("priceMin")}
          className="w-20 px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none transition-colors"
        />
        <span className="text-xs text-subtle">–</span>
        <input
          data-testid="browse-price-max"
          type="number"
          min="0"
          value={priceMax}
          onChange={(e) => onPriceMaxChange(e.target.value)}
          placeholder={t("priceMax")}
          className="w-20 px-2 py-1 text-xs font-mono bg-surface border border-border rounded text-text placeholder:text-subtle focus:border-primary focus-visible:outline-none transition-colors"
        />

        {/* Clear all filters */}
        {(category || condition || priceMin || priceMax) && (
          <button
            data-testid="browse-clear-filters"
            onClick={() => {
              onCategoryChange("");
              onConditionChange("");
              onPriceMinChange("");
              onPriceMaxChange("");
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono rounded text-error hover:text-text border border-error/40 hover:border-error transition-colors"
          >
            <X size={10} />
            {t("clearFilters")}
          </button>
        )}
      </div>
    </div>
  );
}
