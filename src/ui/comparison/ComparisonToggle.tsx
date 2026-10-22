import { useTranslations } from "next-intl";
import { isSmartphoneListing } from "../../lib/smartphone-passport";
import { toggleComparisonSelection, useComparisonSelection } from "./selection";

export default function ComparisonToggle({ listing }: { listing: { listing_id: string; title?: string; category?: string } }) {
  const t = useTranslations("comparison");
  const selected = useComparisonSelection();
  const active = selected.some((item) => item.listing_id === listing.listing_id);
  const full = selected.length >= 3 && !active;
  if (!isSmartphoneListing(listing.category, listing.title) && listing.category?.toLowerCase() !== "electronics") return null;
  const title = (listing.title || "").replace(/[\u0000-\u001f]/g, " ").slice(0, 240);
  return <button type="button" data-testid={`comparison-toggle-${listing.listing_id}`} aria-pressed={active} aria-label={t(active ? "removeNamed" : "addNamed", { title })} disabled={full} onClick={() => toggleComparisonSelection({ listing_id: listing.listing_id, title })} className={`w-full rounded border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted hover:border-primary hover:text-primary"}`}>{t(active ? "selected" : full ? "maximumReached" : "add")}</button>;
}
