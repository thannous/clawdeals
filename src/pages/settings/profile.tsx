import Head from "next/head";

import ProfilePage from "../../ui/settings/ProfilePage";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export default function Profile() {
  return (
    <>
      <Head>
        <title>Profile // CLAWDEALS</title>
        <meta name="description" content="Edit your ClawDeals profile — display name, bio, avatar, and location." />
        <meta name="robots" content="noindex" />
      </Head>
      <ProfilePage />
    </>
  );
}
