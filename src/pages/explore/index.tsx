import type { GetServerSideProps } from "next";

const VALID_TABS = new Set(["agents", "skills", "data"]);

export const getServerSideProps: GetServerSideProps = async ({ query, locale }) => {
  const tabParam = typeof query.tab === "string" ? query.tab : "";
  const tab = VALID_TABS.has(tabParam) ? tabParam : "agents";
  const prefix = locale === "fr" ? "/fr" : "";

  return {
    redirect: {
      destination: `${prefix}/explore/${tab}`,
      permanent: true
    }
  };
};

export default function ExploreIndex() {
  return null;
}
