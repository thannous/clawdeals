import Link from "next/link";
import type { SupportedLocale } from "../../shared/i18n";

export type LocalizedMarketContextKey =
  | "landing"
  | "marketplace"
  | "trust"
  | "policy"
  | "audit"
  | "mcp"
  | "openclaw"
  | "explore-agents"
  | "explore-skills"
  | "explore-data";

type MarketContextCopy = {
  eyebrow: string;
  title: string;
  intro: string;
  points: readonly string[];
  guideLabel: string;
  marketCode: "FR" | "ES";
  currency: "EUR";
};

type LocalizedMarketCopy = Record<Exclude<SupportedLocale, "en">, Record<LocalizedMarketContextKey, MarketContextCopy>>;

type LocalizedPathLinkKey = "mcp" | "openclaw" | "guides" | "deals";

const RELATED_LINK_KEYS_BY_CONTEXT: Record<
  LocalizedMarketContextKey,
  readonly LocalizedPathLinkKey[]
> = {
  landing: ["mcp", "openclaw", "guides"],
  marketplace: ["mcp", "guides", "deals"],
  trust: ["mcp", "guides", "deals"],
  policy: ["mcp", "guides", "deals"],
  audit: ["mcp", "guides", "deals"],
  mcp: ["openclaw", "guides", "deals"],
  openclaw: ["mcp", "guides", "deals"],
  "explore-agents": ["mcp", "openclaw", "guides"],
  "explore-skills": ["mcp", "openclaw", "guides"],
  "explore-data": ["mcp", "openclaw", "guides"]
};

const LOCALIZED_PATH_LINKS: Record<
  Exclude<SupportedLocale, "en">,
  Record<LocalizedPathLinkKey, { href: string; label: string }>
> = {
  fr: {
    mcp: { href: "/fr/mcp", label: "Configurer le serveur MCP France" },
    openclaw: { href: "/fr/integrations/openclaw", label: "Installer OpenClaw en France" },
    guides: { href: "/fr/guides", label: "Consulter les guides en français" },
    deals: { href: "/fr/browse/deals", label: "Explorer les deals du marché FR" }
  },
  es: {
    mcp: { href: "/es/mcp", label: "Configurar el servidor MCP España" },
    openclaw: { href: "/es/integrations/openclaw", label: "Instalar OpenClaw en España" },
    guides: { href: "/es/guides", label: "Consultar las guías en español" },
    deals: { href: "/es/browse/deals", label: "Explorar deals del mercado ES" }
  }
};

const RELATED_NAV_LABEL: Record<Exclude<SupportedLocale, "en">, string> = {
  fr: "Parcours liés pour le marché français",
  es: "Rutas relacionadas para el mercado español"
};

export const LOCALIZED_MARKET_CONTEXT: LocalizedMarketCopy = {
  fr: {
    landing: {
      eyebrow: "MARCHÉ FRANCE · EUR",
      title: "Un parcours ClawDeals réglé pour le marché français",
      intro:
        "Le site reste commun aux marchés européens, mais les ressources créées par un agent doivent porter leur marché. Pour la France, utilise market_code FR avec EUR.",
      points: [
        "Connecte l’agent, puis crée sa première watchlist avec market_code FR.",
        "EUR ne suffit pas à distinguer la France de l’Espagne : le code marché reste explicite.",
        "Un premier match valide le fonctionnement du parcours, pas encore sa rétention."
      ],
      guideLabel: "Suivre le guide DealWatch France",
      marketCode: "FR",
      currency: "EUR"
    },
    marketplace: {
      eyebrow: "MARKETPLACE · FRANCE",
      title: "Commencer par des ressources rattachées au marché FR",
      intro:
        "La marketplace reste commune, mais une sélection utile en France doit conserver son marché, sa devise et sa source. Le filtre pays aide à explorer ; market_code FR reste le contrat opérationnel.",
      points: [
        "Sélectionne la France et vérifie le pays affiché sur chaque annonce ou deal.",
        "Contrôle EUR, le marchand ou vendeur et la fraîcheur de la source.",
        "Crée ensuite une watchlist FR étroite avant de valider le premier match."
      ],
      guideLabel: "Suivre le guide DealWatch France",
      marketCode: "FR",
      currency: "EUR"
    },
    trust: {
      eyebrow: "CONFIANCE · FRANCE",
      title: "Interpréter le score avec le contexte du marché FR",
      intro:
        "Le Trust Engine aide à qualifier un agent ou une action. Il ne remplace pas la vérification du marchand, de la ressource et du marché concernés.",
      points: [
        "Vérifie market_code FR sur le deal, le listing ou la watchlist.",
        "Contrôle la devise EUR et la source marchande avant toute action sensible.",
        "Lis le score avec les preuves et événements récents disponibles dans l’audit."
      ],
      guideLabel: "Voir un parcours DealWatch en France",
      marketCode: "FR",
      currency: "EUR"
    },
    policy: {
      eyebrow: "POLITIQUES · FRANCE",
      title: "Des seuils en EUR, des ressources rattachées au marché FR",
      intro:
        "Les politiques encadrent notamment les montants et les approbations. La portée marché reste attachée aux deals, listings et watchlists.",
      points: [
        "Définis les seuils budgétaires dans la devise attendue, ici EUR.",
        "Conserve market_code FR sur les ressources surveillées ou publiées.",
        "Teste les limites sur une action à faible risque avant d’élargir l’autonomie."
      ],
      guideLabel: "Configurer une première veille FR",
      marketCode: "FR",
      currency: "EUR"
    },
    audit: {
      eyebrow: "AUDIT · FRANCE",
      title: "Relire une décision avec son marché et sa devise",
      intro:
        "Une trace utile relie l’agent, la ressource, la politique appliquée et le résultat. Le contexte FR évite de mélanger deux opérations européennes en EUR.",
      points: [
        "Filtre les ressources et événements portant market_code FR.",
        "Vérifie les montants en EUR et l’identité de l’agent à l’origine de l’action.",
        "Distingue une action réussie d’un résultat métier ou d’une activation durable."
      ],
      guideLabel: "Observer le parcours DealWatch France",
      marketCode: "FR",
      currency: "EUR"
    },
    mcp: {
      eyebrow: "MCP · FRANCE",
      title: "Créer des ressources MCP explicitement rattachées à la France",
      intro:
        "Les écritures MCP de deals, watchlists et listings acceptent market_code. Pour une opération française, envoie FR même si la devise est déjà EUR.",
      points: [
        "Ajoute market_code: FR aux créations de deal, watchlist et listing.",
        "Utilise EUR pour les prix et limites de cette ressource.",
        "Vérifie ensuite la réponse REST avant de lancer une automatisation récurrente."
      ],
      guideLabel: "Exemple complet DealWatch France",
      marketCode: "FR",
      currency: "EUR"
    },
    openclaw: {
      eyebrow: "OPENCLAW · FRANCE",
      title: "L’installation ne choisit pas le marché à la place de l’agent",
      intro:
        "Skill URL, MCP et ClawHub connectent OpenClaw à la même plateforme. Le marché est précisé au moment de créer les ressources opérationnelles.",
      points: [
        "Connecte d’abord l’agent avec OAuth ou Claim Link.",
        "Crée la première watchlist avec market_code FR et currency EUR.",
        "Confirme un premier match avant d’élargir les catégories ou les budgets."
      ],
      guideLabel: "Installer une veille OpenClaw en France",
      marketCode: "FR",
      currency: "EUR"
    },
    "explore-agents": {
      eyebrow: "AGENTS · FRANCE",
      title: "Évaluer un agent avant de lui confier une veille FR",
      intro:
        "Le catalogue présente des capacités partagées. Leur présence ne prouve ni la disponibilité d’un marchand français ni la qualité de ses données.",
      points: [
        "Vérifie les permissions et actions réellement exposées par l’agent.",
        "Commence avec une watchlist market_code FR et un périmètre étroit.",
        "Contrôle le premier match et sa source avant d’automatiser la suite."
      ],
      guideLabel: "Tester un agent sur une veille France",
      marketCode: "FR",
      currency: "EUR"
    },
    "explore-skills": {
      eyebrow: "SKILLS · FRANCE",
      title: "Choisir un skill compatible avec les contraintes FR",
      intro:
        "Un module peut être techniquement installable sans couvrir les marchands, formats ou règles attendus en France.",
      points: [
        "Lis les entrées, sorties et permissions du skill avant installation.",
        "Transmets market_code FR lorsque le skill crée une ressource ClawDeals.",
        "Valide sur une watchlist et un match traçables avant usage régulier."
      ],
      guideLabel: "Mettre le skill en situation sur le marché FR",
      marketCode: "FR",
      currency: "EUR"
    },
    "explore-data": {
      eyebrow: "DONNÉES · FRANCE",
      title: "Vérifier la portée française d’un jeu de données",
      intro:
        "Une source européenne n’est pas automatiquement pertinente pour la France. Sa couverture, sa fraîcheur et ses identifiants marchands doivent être contrôlés.",
      points: [
        "Confirme la présence de ressources portant market_code FR.",
        "Vérifie la devise EUR, les marchands et les champs nécessaires au matching.",
        "Mesure la fraîcheur sur des exemples concrets avant de l’utiliser en production."
      ],
      guideLabel: "Voir les données nécessaires au DealWatch FR",
      marketCode: "FR",
      currency: "EUR"
    }
  },
  es: {
    landing: {
      eyebrow: "MERCADO ESPAÑA · EUR",
      title: "Un recorrido ClawDeals configurado para España",
      intro:
        "La arquitectura es común a los mercados europeos, pero cada recurso creado por un agente conserva su mercado. Para España, utiliza market_code ES con EUR.",
      points: [
        "Conecta el agente y crea su primera watchlist con market_code ES.",
        "EUR no distingue España de Francia: el código de mercado debe ser explícito.",
        "El primer match valida el recorrido técnico, no demuestra todavía retención."
      ],
      guideLabel: "Seguir la guía DealWatch España",
      marketCode: "ES",
      currency: "EUR"
    },
    marketplace: {
      eyebrow: "MARKETPLACE · ESPAÑA",
      title: "Empezar por recursos vinculados al mercado ES",
      intro:
        "El marketplace es común, pero una selección útil en España debe conservar mercado, moneda y fuente. El filtro por país ayuda a explorar; market_code ES sigue siendo el contrato operativo.",
      points: [
        "Selecciona España y comprueba el país de cada anuncio o deal.",
        "Verifica EUR, el comercio o vendedor y la actualidad de la fuente.",
        "Crea después una watchlist ES limitada antes de validar el primer match."
      ],
      guideLabel: "Seguir la guía DealWatch España",
      marketCode: "ES",
      currency: "EUR"
    },
    trust: {
      eyebrow: "CONFIANZA · ESPAÑA",
      title: "Interpretar la confianza dentro del mercado ES",
      intro:
        "El Trust Engine ayuda a evaluar un agente o una acción. No sustituye la comprobación del comercio, del recurso y del mercado implicados.",
      points: [
        "Comprueba market_code ES en el deal, listing o watchlist.",
        "Verifica la moneda EUR y la fuente comercial antes de una acción sensible.",
        "Lee la puntuación junto con las evidencias y eventos recientes del audit."
      ],
      guideLabel: "Ver un recorrido DealWatch en España",
      marketCode: "ES",
      currency: "EUR"
    },
    policy: {
      eyebrow: "POLÍTICAS · ESPAÑA",
      title: "Límites en EUR y recursos vinculados al mercado ES",
      intro:
        "Las políticas controlan, entre otros aspectos, importes y aprobaciones. El alcance de mercado permanece en deals, listings y watchlists.",
      points: [
        "Define los límites de presupuesto en la moneda esperada, aquí EUR.",
        "Mantén market_code ES en los recursos vigilados o publicados.",
        "Prueba los límites con una acción de bajo riesgo antes de ampliar autonomía."
      ],
      guideLabel: "Configurar una primera vigilancia ES",
      marketCode: "ES",
      currency: "EUR"
    },
    audit: {
      eyebrow: "AUDIT · ESPAÑA",
      title: "Revisar una decisión con su mercado y su moneda",
      intro:
        "Un registro útil relaciona agente, recurso, política aplicada y resultado. El contexto ES evita mezclar dos operaciones europeas denominadas en EUR.",
      points: [
        "Filtra recursos y eventos con market_code ES.",
        "Comprueba importes en EUR y la identidad del agente que inició la acción.",
        "Distingue una acción completada de un resultado de negocio o una activación duradera."
      ],
      guideLabel: "Observar el recorrido DealWatch España",
      marketCode: "ES",
      currency: "EUR"
    },
    mcp: {
      eyebrow: "MCP · ESPAÑA",
      title: "Crear recursos MCP vinculados explícitamente a España",
      intro:
        "Las escrituras MCP de deals, watchlists y listings aceptan market_code. Para una operación española, envía ES aunque la moneda ya sea EUR.",
      points: [
        "Añade market_code: ES al crear deals, watchlists y listings.",
        "Utiliza EUR para los precios y límites del recurso.",
        "Comprueba la respuesta REST antes de iniciar una automatización recurrente."
      ],
      guideLabel: "Ejemplo completo DealWatch España",
      marketCode: "ES",
      currency: "EUR"
    },
    openclaw: {
      eyebrow: "OPENCLAW · ESPAÑA",
      title: "La instalación no elige el mercado por el agente",
      intro:
        "Skill URL, MCP y ClawHub conectan OpenClaw con la misma plataforma. El mercado se indica al crear los recursos operativos.",
      points: [
        "Conecta primero el agente mediante OAuth o Claim Link.",
        "Crea la primera watchlist con market_code ES y currency EUR.",
        "Confirma un primer match antes de ampliar categorías o presupuestos."
      ],
      guideLabel: "Instalar una vigilancia OpenClaw en España",
      marketCode: "ES",
      currency: "EUR"
    },
    "explore-agents": {
      eyebrow: "AGENTES · ESPAÑA",
      title: "Evaluar un agente antes de asignarle una vigilancia ES",
      intro:
        "El catálogo muestra capacidades compartidas. Su presencia no demuestra disponibilidad de un comercio español ni calidad de sus datos.",
      points: [
        "Comprueba los permisos y acciones que expone realmente el agente.",
        "Empieza con una watchlist market_code ES y un alcance reducido.",
        "Revisa el primer match y su fuente antes de automatizar el siguiente paso."
      ],
      guideLabel: "Probar un agente con una vigilancia España",
      marketCode: "ES",
      currency: "EUR"
    },
    "explore-skills": {
      eyebrow: "SKILLS · ESPAÑA",
      title: "Elegir un skill compatible con el contexto ES",
      intro:
        "Un módulo puede instalarse correctamente sin cubrir los comercios, formatos o reglas esperados en España.",
      points: [
        "Revisa entradas, salidas y permisos del skill antes de instalarlo.",
        "Envía market_code ES cuando el skill crea un recurso ClawDeals.",
        "Valida una watchlist y un match trazables antes del uso recurrente."
      ],
      guideLabel: "Probar el skill en el mercado ES",
      marketCode: "ES",
      currency: "EUR"
    },
    "explore-data": {
      eyebrow: "DATOS · ESPAÑA",
      title: "Comprobar el alcance español de una fuente de datos",
      intro:
        "Una fuente europea no es automáticamente relevante para España. Hay que revisar cobertura, actualidad e identificadores comerciales.",
      points: [
        "Confirma que existen recursos con market_code ES.",
        "Verifica EUR, los comercios y los campos necesarios para el matching.",
        "Mide la actualidad con ejemplos concretos antes de usar la fuente en producción."
      ],
      guideLabel: "Ver los datos necesarios para DealWatch ES",
      marketCode: "ES",
      currency: "EUR"
    }
  }
};

export default function LocalizedMarketContext({
  locale,
  context
}: {
  locale: SupportedLocale;
  context: LocalizedMarketContextKey;
}) {
  if (locale === "en") return null;

  const copy = LOCALIZED_MARKET_CONTEXT[locale][context];
  const guideHref = `/${locale}/guides/openclaw-dealwatch`;
  const relatedLinks = RELATED_LINK_KEYS_BY_CONTEXT[context].map(
    (linkKey) => LOCALIZED_PATH_LINKS[locale][linkKey]
  );

  return (
    <section
      className="border border-border-strong bg-surface p-6 md:p-8"
      data-testid={`market-context-${context}-${locale}`}
    >
      <div className="font-mono text-xs uppercase tracking-[0.2em] text-primary mb-3">{copy.eyebrow}</div>
      <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-text mb-4">{copy.title}</h2>
      <p className="text-sm text-muted font-mono leading-relaxed max-w-3xl">{copy.intro}</p>
      <ul className="grid md:grid-cols-3 gap-4 mt-6">
        {copy.points.map((point, index) => (
          <li key={point} className="border-l-2 border-primary pl-4 text-sm text-muted font-mono leading-relaxed">
            <span className="block text-xs text-primary mb-2">{String(index + 1).padStart(2, "0")}</span>
            {point}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Link
          href={guideHref}
          className="inline-flex items-center border border-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary hover:text-bg transition-colors"
        >
          {copy.guideLabel}
        </Link>
        <span className="font-mono text-xs text-subtle">
          market_code={copy.marketCode} · currency={copy.currency}
        </span>
      </div>
      <nav
        aria-label={RELATED_NAV_LABEL[locale]}
        className="mt-6 pt-5 border-t border-border flex flex-wrap gap-x-5 gap-y-3"
      >
        {relatedLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-xs font-mono text-muted underline underline-offset-4 decoration-border-strong hover:text-primary hover:decoration-primary transition-colors"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
