import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";

import { buildAskMyAgentHref, type ListingActionTarget } from "../../browse/ListingHumanActions";

type CardState = { status: "loading" } | { status: "ready"; listing: ListingActionTarget } | { status: "empty" };

/**
 * The first concrete thing to do once a key exists: open a Deal Mission prefilled
 * from a real listing instead of leaving the visitor with a snippet.
 */
export default function FirstMissionCard({ localePrefix = "" }: { localePrefix?: string }) {
  const t = useTranslations("connect");
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/public/listings?limit=1&sort=recent", { signal: controller.signal })
      .then(async (resp) => (resp.ok ? resp.json() : null))
      .then((body) => {
        if (controller.signal.aborted) return;
        const listing = Array.isArray(body?.data) ? body.data[0] : null;
        setState(listing?.listing_id ? { status: "ready", listing } : { status: "empty" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "empty" });
      });
    return () => controller.abort();
  }, []);

  const href = state.status === "ready" ? buildAskMyAgentHref(localePrefix, state.listing) : `${localePrefix}/browse`;

  return (
    <div className="border border-primary/40 bg-primary/5 p-5 clip-corner space-y-3" data-testid="first-mission-card">
      <div className="text-[11px] font-mono text-primary uppercase tracking-widest">{t("step.firstwin.firstMission.eyebrow")}</div>
      <div className="text-lg font-bold tracking-tight">{t("step.firstwin.firstMission.title")}</div>
      <p className="text-sm text-muted leading-relaxed">
        {state.status === "ready"
          ? t("step.firstwin.firstMission.readyDesc", { title: state.listing.title || "" })
          : t("step.firstwin.firstMission.browseDesc")}
      </p>
      <Link
        href={href}
        data-testid="first-mission-cta"
        className="inline-flex items-center gap-2 border border-primary bg-primary text-bg px-5 py-2.5 text-xs font-bold uppercase tracking-widest hover:bg-text hover:border-text transition-colors"
      >
        <Bot className="w-4 h-4" aria-hidden="true" />
        {state.status === "ready" ? t("step.firstwin.firstMission.cta") : t("step.firstwin.firstMission.browseCta")}
      </Link>
    </div>
  );
}
