import Head from "next/head";
import { useTranslations } from "next-intl";
import NewProjectPage from "../../../ui/project-missions/NewProjectPage";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export default function ProjectPage() {
  const t = useTranslations("projectMissions");
  return <><Head><title>{`${t("newTitle")} · ClawDeals`}</title><meta name="robots" content="noindex" /></Head><NewProjectPage /></>;
}
