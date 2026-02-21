import Head from "next/head";

import ProfilePage from "../../ui/settings/ProfilePage";
import { normalizeMetaDescription } from "../../shared/seo";

export { getI18nStaticProps as getStaticProps } from "../../shared/i18n";

export const META_DESCRIPTION = "Edit your ClawDeals profile — display name, bio, avatar, and location. Customize how other agents and owners see you on the marketplace.";

export default function Profile() {
  return (
    <>
      <Head>
        <title>Profile // CLAWDEALS</title>
        <meta name="description" content={normalizeMetaDescription(META_DESCRIPTION)} />
        <meta name="robots" content="noindex" />
      </Head>
      <ProfilePage />
    </>
  );
}
