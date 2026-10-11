import Head from "next/head";
import { useTranslations } from "next-intl";
import MissionDetailPage from "../../../ui/my-missions/MissionDetailPage";

export { getI18nServerSideProps as getServerSideProps } from "../../../shared/i18n";

export default function MissionPage() {
  const t = useTranslations("myMissions");
  return <><Head><title>{`${t("detailTitle")} · ClawDeals`}</title><meta name="robots" content="noindex" /></Head><MissionDetailPage /></>;
}
