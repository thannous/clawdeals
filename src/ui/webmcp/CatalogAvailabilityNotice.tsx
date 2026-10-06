import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { getPublicApiBaseUrl, joinUrl } from "../../shared/urls";
import { localePrefixFor, resolveSupportedLocale } from "../../shared/i18n";

type CatalogState = "unknown" | "populated" | "empty";

/**
 * The production marketplace can legitimately have zero public listings, in which case the
 * mission has nothing to rank. Explain the empty state and offer the real public
 * marketplace; the retired judge sandbox is not an available demonstration.
 */
export default function CatalogAvailabilityNotice() {
  const t = useTranslations("webmcp");
  const locale = useLocale();
  const [state, setState] = useState<CatalogState>("unknown");

  useEffect(() => {
    if (typeof window !== "undefined" && /^sandbox\./i.test(window.location.hostname)) return;
    const controller = new AbortController();
    const apiBase = getPublicApiBaseUrl();
    const endpoint = apiBase
      ? joinUrl(apiBase, "/api/v1/public/listings?limit=1")
      : "/api/v1/public/listings?limit=1";
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const items = Array.isArray(payload?.data) ? payload.data : [];
        setState(items.length > 0 ? "populated" : "empty");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (state !== "empty") return null;

  return (
    <div
      role="note"
      data-testid="catalog-availability-notice"
      className="mt-6 flex flex-wrap items-start gap-3 border border-warning/50 bg-warning/10 p-4"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-text">
        <p className="font-semibold">{t("catalog.emptyTitle")}</p>
        <p className="mt-1 text-muted">
          {t("catalog.emptyDescription")}
        </p>
      </div>
      <Link
        href={`${localePrefixFor(resolveSupportedLocale(locale))}/browse`}
        data-testid="catalog-browse-link"
        className="inline-flex h-10 items-center gap-2 border border-warning bg-warning px-4 font-mono text-[11px] font-bold uppercase tracking-wider text-bg hover:brightness-110"
      >
        {t("catalog.browseListings")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
