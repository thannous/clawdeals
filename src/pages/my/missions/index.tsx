import Head from "next/head";
import { useTranslations } from "next-intl";
import MyMissionsPage from "../../../ui/my-missions/MyMissionsPage";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export default function MissionPage() {
  const t = useTranslations("myMissions");
  return <><Head><title>{`${t("title")} · ClawDeals`}</title><meta name="robots" content="noindex" /></Head><MyMissionsPage /></>;
}
