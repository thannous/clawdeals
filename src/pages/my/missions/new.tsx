import Head from "next/head";
import { useTranslations } from "next-intl";
import NewMissionPage from "../../../ui/my-missions/NewMissionPage";

export { getI18nStaticProps as getStaticProps } from "../../../shared/i18n";

export default function MissionPage() {
  const t = useTranslations("myMissions");
  return <><Head><title>{`${t("newTitle")} · ClawDeals`}</title><meta name="robots" content="noindex" /></Head><NewMissionPage /></>;
}
