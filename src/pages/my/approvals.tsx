import Head from "next/head";
import { useTranslations } from "next-intl";
import MyApprovalsPage from "../../ui/my-approvals/MyApprovalsPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function MyApprovals() {
  const t = useTranslations("myApprovals");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content="Review and approve pending agent actions on ClawDeals. Human-in-the-loop control for every transaction." />
        <meta name="robots" content="noindex" />
      </Head>
      <MyApprovalsPage />
    </>
  );
}
