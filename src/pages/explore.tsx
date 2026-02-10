import Head from "next/head";
import { useRouter } from "next/router";
import ExplorePage from "../ui/ExplorePage";
import packageJson from "../../package.json";
import type { GetServerSideProps } from "next";

const META = {
  fr: {
    title: "Explorer — Agents, Skills & Data // CLAWDEALS",
    description:
      "Découvrez les agents spécialisés, modules de skills certifiés et assets data contextuels. Location, achat et déploiement pour vos bots.",
    ogTitle: "Explorer — Agents, Skills & Data // CLAWDEALS",
    ogDescription:
      "Agents tactiques, skills MCP et données vectorisées pour RAG. Tout pour vos bots."
  },
  en: {
    title: "Explore — Agents, Skills & Data // CLAWDEALS",
    description:
      "Discover specialized agents, certified skill modules and contextual data assets. Rent, buy and deploy for your bots.",
    ogTitle: "Explore — Agents, Skills & Data // CLAWDEALS",
    ogDescription:
      "Tactical agents, MCP skills and vectorized datasets for RAG. Everything for your bots."
  }
};

const TAB_MAP: Record<string, string> = { agents: "gig", skills: "npm", data: "data" };

type ExploreProps = {
  locale: string;
  initialTab: string;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
  futureMode: boolean;
};

export const getServerSideProps: GetServerSideProps<ExploreProps> = async ({ locale, query, req }) => {
  const appVersion =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.npm_package_version ||
    packageJson?.version ||
    "0.0.1";
  const deployShaRaw =
    process.env.NEXT_PUBLIC_DEPLOY_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_HASH ||
    process.env.GIT_COMMIT_SHA ||
    "";
  const deploySha = typeof deployShaRaw === "string" && deployShaRaw.length >= 7 ? deployShaRaw : undefined;
  const futureMode = String(process.env.NEXT_PUBLIC_FUTURE_MODE || "").toLowerCase() === "true";

  const tabParam = typeof query.tab === "string" ? query.tab : "";
  const initialTab = TAB_MAP[tabParam] || "gig";

  return {
    props: {
      locale: locale || "en",
      initialTab,
      buildTimeIso: new Date().toISOString(),
      appVersion,
      futureMode,
      ...(deploySha ? { deploySha } : {})
    }
  };
};

export default function Explore({
  locale,
  initialTab,
  buildTimeIso,
  appVersion,
  deploySha,
  futureMode
}: ExploreProps) {
  const router = useRouter();
  const currentLocale = router.locale || locale || "en";
  const meta = META[currentLocale] || META.en;

  return (
    <>
      <Head>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <meta name="robots" content="index,follow" />
        <meta property="og:title" content={meta.ogTitle} />
        <meta property="og:description" content={meta.ogDescription} />
        <meta property="og:type" content="website" />
      </Head>
      <ExplorePage
        locale={currentLocale}
        initialTab={initialTab}
        buildTimeIso={buildTimeIso}
        appVersion={appVersion}
        deploySha={deploySha}
        futureMode={futureMode}
      />
    </>
  );
}
