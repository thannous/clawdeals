import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import AppNav from "../shared/AppNav";
import PageHeader from "../shared/PageHeader";

export const inputClass = "mt-2 w-full border border-border bg-bg px-3 py-3 text-text focus:outline-none focus:ring-2 focus:ring-primary";
export const buttonClass = "inline-flex min-h-11 items-center justify-center border border-primary bg-primary px-5 py-3 font-semibold text-bg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";
export const secondaryClass = "inline-flex min-h-11 items-center justify-center border border-border px-4 py-3 text-text disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";

export default function ProjectShell({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations("projectMissions");
  return <div className="min-h-screen bg-bg" data-testid="project-mission-page">
    <PageHeader title={title}><AppNav current="missions" /></PageHeader>
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <nav className="flex flex-wrap gap-5 text-sm text-primary" aria-label={t("navigation")}>
        <Link className="underline underline-offset-4" href="/my/missions">{t("allMissions")}</Link>
        <Link className="underline underline-offset-4" href="/my/projects">{t("title")}</Link>
      </nav>
      {children}
    </main>
  </div>;
}

export function ProjectFailure({ retry, code }: { retry?: () => void; code?: string }) {
  const t = useTranslations("projectMissions");
  const key = code === "PROJECT_DEADLINE_EXPIRED" ? "deadlineExpired" : code === "OWNER_SESSION_CHANGED" ? "sessionChanged" : code === "VERSION_CONFLICT" || code === "CATALOG_CHANGED" ? "catalogChanged" : "loadError";
  return <div role="alert" className="space-y-3 border border-warning p-4 text-warning">
    <p>{t(key)}</p>
    {retry ? <button className="min-h-11 underline" onClick={retry}>{t("retry")}</button> : null}
  </div>;
}
