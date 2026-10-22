import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { removeComparisonSelection, useComparisonSelection } from "./selection";

export default function ComparisonTray() {
  const t = useTranslations("comparison");
  const { locale } = useRouter();
  const selected = useComparisonSelection();
  if (!selected.length) return null;
  return <aside data-testid="comparison-tray" aria-label={t("selectionTitle")} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface px-4 py-3 shadow-lg">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">{t("selectionCount", { count: selected.length })}</p>
        <ul className="mt-2 flex flex-wrap gap-2">{selected.map((item) => <li key={item.listing_id} data-testid={`comparison-selected-${item.listing_id}`} className="flex min-w-0 max-w-full items-center gap-2 rounded border border-border bg-bg px-2 py-1 text-xs text-muted"><span className="max-w-40 truncate">{item.title || t("itemFallback")}</span><button type="button" data-testid={`comparison-remove-${item.listing_id}`} aria-label={t("removeNamed", { title: item.title || t("itemFallback") })} onClick={() => removeComparisonSelection(item.listing_id)} className="px-1 text-base leading-none text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-primary">×</button></li>)}</ul>
        <p data-testid={selected.length === 3 ? "comparison-limit" : undefined} className="mt-2 text-xs text-muted">{t(selected.length === 3 ? "limitHint" : "selectionHint")}</p>
      </div>
      {selected.length >= 2 ? <Link data-testid="comparison-open" href={{ pathname: "/browse/compare", query: { ids: selected.map((item) => item.listing_id).join(",") } }} locale={locale} className="rounded border border-primary bg-primary px-5 py-2.5 text-sm font-semibold text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("open")}</Link> : <button data-testid="comparison-open" type="button" disabled className="rounded border border-border px-5 py-2.5 text-sm font-semibold text-muted opacity-60">{t("chooseSecond")}</button>}
    </div>
  </aside>;
}
