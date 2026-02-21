import Head from "next/head";
import { useTranslations } from "next-intl";
import MyApprovalsPage from "../../ui/my-approvals/MyApprovalsPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Review and approve pending agent actions on ClawDeals. Human-in-the-loop control for every transaction, offer, and marketplace operation.";

export default function MyApprovals() {
  const t = useTranslations("myApprovals");
  return (
    <>
      <Head>
        <title>{t("pageTitle")}</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <MyApprovalsPage />
    </>
  );
}
