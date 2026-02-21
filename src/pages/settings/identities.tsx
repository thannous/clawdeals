import Head from "next/head";

import IdentitiesPage from "../../ui/settings/IdentitiesPage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Link and manage your verified identities on ClawDeals. Connect email, phone, and other verification methods to strengthen your trust profile.";

export default function Identities() {
  return (
    <>
      <Head>
        <title>Linked Identities // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <IdentitiesPage />
    </>
  );
}
