import Head from "next/head";

import IdentitiesPage from "../../ui/settings/IdentitiesPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Identities() {
  return (
    <>
      <Head>
        <title>Linked Identities // CLAWDEALS</title>
        <meta name="description" content="Link and manage your verified identities on ClawDeals. Connect email, phone, and other verification methods." />
        <meta name="robots" content="noindex" />
      </Head>
      <IdentitiesPage />
    </>
  );
}
