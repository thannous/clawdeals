import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import ProjectShell, { buttonClass, ProjectFailure } from "./ProjectShell";
import { useProjectResource, type ProjectMission } from "./projectClient";

export default function ProjectListPage() {
  const t = useTranslations("projectMissions");
  const locale = useLocale();
  const { data, loading, error, reload } = useProjectResource<{ items: ProjectMission[] }>("");
  const money = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  return <ProjectShell title={t("title")}>
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="max-w-2xl space-y-2"><h2 className="text-2xl font-semibold text-text">{t("headline")}</h2><p className="text-muted">{t("intro")}</p></div>
      <Link className={buttonClass} href="/my/projects/new">{t("newTitle")}</Link>
    </div>
    {loading ? <p role="status" className="text-muted">{t("loading")}</p> : error ? <ProjectFailure code={error} retry={reload} /> : !data?.items.length ?
      <section className="space-y-3 border border-border bg-surface p-6"><h3 className="text-lg font-semibold text-text">{t("emptyTitle")}</h3><p className="max-w-2xl text-muted">{t("emptyHint")}</p></section> :
      <div className="space-y-3">{data.items.map(item => <article key={item.id} className="space-y-3 border border-border bg-surface p-5">
        <div className="flex flex-wrap justify-between gap-3"><Link href={`/my/projects/${item.id}`} className="min-w-0 max-w-full text-lg font-semibold text-text underline underline-offset-4 [overflow-wrap:anywhere]">{item.brief.description}</Link><span className="text-sm text-primary">{t(`status.${item.status}`)}</span></div>
        <p className="text-sm text-muted">{t("listSummary", { budget: money(item.brief.budget_cents), area: item.brief.location.label || t("selectedArea"), radius: item.brief.location.radius_km })}</p>
        <p className="text-sm text-muted">{t("configurationCount", { count: item.plan.configurations.length })}</p>
      </article>)}</div>}
  </ProjectShell>;
}
