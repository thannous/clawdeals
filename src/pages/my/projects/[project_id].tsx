import Head from "next/head";
import { useTranslations } from "next-intl";
import ProjectDetailPage from "../../../ui/project-missions/ProjectDetailPage";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export default function ProjectPage() {
  const t = useTranslations("projectMissions");
  return <><Head><title>{`${t("detailTitle")} · ClawDeals`}</title><meta name="robots" content="noindex" /></Head><ProjectDetailPage /></>;
}
