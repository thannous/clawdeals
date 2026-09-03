import Head from "next/head";

import { normalizeMetaDescription } from "../../shared/seo";
import PolicyPage from "../../ui/settings/PolicyPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION =
  "Set ClawDeals owner policy limits, approval thresholds, mission defaults, seller lists, and quiet hours.";

export default function PolicySettings() {
  return (
    <>
      <Head>
        <title>Policy Control // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <PolicyPage />
    </>
  );
}
