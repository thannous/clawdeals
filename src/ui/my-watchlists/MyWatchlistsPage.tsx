import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslations } from "next-intl";
import { BellRing, Trash2 } from "lucide-react";

import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";
import EmptyState from "../console/shared/EmptyState";
import ErrorState from "../console/shared/ErrorState";
import { useMyWatchlists } from "./useMyWatchlists";

function formatPrice(value: number | null, currency: string | null, locale: string) {
  if (value === null || !currency) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export default function MyWatchlistsPage() {
  const t = useTranslations("myWatchlists");
  const router = useRouter();
  const { items, state, error, removingId, load, remove } = useMyWatchlists();

  return (
    <div data-testid="my-watchlists-page" className="min-h-screen bg-bg">
      <PageHeader title={t("title")}>
        <AppNav current="watchlists" />
      </PageHeader>

      <main id="main-content" tabIndex={-1} className="w-full max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="border border-secondary/30 bg-secondary/5 p-4 flex items-start gap-3">
          <BellRing className="w-5 h-5 text-secondary shrink-0" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold text-text">{t("alertTitle")}</h2>
            <p className="text-xs font-mono text-muted mt-1">{t("alertBody")}</p>
          </div>
        </div>

        {state === "loading" || state === "idle" ? (
          <p className="py-12 text-center text-xs font-mono text-subtle">{t("loading")}</p>
        ) : null}
        {state === "error" ? <ErrorState message={error || t("error")} onRetry={load} /> : null}
        {state === "done" && items.length === 0 ? (
          <EmptyState title={t("emptyTitle")} subtitle={t("emptyBody")} />
        ) : null}
        {items.length > 0 ? (
          <div className="grid gap-3" data-testid="owner-watchlists">
            {items.map((item) => (
              <article key={item.watchlist_id} className="border border-border bg-surface p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <Link href={`/browse/${item.listing_id}`} className="font-semibold text-text hover:text-primary transition-colors">
                    {item.title || t("listingFallback")}
                  </Link>
                  <p className="mt-1 text-xs font-mono text-subtle">
                    {item.market_code} · {t("lastSeenPrice", { price: formatPrice(item.last_price, item.currency, router.locale || "en") })}
                  </p>
                  <p className="mt-1 text-xs font-mono text-secondary">{t("active")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(item.watchlist_id)}
                  disabled={removingId === item.watchlist_id}
                  className="inline-flex items-center justify-center gap-2 border border-border px-3 py-2 text-xs font-mono font-bold uppercase text-muted hover:border-error hover:text-error disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {removingId === item.watchlist_id ? t("removing") : t("remove")}
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
