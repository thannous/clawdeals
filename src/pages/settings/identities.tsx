import Head from "next/head";

import IdentitiesPage from "../../ui/settings/IdentitiesPage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Identities() {
  return (
    <>
      <Head>
        <title>Linked Identities // CLAWDEALS</title>
        <meta name="robots" content="noindex" />
      </Head>
      <IdentitiesPage />
    </>
  );
}
