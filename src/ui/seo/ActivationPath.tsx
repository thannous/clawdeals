import { ArrowRight, CheckCircle2 } from "lucide-react";

import type { AcquisitionCtaLocation } from "../../shared/acquisition";
import type { SupportedLocale } from "../../shared/i18n";
import { localePrefixFor } from "../../shared/seo";
import { getPublicAppEntryHref } from "../../shared/urls";
import { SectionHeader, TechBorder } from "../landing/primitives";
import MarketingLink from "../shared/MarketingLink";

type ActivationPathSource = "landing" | "mcp" | "openclaw" | "comparison";

const ACTIVATION_CTA_BY_SOURCE: Record<ActivationPathSource, AcquisitionCtaLocation> = {
  landing: "landing_activation",
  mcp: "mcp_activation",
  openclaw: "openclaw_activation",
  comparison: "comparison_activation"
};

type ActivationPathCopy = {
  title: string;
  eyebrow: string;
  intro: string;
  steps: readonly { title: string; body: string }[];
  marketContract: string;
  primaryCta: string;
  guideCta: string;
};

export const ACTIVATION_PATH_COPY: Record<SupportedLocale, ActivationPathCopy> = {
  en: {
    title: "From connection to a first verified match",
    eyebrow: "ACTIVATION_PATH",
    intro:
      "Installing the tools is only the start. These four steps take you from a connected agent to a first match you have checked yourself.",
    steps: [
      {
        title: "Connect one agent",
        body: "Use OAuth Device Code or Claim Link to create a dedicated, revocable agent identity."
      },
      {
        title: "Create one watchlist",
        body: "Set an explicit market_code and currency: FR/EUR, GB/GBP, or ES/EUR."
      },
      {
        title: "Review the first match",
        body: "When a match is returned, verify its price, currency, merchant or source, and request trace before acting."
      },
      {
        title: "Widen gradually",
        body: "Once several matches prove useful, widen your criteria, permissions or budget step by step."
      }
    ],
    marketContract:
      "Available markets: France (EUR), United Kingdom (GBP) and Spain (EUR). Matches stay within the market you choose. Which merchants appear depends on the deals and listings currently published; there is no fixed catalogue.",
    primaryCta: "Connect an agent",
    guideCta: "Follow the DealWatch guide"
  },
  fr: {
    title: "De la connexion au premier match vérifié",
    eyebrow: "PARCOURS_ACTIVATION",
    intro:
      "Installer les outils n’est qu’un début. Ces quatre étapes te mènent d’un agent connecté à un premier match que tu as vérifié toi-même.",
    steps: [
      {
        title: "Connecter un agent",
        body: "Utilise OAuth Device Code ou Claim Link pour créer une identité d’agent dédiée et révocable."
      },
      {
        title: "Créer une watchlist",
        body: "Indique explicitement le marché et la devise : FR/EUR, GB/GBP ou ES/EUR."
      },
      {
        title: "Vérifier le premier match",
        body: "Quand un match arrive, contrôle son prix, sa devise, le marchand ou la source et la trace de requête avant d’agir."
      },
      {
        title: "Élargir progressivement",
        body: "Quand plusieurs matchs se révèlent utiles, élargis tes critères, permissions ou budget étape par étape."
      }
    ],
    marketContract:
      "Marchés disponibles : France (EUR), Royaume-Uni (GBP) et Espagne (EUR). Les matchs restent dans le marché que tu choisis. Les marchands présents dépendent des bons plans et annonces publiés ; il n’y a pas de catalogue fixe.",
    primaryCta: "Connecter un agent",
    guideCta: "Suivre le guide DealWatch"
  },
  es: {
    title: "De la conexión al primer match verificado",
    eyebrow: "RUTA_ACTIVACIÓN",
    intro:
      "Instalar las herramientas es solo el comienzo. Estos cuatro pasos te llevan de un agente conectado a un primer match que has comprobado tú mismo.",
    steps: [
      {
        title: "Conectar un agente",
        body: "Usa OAuth Device Code o Claim Link para crear una identidad de agente dedicada y revocable."
      },
      {
        title: "Crear una watchlist",
        body: "Define de forma explícita el mercado y la moneda: FR/EUR, GB/GBP o ES/EUR."
      },
      {
        title: "Verificar el primer match",
        body: "Cuando se devuelva un match, comprueba precio, moneda, comercio o fuente y la traza de solicitud antes de actuar."
      },
      {
        title: "Ampliar poco a poco",
        body: "Cuando varios matches resulten útiles, amplía tus criterios, permisos o presupuesto paso a paso."
      }
    ],
    marketContract:
      "Mercados disponibles: Francia (EUR), Reino Unido (GBP) y España (EUR). Los matches se quedan en el mercado que elijas. Los comercios que aparecen dependen de las ofertas y anuncios publicados; no hay un catálogo fijo.",
    primaryCta: "Conectar un agente",
    guideCta: "Seguir la guía DealWatch"
  }
};

export default function ActivationPath({
  locale,
  source
}: {
  locale: SupportedLocale;
  source: ActivationPathSource;
}) {
  const copy = ACTIVATION_PATH_COPY[locale];
  const localePrefix = localePrefixFor(locale);

  return (
    <section data-testid={`activation-path-${source}`}>
      <SectionHeader title={copy.title} subtitle={copy.eyebrow} />
      <p className="max-w-3xl text-base text-muted leading-7 mb-8">{copy.intro}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {copy.steps.map((step, index) => (
          <TechBorder key={step.title} className="h-full">
            <div className="h-full p-5 flex items-start gap-4">
              <span aria-hidden="true" className="shrink-0 w-8 h-8 border border-primary/50 bg-primary/5 text-primary font-mono text-xs flex items-center justify-center">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-bold uppercase tracking-wider text-sm text-text">{step.title}</h3>
                <p className="mt-2 text-sm text-muted leading-6">{step.body}</p>
              </div>
            </div>
          </TechBorder>
        ))}
      </div>

      <div className="mt-5 border border-success/40 bg-success/5 p-5 flex items-start gap-3">
        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-sm text-muted leading-6">{copy.marketContract}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <MarketingLink
          href={getPublicAppEntryHref(localePrefix)}
          data-acquisition-cta={ACTIVATION_CTA_BY_SOURCE[source]}
          className="inline-flex items-center gap-2 px-6 py-3 border border-primary bg-primary text-bg font-bold uppercase tracking-wider text-xs hover:bg-text hover:border-text transition-colors"
        >
          {copy.primaryCta}
          <ArrowRight size={14} />
        </MarketingLink>
        <MarketingLink
          href="/guides/openclaw-dealwatch"
          className="inline-flex items-center gap-2 px-6 py-3 border border-border-strong text-muted font-bold uppercase tracking-wider text-xs hover:border-primary hover:text-primary transition-colors"
        >
          {copy.guideCta}
          <ArrowRight size={14} />
        </MarketingLink>
      </div>
    </section>
  );
}
