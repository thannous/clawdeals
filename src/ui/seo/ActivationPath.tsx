import { ArrowRight, CheckCircle2 } from "lucide-react";

import type { SupportedLocale } from "../../shared/i18n";
import { localePrefixFor } from "../../shared/seo";
import { getPublicAppEntryHref } from "../../shared/urls";
import { SectionHeader, TechBorder } from "../landing/primitives";
import MarketingLink from "../shared/MarketingLink";

type ActivationPathSource = "landing" | "mcp" | "openclaw" | "comparison";

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
      "Installation is only the first step. Use this sequence to validate the product workflow without treating a connection or a returned match as proof of retention.",
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
        title: "Evaluate repeated value",
        body: "Review later alerts and useful matches before widening criteria, permissions, or budgets."
      }
    ],
    marketContract:
      "Launch contract: FR/EUR, GB/GBP, and ES/EUR. Matching checks market before currency. Merchant availability depends on current deal and listing sources; ClawDeals does not promise a fixed merchant catalogue.",
    primaryCta: "Connect an agent",
    guideCta: "Follow the DealWatch guide"
  },
  fr: {
    title: "De la connexion au premier match vérifié",
    eyebrow: "PARCOURS_ACTIVATION",
    intro:
      "L’installation n’est que la première étape. Cette séquence permet de valider le parcours produit sans présenter une connexion ou un match comme une preuve de rétention.",
    steps: [
      {
        title: "Connecter un agent",
        body: "Utilisez OAuth Device Code ou Claim Link pour créer une identité d’agent dédiée et révocable."
      },
      {
        title: "Créer une watchlist",
        body: "Définissez explicitement le marché et la devise : FR/EUR, GB/GBP ou ES/EUR."
      },
      {
        title: "Vérifier le premier match",
        body: "Lorsqu’un match est retourné, contrôlez son prix, sa devise, le marchand ou la source et la trace de requête avant d’agir."
      },
      {
        title: "Évaluer la valeur répétée",
        body: "Relisez les alertes et matchs utiles suivants avant d’élargir critères, permissions ou budgets."
      }
    ],
    marketContract:
      "Contrat de lancement : FR/EUR, GB/GBP et ES/EUR. Le matching vérifie le marché avant la devise. La disponibilité des marchands dépend des sources de deals et d’annonces présentes ; ClawDeals ne promet pas de catalogue marchand fixe.",
    primaryCta: "Connecter un agent",
    guideCta: "Suivre le guide DealWatch"
  },
  es: {
    title: "De la conexión al primer match verificado",
    eyebrow: "RUTA_ACTIVACIÓN",
    intro:
      "La instalación es solo el primer paso. Esta secuencia valida el recorrido del producto sin presentar una conexión o un match como prueba de retención.",
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
        title: "Evaluar el valor repetido",
        body: "Revisa las alertas y matches útiles posteriores antes de ampliar criterios, permisos o presupuestos."
      }
    ],
    marketContract:
      "Contrato de lanzamiento: FR/EUR, GB/GBP y ES/EUR. El matching comprueba el mercado antes que la moneda. La disponibilidad de comercios depende de las fuentes actuales de deals y anuncios; ClawDeals no promete un catálogo fijo.",
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
      <p className="max-w-3xl text-sm text-muted font-mono leading-7 mb-8">{copy.intro}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {copy.steps.map((step, index) => (
          <TechBorder key={step.title} className="h-full">
            <div className="h-full p-5 flex items-start gap-4">
              <span className="shrink-0 w-8 h-8 border border-primary/50 bg-primary/5 text-primary font-mono text-xs flex items-center justify-center">
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
        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
        <p className="text-sm text-muted leading-6">{copy.marketContract}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <MarketingLink
          href={getPublicAppEntryHref(localePrefix)}
          data-acquisition-cta={`${source}_activation`}
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
