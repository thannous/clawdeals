import Head from "next/head";
import { useTranslations } from "next-intl";
import ProjectListPage from "../../../ui/project-missions/ProjectListPage";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export default function ProjectPage() {
  const t = useTranslations("projectMissions");
  return <><Head><title>{`${t("title")} · ClawDeals`}</title><meta name="robots" content="noindex" /></Head><ProjectListPage /></>;
}
