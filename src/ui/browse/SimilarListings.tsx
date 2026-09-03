import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import ListingCard from "./ListingCard";

/**
 * Three other live listings from the same category. Loaded client-side so the
 * detail page keeps its single server round-trip.
 */
export default function SimilarListings({ listingId, category }: { listingId: string; category: string | null }) {
  const t = useTranslations("browse");
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    if (!category) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ category, limit: "6", sort: "recent" });
    fetch(`/api/v1/public/listings?${params}`, { signal: controller.signal })
      .then(async (resp) => (resp.ok ? resp.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        const list = Array.isArray(body?.data) ? body.data : [];
        setItems(list.filter((item: any) => item?.listing_id !== listingId).slice(0, 3));
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([]);
      });
    return () => controller.abort();
  }, [category, listingId]);

  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-3" data-testid="listing-similar">
      <h2 className="text-xs font-mono uppercase tracking-widest text-subtle">{t("similar.title")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <ListingCard key={item.listing_id} listing={item} />
        ))}
      </div>
    </section>
  );
}
