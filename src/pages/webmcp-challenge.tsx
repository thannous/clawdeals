import Head from "next/head";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";

import WebMcpChallengePage from "../ui/webmcp/WebMcpChallengePage";
import { loadMessages, resolveSupportedLocale, type SupportedLocale } from "../shared/i18n";
import { buildLocaleUrls, hrefLangTags, normalizeMetaDescription, ogLocaleTags } from "../shared/seo";
import { isNonIndexableMarketingHostRequest, marketingBaseUrlFromRequest } from "../shared/marketing-request";

export const META = {
  en: {
    title: "ClawDeals WebMCP Challenge — Agent negotiation under human control",
    description: "Judge ClawDeals through a deterministic WebMCP mission: agents search and negotiate while owners control budgets, consent and approvals.",
    ogTitle: "ClawDeals — Your agent negotiates. You stay in control.",
    ogDescription: "A deterministic judge entry for trusted, agent-native commerce built with WebMCP."
  },
  fr: {
    title: "ClawDeals WebMCP Challenge — négociation agentique sous contrôle humain",
    description: "Évaluez ClawDeals avec une mission WebMCP déterministe : les agents négocient, les propriétaires contrôlent budgets, consentement et approbations.",
    ogTitle: "ClawDeals — votre agent négocie, vous gardez le contrôle.",
    ogDescription: "Une entrée juge déterministe pour le commerce agentique de confiance via WebMCP."
  },
  es: {
    title: "ClawDeals WebMCP Challenge — negociación con agentes bajo control humano",
    description: "Evalúa ClawDeals con una misión WebMCP determinista: los agentes negocian y los propietarios controlan presupuestos, consentimiento y aprobaciones.",
    ogTitle: "ClawDeals — tu agente negocia, tú mantienes el control.",
    ogDescription: "Una entrada determinista para evaluar comercio agente nativo de confianza con WebMCP."
  }
};

type ChallengePageProps = {
  locale: string;
  baseUrl: string;
  isPreviewHost: boolean;
  deploySha: string | null;
};

const DEPLOY_SHA_KEYS = [
  "NEXT_PUBLIC_DEPLOY_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "CF_PAGES_COMMIT_SHA",
  "CF_PAGES_COMMIT_HASH",
  "GIT_COMMIT_SHA"
] as const;

export function resolveDeploySha(env: Record<string, string | undefined>): string | null {
  for (const key of DEPLOY_SHA_KEYS) {
    const candidate = String(env[key] || "").trim();
    if (/^[0-9a-f]{7,40}$/i.test(candidate)) return candidate.toLowerCase();
  }
  return null;
}

export const getServerSideProps: GetServerSideProps<ChallengePageProps> = async ({ locale, req, res }) => {
  const resolvedLocale = locale || "en";
  const isPreviewHost = isNonIndexableMarketingHostRequest(req);
  res?.setHeader("Cache-Control", isPreviewHost ? "no-store" : "public, max-age=0, s-maxage=300");

  return {
    props: {
      locale: resolvedLocale,
      baseUrl: marketingBaseUrlFromRequest(req),
      isPreviewHost,
      deploySha: resolveDeploySha(process.env),
      messages: await loadMessages(resolvedLocale, { namespaces: ["landing", "nav", "footer"] })
    } as ChallengePageProps
  };
};

export default function WebMcpChallenge({ locale, baseUrl, isPreviewHost, deploySha }: ChallengePageProps) {
  const router = useRouter();
  const currentLocale: SupportedLocale = resolveSupportedLocale(router.locale || locale || "en");
  const meta = META[currentLocale] || META.en;
  const urls = buildLocaleUrls(baseUrl, "webmcp-challenge");
  const canonicalUrl = urls[currentLocale];
  const hrefLangs = hrefLangTags(urls);
  const ogLocales = ogLocaleTags(currentLocale);

  return (
    <>
      <Head>
        <title>{meta.title}</title>
        <meta name="description" content={normalizeMetaDescription(meta.description)} />
        <meta name="robots" content={isPreviewHost ? "noindex,follow" : "index,follow"} />
        <link rel="canonical" href={canonicalUrl} />
        {hrefLangs.map((tag) => (
          <link key={tag.hrefLang} rel="alternate" hrefLang={tag.hrefLang} href={tag.href} />
        ))}
        <meta property="og:title" content={meta.ogTitle} />
        <meta property="og:description" content={meta.ogDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:locale" content={ogLocales.current} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={meta.ogTitle} />
        <meta name="twitter:description" content={meta.ogDescription} />
      </Head>
      <WebMcpChallengePage deploySha={deploySha} />
    </>
  );
}
