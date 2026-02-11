import Head from "next/head";

import IdentitiesPage from "../../ui/settings/IdentitiesPage";

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
