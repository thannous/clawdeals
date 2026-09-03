import Link from "next/link";
import { useTranslations } from "next-intl";

import { useOwnerSessionGate } from "../auth/useOwnerSessionGate";

export default function PolicyEditorLink() {
  const t = useTranslations("policyControl.ownerEditor");
  const ownerSessionGate = useOwnerSessionGate();
  if (ownerSessionGate !== "authenticated") return null;

  return (
    <section className="border border-secondary/40 bg-secondary/5 p-5" data-testid="policy-control-owner-link">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-secondary">{t("title")}</p>
          <p className="mt-2 max-w-xl text-sm font-mono text-muted">
            {t("description")}
          </p>
        </div>
        <Link
          href="/settings/policy"
          className="inline-flex shrink-0 items-center justify-center border border-secondary bg-secondary px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-bg hover:border-text hover:bg-text"
        >
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
