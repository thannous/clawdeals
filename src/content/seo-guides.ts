import { SUPPORTED_LOCALES, type SupportedLocale } from "../shared/i18n";

export const GUIDE_SLUGS = [
  "openclaw-skill-vs-mcp-vs-clawhub",
  "mcp-security-checklist",
  "ai-agent-human-approval-spending",
  "ai-agent-marketplace"
] as const;

export type GuideSlug = (typeof GUIDE_SLUGS)[number];
export type GuideSchemaType = "Article" | "HowTo";

export type GuideSection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  callout?: string;
};

export type LocalizedGuideContent = {
  title: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  introduction: string;
  tableOfContentsLabel: string;
  publishedLabel: string;
  updatedLabel: string;
  authorLabel: string;
  formatLabel: string;
  sections: readonly GuideSection[];
  ctaTitle: string;
  ctaBody: string;
  ctaLabel: string;
};

export type SeoGuideDefinition = {
  slug: GuideSlug;
  locales: readonly SupportedLocale[];
  publishedAt: string;
  updatedAt: string;
  author: string;
  category: "openclaw" | "security" | "governance" | "marketplaces";
  relatedGuides: readonly string[];
  schemaType: GuideSchemaType;
  market: "global" | readonly ["FR", "GB", "ES"];
  content: Record<SupportedLocale, LocalizedGuideContent>;
};

export type SeoGuideRegistryEntry = {
  slug: string;
  locales: readonly SupportedLocale[];
  title: Record<SupportedLocale, string>;
  metaDescription: Record<SupportedLocale, string>;
  publishedAt: string;
  updatedAt: string;
  author: string;
  category: SeoGuideDefinition["category"];
  relatedGuides: readonly string[];
  schemaType: GuideSchemaType | "TechArticle";
  market: SeoGuideDefinition["market"];
};

const openClawInstallGuide: SeoGuideDefinition = {
  slug: "openclaw-skill-vs-mcp-vs-clawhub",
  locales: SUPPORTED_LOCALES,
  publishedAt: "2026-07-18",
  updatedAt: "2026-07-29",
  author: "ClawDeals Editorial Team",
  category: "openclaw",
  relatedGuides: ["/integrations/openclaw", "/guides/openclaw-dealwatch", "/guides/mcp-security-checklist", "/guides/ai-agent-marketplace"],
  schemaType: "Article",
  market: ["FR", "GB", "ES"],
  content: {
    fr: {
      title: "OpenClaw : Skill URL, MCP ou ClawHub, quelle installation choisir ?",
      metaTitle: "OpenClaw : Skill URL vs MCP vs ClawHub | ClawDeals",
      metaDescription: "Comparez Skill URL, serveur MCP et ClawHub, puis testez connexion, watchlist par marché et premier match dans ClawDeals.",
      eyebrow: "GUIDE OPENCLAW",
      introduction: "Les trois méthodes connectent OpenClaw à ClawDeals, mais elles ne répondent pas au même besoin. Ce guide compare le démarrage rapide, les outils structurés et la distribution gérée, puis ramène chaque choix au même test produit : connecter un agent, créer une watchlist par marché et vérifier un premier match.",
      tableOfContentsLabel: "Dans ce guide",
      publishedLabel: "Publié",
      updatedLabel: "Mis à jour",
      authorLabel: "Par",
      formatLabel: "Guide pratique",
      sections: [
        {
          id: "decision-rapide",
          title: "La décision en une minute",
          paragraphs: [
            "Choisissez Skill URL pour tester le parcours et donner rapidement à OpenClaw les instructions d'utilisation de ClawDeals. Choisissez le serveur MCP si votre agent doit appeler des outils structurés avec des entrées validées. Choisissez ClawHub si votre organisation utilise déjà ce registre pour installer, mettre à jour et inventorier ses connecteurs."
          ],
          bullets: [
            "Skill URL : friction minimale, idéal pour une évaluation ou un agent personnel.",
            "MCP : contrat d'outils explicite, adapté à l'automatisation contrôlée.",
            "ClawHub : distribution gérée, utile quand le registre fait déjà partie de vos opérations."
          ],
          callout: "Le mode d'installation ne remplace pas les politiques ClawDeals : budget, approbation et audit restent configurés côté plateforme."
        },
        {
          id: "skill-url",
          title: "Skill URL : démarrer avec peu de maintenance",
          paragraphs: [
            "Une Skill URL fournit à OpenClaw des instructions distantes. Le point d'entrée ClawDeals publié est https://clawdeals.com/skill.md. Cette méthode convient pour valider les cas d'usage avant d'ajouter un processus local, et les instructions peuvent évoluer sans réinstaller un paquet sur chaque machine.",
            "Cette simplicité implique de gouverner la source distante : limitez les domaines autorisés, relisez les permissions demandées et testez les actions sensibles avec un compte de démonstration. Pour un environnement verrouillé ou reproductible hors ligne, un artefact versionné sera généralement plus approprié."
          ]
        },
        {
          id: "serveur-mcp",
          title: "Serveur MCP : des outils structurés pour la production",
          paragraphs: [
            "Le serveur MCP expose les opérations ClawDeals comme des outils nommés. La commande d'installation publiée est npx -y clawdeals-mcp install. Votre client peut examiner les schémas, transmettre des paramètres structurés et traiter des erreurs connues, ce qui réduit l'ambiguïté par rapport à des instructions seules.",
            "MCP devient le meilleur choix quand vous devez épingler une version, journaliser les appels, isoler les secrets et intégrer le connecteur à votre supervision. Exécutez-le avec le minimum de droits, séparez test et production, puis exigez une validation humaine pour les actions financières ou irréversibles."
          ],
          bullets: ["Épinglez la version du paquet.", "Injectez les secrets à l'exécution, jamais dans le dépôt.", "Conservez les identifiants de requête pour rapprocher outils et audit trail."]
        },
        {
          id: "clawhub",
          title: "ClawHub : privilégier un cycle d'installation géré",
          paragraphs: [
            "ClawHub est pertinent si votre équipe s'appuie déjà sur son catalogue et son cycle de mises à jour. La commande publiée est clawhub install clawdeals. Le bénéfice principal n'est pas une capacité ClawDeals supplémentaire, mais une distribution homogène entre plusieurs agents ou postes.",
            "Vérifiez toutefois l'éditeur, la version et les changements avant mise à jour. Un registre simplifie la livraison, pas l'évaluation du risque. Gardez une procédure de retour arrière et testez une nouvelle version sur un agent non critique."
          ]
        },
        {
          id: "checklist",
          title: "Checklist avant de connecter votre agent",
          paragraphs: ["Quel que soit le chemin, validez le même parcours observable avant d'élargir l'autonomie. Une installation réussie ou un premier match ne prouve pas encore une activation durable."],
          bullets: [
            "Créer une watchlist avec FR/EUR, GB/GBP ou ES/EUR ; le matching vérifie le marché avant la devise.",
            "Lorsqu'un match est retourné, contrôler prix, devise, marchand ou source et trace de requête.",
            "Relire les alertes et matchs utiles suivants avant d'élargir critères, permissions ou budgets.",
            "Ne pas supposer un catalogue marchand fixe : la disponibilité dépend des deals et annonces présents.",
            "Créer une identité d'agent dédiée et révocable.",
            "Tester un refus, une expiration et une révocation avant la mise en production."
          ]
        }
      ],
      ctaTitle: "Connecter OpenClaw à ClawDeals",
      ctaBody: "Choisissez un parcours, connectez un agent et validez une première watchlist rattachée à son marché.",
      ctaLabel: "Voir l'intégration OpenClaw"
    },
    en: {
      title: "OpenClaw: Skill URL, MCP, or ClawHub, which install should you choose?",
      metaTitle: "OpenClaw: Skill URL vs MCP vs ClawHub | ClawDeals",
      metaDescription: "Compare Skill URL, MCP server, and ClawHub, then test connection, a market-aware watchlist, and the first ClawDeals match.",
      eyebrow: "OPENCLAW GUIDE",
      introduction: "All three methods connect OpenClaw to ClawDeals, but they solve different operational problems. This guide compares the fastest trial path, structured tooling, and managed distribution, then applies the same product test to each choice: connect an agent, create a market-aware watchlist, and verify a first match.",
      tableOfContentsLabel: "In this guide",
      publishedLabel: "Published",
      updatedLabel: "Updated",
      authorLabel: "By",
      formatLabel: "Practical guide",
      sections: [
        {
          id: "quick-decision",
          title: "The one-minute decision",
          paragraphs: ["Choose Skill URL to test the workflow and quickly give OpenClaw instructions for using ClawDeals. Choose the MCP server when your agent needs structured tools with validated inputs. Choose ClawHub when your organisation already uses that registry to install, update, and inventory connectors."],
          bullets: ["Skill URL: lowest setup friction for an evaluation or personal agent.", "MCP: explicit tool contracts for controlled automation.", "ClawHub: managed distribution when the registry is already part of operations."],
          callout: "The installation method does not replace ClawDeals policies. Budget, approval, and audit controls remain configured on the platform."
        },
        {
          id: "skill-url",
          title: "Skill URL: start with little maintenance",
          paragraphs: [
            "A Skill URL gives OpenClaw remotely hosted instructions. The published ClawDeals entry point is https://clawdeals.com/skill.md. It is useful for validating use cases before adding a local runtime, and the instructions can improve without reinstalling a package on every machine.",
            "That convenience means the remote source still needs governance. Restrict allowed domains, review requested permissions, and test sensitive actions with a demo account. A versioned artifact is usually a better fit for locked-down or offline-reproducible environments."
          ]
        },
        {
          id: "mcp-server",
          title: "MCP server: structured tools for production",
          paragraphs: [
            "The MCP server exposes ClawDeals operations as named tools. The published install command is npx -y clawdeals-mcp install. A client can inspect schemas, send structured arguments, and handle known errors, reducing ambiguity compared with instructions alone.",
            "MCP is the stronger option when you need to pin a version, log calls, isolate secrets, and connect the integration to monitoring. Run it with least privilege, separate test from production, and require human approval for financial or irreversible actions."
          ],
          bullets: ["Pin the package version.", "Inject secrets at runtime, never into the repository.", "Keep request identifiers so tool calls can be reconciled with the audit trail."]
        },
        {
          id: "clawhub",
          title: "ClawHub: favour a managed install lifecycle",
          paragraphs: [
            "ClawHub makes sense when your team already relies on its catalogue and update lifecycle. The published command is clawhub install clawdeals. The primary benefit is not an extra ClawDeals capability, but consistent distribution across multiple agents or workstations.",
            "Still verify the publisher, version, and changes before an update. A registry simplifies delivery, not risk assessment. Keep a rollback procedure and test new versions on a non-critical agent first."
          ]
        },
        {
          id: "checklist",
          title: "Checklist before connecting your agent",
          paragraphs: ["Whatever the path, validate the same observable workflow before expanding autonomy. A successful install or first match does not yet prove durable activation."],
          bullets: ["Create one watchlist with FR/EUR, GB/GBP, or ES/EUR; matching checks market before currency.", "When a match is returned, verify price, currency, merchant or source, and request trace.", "Review later alerts and useful matches before widening criteria, permissions, or budgets.", "Do not assume a fixed merchant catalogue; availability depends on current deals and listings.", "Create a dedicated, revocable agent identity.", "Test denial, expiration, and revocation before production."]
        }
      ],
      ctaTitle: "Connect OpenClaw to ClawDeals",
      ctaBody: "Choose one path, connect an agent, and validate a first market-aware watchlist.",
      ctaLabel: "View the OpenClaw integration"
    },
    es: {
      title: "OpenClaw: Skill URL, MCP o ClawHub, ¿qué instalación elegir?",
      metaTitle: "OpenClaw: Skill URL, MCP o ClawHub | ClawDeals",
      metaDescription: "Compara Skill URL, servidor MCP y ClawHub y prueba conexión, watchlist por mercado y primer match en ClawDeals.",
      eyebrow: "GUÍA OPENCLAW",
      introduction: "Los tres métodos conectan OpenClaw con ClawDeals, pero resuelven necesidades operativas distintas. Esta guía compara la prueba rápida, las herramientas estructuradas y la distribución gestionada, y aplica a cada opción el mismo test de producto: conectar un agente, crear una watchlist por mercado y verificar un primer match.",
      tableOfContentsLabel: "En esta guía",
      publishedLabel: "Publicado",
      updatedLabel: "Actualizado",
      authorLabel: "Por",
      formatLabel: "Guía práctica",
      sections: [
        {
          id: "decision-rapida",
          title: "La decisión en un minuto",
          paragraphs: ["Elige Skill URL para probar el flujo y dar rápidamente a OpenClaw instrucciones para usar ClawDeals. Elige el servidor MCP si el agente necesita herramientas estructuradas con entradas validadas. Elige ClawHub si tu organización ya usa ese registro para instalar, actualizar e inventariar conectores."],
          bullets: ["Skill URL: fricción mínima para una evaluación o un agente personal.", "MCP: contratos de herramientas explícitos para automatización controlada.", "ClawHub: distribución gestionada cuando el registro ya forma parte de las operaciones."],
          callout: "El método de instalación no sustituye las políticas de ClawDeals. El presupuesto, las aprobaciones y la auditoría se configuran en la plataforma."
        },
        {
          id: "skill-url",
          title: "Skill URL: empezar con poco mantenimiento",
          paragraphs: ["Una Skill URL proporciona a OpenClaw instrucciones alojadas de forma remota. El punto de entrada publicado de ClawDeals es https://clawdeals.com/skill.md. Es útil para validar casos de uso antes de añadir un proceso local y puede mejorar sin reinstalar un paquete en cada equipo.", "Esa comodidad exige gobernar la fuente remota: limita los dominios permitidos, revisa los permisos y prueba las acciones sensibles con una cuenta de demostración. Un artefacto versionado suele encajar mejor en entornos cerrados o reproducibles sin conexión."]
        },
        {
          id: "servidor-mcp",
          title: "Servidor MCP: herramientas estructuradas para producción",
          paragraphs: ["El servidor MCP expone las operaciones de ClawDeals como herramientas con nombre. El comando publicado es npx -y clawdeals-mcp install. El cliente puede inspeccionar esquemas, enviar parámetros estructurados y manejar errores conocidos, reduciendo la ambigüedad frente a instrucciones únicamente textuales.", "MCP es la opción más sólida si necesitas fijar una versión, registrar llamadas, aislar secretos y conectar la integración con la supervisión. Usa privilegios mínimos, separa pruebas y producción y exige aprobación humana para acciones financieras o irreversibles."],
          bullets: ["Fija la versión del paquete.", "Inyecta los secretos en ejecución, nunca en el repositorio.", "Conserva los identificadores de solicitud para relacionar herramientas y auditoría."]
        },
        {
          id: "clawhub",
          title: "ClawHub: un ciclo de instalación gestionado",
          paragraphs: ["ClawHub es relevante si tu equipo ya depende de su catálogo y ciclo de actualizaciones. El comando publicado es clawhub install clawdeals. El beneficio principal no es una capacidad extra de ClawDeals, sino una distribución coherente entre varios agentes o equipos.", "Comprueba el editor, la versión y los cambios antes de actualizar. Un registro simplifica la entrega, no la evaluación del riesgo. Mantén un procedimiento de reversión y prueba cada versión con un agente no crítico."]
        },
        {
          id: "checklist",
          title: "Checklist antes de conectar el agente",
          paragraphs: ["Sea cual sea el camino, valida el mismo recorrido observable antes de ampliar la autonomía. Una instalación correcta o un primer match aún no demuestran activación duradera."],
          bullets: ["Crea una watchlist con FR/EUR, GB/GBP o ES/EUR; el matching comprueba el mercado antes que la moneda.", "Cuando se devuelva un match, verifica precio, moneda, comercio o fuente y la traza de solicitud.", "Revisa alertas y matches útiles posteriores antes de ampliar criterios, permisos o presupuestos.", "No presupongas un catálogo fijo de comercios; la disponibilidad depende de los deals y anuncios presentes.", "Crea una identidad de agente dedicada y revocable.", "Prueba rechazo, caducidad y revocación antes de producción."]
        }
      ],
      ctaTitle: "Conectar OpenClaw con ClawDeals",
      ctaBody: "Elige una vía, conecta un agente y valida una primera watchlist vinculada a su mercado.",
      ctaLabel: "Ver la integración OpenClaw"
    }
  }
};

const mcpSecurityGuide: SeoGuideDefinition = {
  slug: "mcp-security-checklist",
  locales: SUPPORTED_LOCALES,
  publishedAt: "2026-07-18",
  updatedAt: "2026-07-29",
  author: "ClawDeals Editorial Team",
  category: "security",
  relatedGuides: ["/guides/mcp-marketplace-safety", "/guides/ai-agent-human-approval-spending", "/audit-trail", "/guides/ai-agent-marketplace"],
  schemaType: "HowTo",
  market: "global",
  content: {
    fr: {
      title: "Checklist de sécurité MCP pour les agents IA en production",
      metaTitle: "Checklist sécurité MCP en production | ClawDeals",
      metaDescription: "Sécurisez un serveur MCP en production : confiance, permissions, secrets, validation humaine, journalisation, tests et réponse aux incidents.",
      eyebrow: "GUIDE SÉCURITÉ MCP",
      introduction: "Un serveur MCP relie un modèle à des capacités réelles. Sa sécurité ne dépend donc pas d'un unique réglage, mais d'une chaîne de confiance allant du paquet installé à la révocation d'un credential compromis.",
      tableOfContentsLabel: "Checklist détaillée",
      publishedLabel: "Publié",
      updatedLabel: "Mis à jour",
      authorLabel: "Par",
      formatLabel: "Checklist pratique",
      sections: [
        { id: "inventorier", title: "1. Inventorier le serveur et son périmètre", paragraphs: ["Documentez l'éditeur, la source, la version, le mode de transport et chaque outil exposé. Pour chaque outil, notez s'il lit, écrit, dépense, publie ou révèle des données. Cette cartographie détermine les contrôles nécessaires."], bullets: ["Épingler les versions et vérifier les changements avant mise à jour.", "Désactiver les outils inutiles.", "Séparer les serveurs et comptes de test et de production."] },
        { id: "identite", title: "2. Limiter identité, permissions et secrets", paragraphs: ["Attribuez une identité distincte à chaque agent ou environnement. Un token partagé rend l'attribution et la révocation difficiles. Stockez les secrets dans le gestionnaire prévu par votre runtime, injectez-les au démarrage et évitez leur présence dans les prompts, logs ou fichiers de configuration versionnés."], bullets: ["Commencer en lecture seule.", "Limiter les scopes et la durée de vie des tokens.", "Tester la rotation et la révocation, pas seulement leur documentation."] },
        { id: "validation", title: "3. Valider entrées, sorties et destinations", paragraphs: ["Considérez les arguments produits par le modèle comme non fiables. Validez schéma, taille, format, devise, marché, URL et identifiants côté outil. Contrôlez également les réponses avant de les réinjecter dans le contexte afin qu'un contenu externe ne devienne pas une instruction privilégiée."], bullets: ["Autoriser explicitement domaines et destinations réseau.", "Refuser les valeurs inconnues au lieu de les corriger silencieusement.", "Neutraliser les secrets et données personnelles dans les retours d'erreur."] },
        { id: "approbations", title: "4. Placer des validations humaines aux bons endroits", paragraphs: ["Une approbation est utile avant une dépense, une publication, une prise de contact, une révélation de coordonnées ou toute action irréversible. L'écran de validation doit montrer l'action exacte, son montant, sa devise, sa cible et son expiration."], callout: "Un bouton Approver sans contexte n'est pas un contrôle suffisant. Le propriétaire doit comprendre ce qui sera exécuté." },
        { id: "observabilite", title: "5. Journaliser, tester et préparer l'incident", paragraphs: ["Reliez chaque appel MCP à un identifiant de requête et à l'identité de l'agent. Journalisez l'outil, le résultat, la décision humaine et la politique appliquée sans enregistrer les secrets. Alertez sur les refus répétés, pics d'appels, destinations nouvelles et dépassements de budget."], bullets: ["Tester prompt injection, rejeu, timeout, double clic et indisponibilité du validateur.", "Préparer un arrêt d'urgence et une procédure de révocation.", "Conserver une piste d'audit suffisante pour reconstruire l'action."] }
      ],
      ctaTitle: "Appliquer ces contrôles sur une marketplace MCP",
      ctaBody: "Découvrez comment ClawDeals combine permissions, approbations, idempotence et audit trail.",
      ctaLabel: "Voir la sécurité MCP"
    },
    en: {
      title: "MCP security checklist for AI agents in production",
      metaTitle: "Production MCP security checklist | ClawDeals",
      metaDescription: "Secure an MCP server in production with trust checks, least privilege, secret handling, human approval, audit logs, testing, and incident response.",
      eyebrow: "MCP SECURITY GUIDE",
      introduction: "An MCP server connects a model to real capabilities. Security therefore depends on a chain of trust, from the installed package to the ability to revoke a compromised credential, rather than one configuration switch.",
      tableOfContentsLabel: "Detailed checklist",
      publishedLabel: "Published",
      updatedLabel: "Updated",
      authorLabel: "By",
      formatLabel: "Practical checklist",
      sections: [
        { id: "inventory", title: "1. Inventory the server and its scope", paragraphs: ["Record the publisher, source, version, transport, and every exposed tool. For each tool, note whether it reads, writes, spends, publishes, or reveals data. That map determines which controls are required."], bullets: ["Pin versions and review changes before updating.", "Disable tools that are not needed.", "Separate test and production servers and accounts."] },
        { id: "identity", title: "2. Limit identities, permissions, and secrets", paragraphs: ["Give each agent or environment a distinct identity. A shared token makes attribution and revocation difficult. Store secrets in the runtime's secret manager, inject them at startup, and keep them out of prompts, logs, and versioned configuration."], bullets: ["Start read-only.", "Limit scopes and token lifetime.", "Test rotation and revocation instead of only documenting them."] },
        { id: "validation", title: "3. Validate inputs, outputs, and destinations", paragraphs: ["Treat model-generated arguments as untrusted. Validate schema, size, format, currency, market, URLs, and identifiers inside the tool. Inspect responses before returning them to model context so external content cannot become a privileged instruction."], bullets: ["Allow network domains and destinations explicitly.", "Reject unknown values instead of silently correcting them.", "Redact secrets and personal data from errors."] },
        { id: "approvals", title: "4. Put human approval at the right boundaries", paragraphs: ["Approval is appropriate before spending, publishing, contacting a person, revealing contact details, or performing any irreversible action. The review screen should show the exact action, amount, currency, target, and expiration."], callout: "An Approve button without context is not a sufficient control. The owner must understand what will execute." },
        { id: "observability", title: "5. Log, test, and prepare for incidents", paragraphs: ["Link each MCP call to a request identifier and agent identity. Log the tool, outcome, human decision, and applied policy without storing secrets. Alert on repeated denials, call spikes, new destinations, and budget overruns."], bullets: ["Test prompt injection, replay, timeouts, double clicks, and unavailable approvers.", "Prepare an emergency stop and credential revocation procedure.", "Retain enough audit data to reconstruct the action."] }
      ],
      ctaTitle: "Apply these controls to an MCP marketplace",
      ctaBody: "See how ClawDeals combines permissions, approvals, idempotency, and an audit trail.",
      ctaLabel: "View MCP safety"
    },
    es: {
      title: "Checklist de seguridad MCP para agentes de IA en producción",
      metaTitle: "Checklist de seguridad MCP en producción | ClawDeals",
      metaDescription: "Protege un servidor MCP en producción con confianza, privilegios mínimos, secretos, aprobación humana, auditoría, pruebas y respuesta a incidentes.",
      eyebrow: "GUÍA DE SEGURIDAD MCP",
      introduction: "Un servidor MCP conecta un modelo con capacidades reales. Su seguridad depende de una cadena de confianza, desde el paquete instalado hasta la revocación de una credencial comprometida, y no de un único ajuste.",
      tableOfContentsLabel: "Checklist detallada",
      publishedLabel: "Publicado",
      updatedLabel: "Actualizado",
      authorLabel: "Por",
      formatLabel: "Checklist práctica",
      sections: [
        { id: "inventario", title: "1. Inventariar el servidor y su alcance", paragraphs: ["Documenta el editor, origen, versión, transporte y cada herramienta expuesta. Para cada herramienta, indica si lee, escribe, gasta, publica o revela datos. Este mapa determina los controles necesarios."], bullets: ["Fijar versiones y revisar los cambios antes de actualizar.", "Desactivar herramientas innecesarias.", "Separar servidores y cuentas de prueba y producción."] },
        { id: "identidad", title: "2. Limitar identidades, permisos y secretos", paragraphs: ["Asigna una identidad distinta a cada agente o entorno. Un token compartido dificulta la atribución y la revocación. Guarda los secretos en el gestor del runtime, inyéctalos al iniciar y mantenlos fuera de prompts, logs y configuración versionada."], bullets: ["Empezar en modo solo lectura.", "Limitar scopes y duración de los tokens.", "Probar la rotación y la revocación, no solo documentarlas."] },
        { id: "validacion", title: "3. Validar entradas, salidas y destinos", paragraphs: ["Trata los argumentos generados por el modelo como datos no fiables. Valida esquema, tamaño, formato, moneda, mercado, URL e identificadores dentro de la herramienta. Revisa las respuestas antes de devolverlas al contexto para que un contenido externo no se convierta en una instrucción privilegiada."], bullets: ["Autorizar dominios y destinos de red de forma explícita.", "Rechazar valores desconocidos en vez de corregirlos en silencio.", "Ocultar secretos y datos personales en los errores."] },
        { id: "aprobaciones", title: "4. Situar la aprobación humana en los límites adecuados", paragraphs: ["La aprobación es apropiada antes de gastar, publicar, contactar, revelar datos o ejecutar una acción irreversible. La pantalla debe mostrar la acción exacta, importe, moneda, destino y caducidad."], callout: "Un botón Aprobar sin contexto no es un control suficiente. El propietario debe entender qué se ejecutará." },
        { id: "observabilidad", title: "5. Registrar, probar y preparar incidentes", paragraphs: ["Relaciona cada llamada MCP con un identificador de solicitud y una identidad de agente. Registra herramienta, resultado, decisión humana y política aplicada sin guardar secretos. Genera alertas por rechazos repetidos, picos de llamadas, destinos nuevos y excesos de presupuesto."], bullets: ["Probar prompt injection, repetición, timeout, doble clic y ausencia del aprobador.", "Preparar una parada de emergencia y un proceso de revocación.", "Conservar auditoría suficiente para reconstruir la acción."] }
      ],
      ctaTitle: "Aplicar estos controles a un marketplace MCP",
      ctaBody: "Descubre cómo ClawDeals combina permisos, aprobaciones, idempotencia y auditoría.",
      ctaLabel: "Ver seguridad MCP"
    }
  }
};

const spendingApprovalGuide: SeoGuideDefinition = {
  slug: "ai-agent-human-approval-spending",
  locales: SUPPORTED_LOCALES,
  publishedAt: "2026-07-18",
  updatedAt: "2026-07-29",
  author: "ClawDeals Editorial Team",
  category: "governance",
  relatedGuides: ["/policy-control", "/audit-trail", "/guides/mcp-security-checklist", "/guides/ai-agent-marketplace"],
  schemaType: "HowTo",
  market: ["FR", "GB", "ES"],
  content: {
    fr: {
      title: "Contrôler les dépenses d'un agent IA avec des validations humaines",
      metaTitle: "Contrôler les dépenses d'un agent IA | ClawDeals",
      metaDescription: "Construisez une politique de dépenses pour agent IA avec budgets, seuils, validation humaine, idempotence, expiration et audit des décisions.",
      eyebrow: "GUIDE GOUVERNANCE",
      introduction: "Un agent acheteur doit pouvoir avancer seul sur les tâches réversibles tout en s'arrêtant avant un engagement financier important. Une bonne politique combine plafond, contexte de décision et comportement sûr en cas d'incertitude.",
      tableOfContentsLabel: "Plan de contrôle",
      publishedLabel: "Publié",
      updatedLabel: "Mis à jour",
      authorLabel: "Par",
      formatLabel: "Guide pratique",
      sections: [
        { id: "budget", title: "1. Définir plusieurs limites de budget", paragraphs: ["Un plafond unique ne suffit pas. Définissez un montant maximal par action, un cumul par jour ou par mois et, si nécessaire, une limite par catégorie. Précisez la devise : 100 EUR et 100 GBP ne sont pas interchangeables."], bullets: ["Plafond par transaction pour contenir une erreur isolée.", "Budget cumulé pour éviter une succession de petits achats.", "Marché et devise explicites pour FR, GB et ES."] },
        { id: "niveaux", title: "2. Classer les actions par niveau de risque", paragraphs: ["Autorisez automatiquement les lectures et simulations. Demandez une validation pour une offre, un paiement, une révélation de contact ou une hausse de budget. Bloquez les actions hors politique plutôt que de les envoyer systématiquement à un humain."], callout: "Une file d'approbation saturée finit par produire des validations mécaniques. Réservez-la aux décisions où le jugement humain apporte réellement de la valeur." },
        { id: "demande", title: "3. Présenter une demande compréhensible", paragraphs: ["La demande doit résumer le vendeur, l'objet, le montant, la devise, les frais, le marché, la raison proposée par l'agent et la politique déclenchée. Ajoutez une expiration et montrez ce qui changera si le propriétaire approuve."], bullets: ["Afficher le coût total, pas seulement le prix facial.", "Associer la demande à l'identité de l'agent et à la ressource ciblée.", "Offrir des choix explicites : approuver, refuser ou laisser expirer."] },
        { id: "execution", title: "4. Exécuter une seule fois après approbation", paragraphs: ["Une approbation doit être liée à une action précise, non à une permission générale. Après validation, utilisez une clé d'idempotence pour qu'un retry réseau ou un double clic ne crée pas une seconde offre. Refusez toute exécution si le montant, la cible ou la devise diffère de la demande approuvée."], bullets: ["Consommer l'approbation une seule fois.", "Revalider la politique juste avant l'écriture.", "Faire échouer de manière sûre les demandes expirées ou modifiées."] },
        { id: "audit", title: "5. Mesurer et améliorer la politique", paragraphs: ["Conservez l'horodatage, la règle déclenchée, le décideur, le résultat et l'identifiant de requête. Examinez régulièrement les refus, expirations et contournements évités. Si presque toutes les demandes identiques sont approuvées, ajustez un seuil avec prudence plutôt que de supprimer le contrôle."], bullets: ["Alerter sur les tentatives répétées après refus.", "Tester la révocation d'un agent et d'un approbateur.", "Séparer les changements de politique de l'exécution des achats."] }
      ],
      ctaTitle: "Configurer des achats sous contrôle",
      ctaBody: "Explorez les budgets, seuils et gates de validation disponibles dans Policy Control.",
      ctaLabel: "Voir Policy Control"
    },
    en: {
      title: "How to control AI agent spending with human approval gates",
      metaTitle: "Control AI agent spending with approvals | ClawDeals",
      metaDescription: "Build an AI agent spending policy with budgets, thresholds, human approval, idempotency, expiration, and a complete decision audit trail.",
      eyebrow: "GOVERNANCE GUIDE",
      introduction: "A purchasing agent should handle reversible work independently and stop before a meaningful financial commitment. A sound policy combines spending caps, decision context, and safe behaviour when conditions are uncertain.",
      tableOfContentsLabel: "Control plan",
      publishedLabel: "Published",
      updatedLabel: "Updated",
      authorLabel: "By",
      formatLabel: "Practical guide",
      sections: [
        { id: "budget", title: "1. Define more than one budget limit", paragraphs: ["One cap is not enough. Set a maximum per action, a daily or monthly cumulative amount, and category limits where useful. State the currency: 100 EUR and 100 GBP are not interchangeable."], bullets: ["Per-transaction cap to contain one mistake.", "Cumulative budget to prevent a sequence of small purchases.", "Explicit market and currency for FR, GB, and ES."] },
        { id: "tiers", title: "2. Classify actions by risk tier", paragraphs: ["Allow reads and simulations automatically. Require approval for an offer, payment, contact reveal, or budget increase. Block out-of-policy actions rather than routing every one of them to a human."], callout: "An overloaded approval queue leads to mechanical decisions. Reserve it for moments where human judgment changes the outcome." },
        { id: "request", title: "3. Present an understandable request", paragraphs: ["The request should summarize the seller, item, amount, currency, fees, market, the agent's reason, and the policy that triggered. Add an expiration and show exactly what will change if the owner approves."], bullets: ["Show total cost, not only the headline price.", "Bind the request to the agent identity and target resource.", "Offer explicit outcomes: approve, deny, or let it expire."] },
        { id: "execution", title: "4. Execute once after approval", paragraphs: ["An approval must authorize one exact action, not grant general permission. After approval, use an idempotency key so a network retry or double click cannot create a second offer. Reject execution if amount, target, or currency differs from the approved request."], bullets: ["Consume approval only once.", "Re-evaluate policy immediately before the write.", "Fail safely when a request expires or changes."] },
        { id: "audit", title: "5. Measure and improve the policy", paragraphs: ["Keep the timestamp, triggered rule, decision maker, outcome, and request identifier. Review denials, expirations, and prevented bypasses. If almost every identical request is approved, cautiously tune a threshold instead of removing the control."], bullets: ["Alert on repeated attempts after a denial.", "Test revocation for both agents and approvers.", "Separate policy changes from purchase execution."] }
      ],
      ctaTitle: "Configure controlled purchases",
      ctaBody: "Explore budgets, thresholds, and approval gates in Policy Control.",
      ctaLabel: "View Policy Control"
    },
    es: {
      title: "Cómo controlar el gasto de un agente de IA con aprobación humana",
      metaTitle: "Controlar el gasto de un agente de IA | ClawDeals",
      metaDescription: "Crea una política de gasto para agentes de IA con presupuestos, umbrales, aprobación humana, idempotencia, caducidad y auditoría.",
      eyebrow: "GUÍA DE GOBERNANZA",
      introduction: "Un agente comprador debe avanzar de forma autónoma en tareas reversibles y detenerse antes de un compromiso financiero relevante. Una buena política combina límites, contexto de decisión y un comportamiento seguro ante la incertidumbre.",
      tableOfContentsLabel: "Plan de control",
      publishedLabel: "Publicado",
      updatedLabel: "Actualizado",
      authorLabel: "Por",
      formatLabel: "Guía práctica",
      sections: [
        { id: "presupuesto", title: "1. Definir varios límites de presupuesto", paragraphs: ["Un único límite no basta. Establece un máximo por acción, una suma diaria o mensual y límites por categoría si aportan valor. Indica la moneda: 100 EUR y 100 GBP no son intercambiables."], bullets: ["Límite por transacción para contener un error aislado.", "Presupuesto acumulado para impedir una serie de pequeñas compras.", "Mercado y moneda explícitos para FR, GB y ES."] },
        { id: "niveles", title: "2. Clasificar las acciones por nivel de riesgo", paragraphs: ["Permite automáticamente lecturas y simulaciones. Solicita aprobación para una oferta, pago, revelación de contacto o aumento de presupuesto. Bloquea acciones fuera de política en vez de enviar todas a una persona."], callout: "Una cola de aprobaciones saturada produce decisiones mecánicas. Resérvala para los casos donde el criterio humano cambia el resultado." },
        { id: "solicitud", title: "3. Presentar una solicitud comprensible", paragraphs: ["La solicitud debe resumir vendedor, artículo, importe, moneda, gastos, mercado, motivo del agente y política activada. Añade una caducidad y muestra qué cambiará exactamente si el propietario aprueba."], bullets: ["Mostrar el coste total, no solo el precio anunciado.", "Vincular la solicitud con la identidad del agente y el recurso objetivo.", "Ofrecer resultados explícitos: aprobar, rechazar o dejar caducar."] },
        { id: "ejecucion", title: "4. Ejecutar una sola vez tras la aprobación", paragraphs: ["Una aprobación debe autorizar una acción exacta, no conceder un permiso general. Después usa una clave de idempotencia para que un reintento o doble clic no cree otra oferta. Rechaza la ejecución si importe, destino o moneda difieren de la solicitud aprobada."], bullets: ["Consumir la aprobación una sola vez.", "Reevaluar la política justo antes de escribir.", "Fallar de forma segura si la solicitud caduca o cambia."] },
        { id: "auditoria", title: "5. Medir y mejorar la política", paragraphs: ["Conserva la fecha, regla activada, persona que decide, resultado e identificador de solicitud. Revisa rechazos, caducidades e intentos evitados. Si casi todas las solicitudes idénticas se aprueban, ajusta el umbral con prudencia en vez de retirar el control."], bullets: ["Alertar sobre intentos repetidos tras un rechazo.", "Probar la revocación del agente y del aprobador.", "Separar los cambios de política de la ejecución de compras."] }
      ],
      ctaTitle: "Configurar compras controladas",
      ctaBody: "Explora presupuestos, umbrales y validaciones disponibles en Policy Control.",
      ctaLabel: "Ver Policy Control"
    }
  }
};

const marketplaceGuide: SeoGuideDefinition = {
  slug: "ai-agent-marketplace",
  locales: SUPPORTED_LOCALES,
  publishedAt: "2026-07-18",
  updatedAt: "2026-07-29",
  author: "ClawDeals Editorial Team",
  category: "marketplaces",
  relatedGuides: ["/browse", "/trust-engine", "/guides/mcp-marketplace-safety"],
  schemaType: "Article",
  market: ["FR", "GB", "ES"],
  content: {
    fr: {
      title: "Comment choisir une marketplace d'agents IA en 2026",
      metaTitle: "Choisir une marketplace d'agents IA en 2026 | ClawDeals",
      metaDescription: "Évaluez une marketplace d'agents IA sur l'identité, la qualité des offres, les permissions, paiements, litiges, audit et couverture locale.",
      eyebrow: "GUIDE MARKETPLACE",
      introduction: "Une marketplace pour agents ne se juge pas seulement au nombre d'annonces ou de connecteurs. Elle doit permettre à un propriétaire de comprendre qui agit, sous quelle politique et avec quel recours lorsqu'une transaction échoue.",
      tableOfContentsLabel: "Critères de choix",
      publishedLabel: "Publié",
      updatedLabel: "Mis à jour",
      authorLabel: "Par",
      formatLabel: "Grille pratique",
      sections: [
        { id: "usage", title: "1. Partir du cas d'usage et du niveau d'autonomie", paragraphs: ["Distinguez la recherche de deals, la publication d'annonces et l'achat. Un agent qui compare des prix peut rester en lecture seule ; un agent qui négocie ou paie exige identité, budget et approbation. Écartez les plateformes qui ne permettent pas de limiter précisément ces capacités."], bullets: ["Lister les actions nécessaires et celles qui doivent rester interdites.", "Définir les marchés, langues et devises réellement couverts.", "Tester avec une transaction non critique avant tout élargissement."] },
        { id: "confiance", title: "2. Vérifier identité, réputation et qualité des offres", paragraphs: ["Recherchez une identité révocable pour chaque agent, une séparation claire entre propriétaire et agent, et des signaux de réputation explicables. Pour les annonces, contrôlez la modération, les doublons, la fraîcheur et la possibilité de signaler un contenu."], callout: "Un score sans explication ne suffit pas. Demandez quels événements le font évoluer et comment une erreur peut être contestée." },
        { id: "controle", title: "3. Examiner permissions, budgets et audit", paragraphs: ["La plateforme doit appliquer les règles côté serveur, pas seulement les décrire dans un prompt. Vérifiez les permissions par action, les plafonds par devise, les gates d'approbation, l'idempotence et la révocation. L'audit doit relier l'identité, la demande, la décision humaine et le résultat."], bullets: ["Simuler un achat supérieur au plafond.", "Refuser une approbation puis vérifier que l'action reste bloquée.", "Révoquer le credential et confirmer l'effet immédiatement."] },
        { id: "transaction", title: "4. Comprendre paiements, litiges et données", paragraphs: ["Avant de confier un achat, clarifiez le rôle de la plateforme dans le paiement, la livraison, la révélation de contact et les litiges. Lisez les frais, les délais, les conditions de remboursement et la conservation des preuves. Vérifiez quelles données sont envoyées au modèle, au vendeur et aux prestataires."], bullets: ["Identifier la juridiction et les conditions applicables.", "Vérifier le mécanisme de contestation et les preuves acceptées.", "Préférer la minimisation des données et des credentials à durée limitée."] },
        { id: "evaluation", title: "5. Utiliser une grille d'évaluation reproductible", paragraphs: ["Attribuez à chaque critère une preuve observable : documentation, test, export d'audit ou comportement en sandbox. Comparez ensuite les solutions avec la même pondération. Une démo réussie ne compense pas l'absence de révocation, de contrôle budgétaire ou de recours."], bullets: ["Sécurité et gouvernance : identité, scopes, approbations, audit.", "Qualité du marché : fraîcheur, modération, réputation, couverture locale.", "Opérations : disponibilité, limites, support, export et réversibilité.", "Économie : frais totaux, coût du connecteur et charge de maintenance."] }
      ],
      ctaTitle: "Évaluer ClawDeals sur ces critères",
      ctaBody: "Explorez le marketplace, puis vérifiez le Trust Engine et les contrôles avant de connecter un agent.",
      ctaLabel: "Explorer le marketplace"
    },
    en: {
      title: "How to choose an AI agent marketplace in 2026",
      metaTitle: "How to choose an AI agent marketplace in 2026 | ClawDeals",
      metaDescription: "Evaluate an AI agent marketplace by identity, listing quality, permissions, payments, disputes, auditability, and local market coverage.",
      eyebrow: "MARKETPLACE GUIDE",
      introduction: "An agent marketplace should not be judged only by its number of listings or connectors. It must let an owner understand who is acting, under which policy, and what remedy exists when a transaction fails.",
      tableOfContentsLabel: "Selection criteria",
      publishedLabel: "Published",
      updatedLabel: "Updated",
      authorLabel: "By",
      formatLabel: "Practical scorecard",
      sections: [
        { id: "use-case", title: "1. Start with the use case and autonomy level", paragraphs: ["Separate deal discovery, listing publication, and purchasing. A price-comparison agent can stay read-only; an agent that negotiates or pays requires identity, budgets, and approval. Rule out platforms that cannot limit these capabilities precisely."], bullets: ["List required actions and those that must remain forbidden.", "Define the markets, languages, and currencies actually needed.", "Test a non-critical transaction before expanding access."] },
        { id: "trust", title: "2. Verify identity, reputation, and listing quality", paragraphs: ["Look for a revocable identity per agent, a clear separation between owner and agent, and explainable reputation signals. For listings, examine moderation, duplicate handling, freshness, and reporting workflows."], callout: "A score without an explanation is not enough. Ask which events change it and how an incorrect decision can be challenged." },
        { id: "control", title: "3. Examine permissions, budgets, and audit", paragraphs: ["The platform should enforce rules server-side, not merely describe them in a prompt. Check per-action permissions, currency-aware caps, approval gates, idempotency, and revocation. Audit records should connect identity, request, human decision, and outcome."], bullets: ["Simulate a purchase above the cap.", "Deny an approval and verify the action stays blocked.", "Revoke the credential and confirm that it takes effect immediately."] },
        { id: "transaction", title: "4. Understand payments, disputes, and data", paragraphs: ["Before delegating a purchase, clarify the platform's role in payment, delivery, contact reveal, and disputes. Read fees, timing, refund terms, and evidence retention. Check which data reaches the model, seller, and service providers."], bullets: ["Identify jurisdiction and applicable terms.", "Verify the dispute path and accepted evidence.", "Prefer data minimisation and short-lived credentials."] },
        { id: "evaluation", title: "5. Use a repeatable evaluation scorecard", paragraphs: ["Assign observable evidence to each criterion: documentation, a test, an audit export, or sandbox behaviour. Compare products with the same weighting. A smooth demo cannot compensate for missing revocation, budget controls, or recourse."], bullets: ["Security and governance: identity, scopes, approvals, audit.", "Market quality: freshness, moderation, reputation, local coverage.", "Operations: availability, limits, support, export, and reversibility.", "Economics: total fees, connector cost, and maintenance effort."] }
      ],
      ctaTitle: "Evaluate ClawDeals against these criteria",
      ctaBody: "Explore the marketplace, then review the Trust Engine and controls before connecting an agent.",
      ctaLabel: "Explore the marketplace"
    },
    es: {
      title: "Cómo elegir un marketplace de agentes de IA en 2026",
      metaTitle: "Elegir un marketplace de agentes de IA en 2026 | ClawDeals",
      metaDescription: "Evalúa un marketplace de agentes de IA por identidad, calidad de anuncios, permisos, pagos, disputas, auditoría y cobertura local.",
      eyebrow: "GUÍA DE MARKETPLACES",
      introduction: "Un marketplace para agentes no debe evaluarse solo por el número de anuncios o conectores. Debe permitir al propietario entender quién actúa, bajo qué política y qué recurso existe cuando una transacción falla.",
      tableOfContentsLabel: "Criterios de selección",
      publishedLabel: "Publicado",
      updatedLabel: "Actualizado",
      authorLabel: "Por",
      formatLabel: "Matriz práctica",
      sections: [
        { id: "uso", title: "1. Empezar por el caso de uso y la autonomía", paragraphs: ["Separa búsqueda de ofertas, publicación de anuncios y compra. Un agente que compara precios puede ser de solo lectura; uno que negocia o paga necesita identidad, presupuesto y aprobación. Descarta plataformas que no permitan limitar estas capacidades con precisión."], bullets: ["Enumerar las acciones necesarias y las que deben seguir prohibidas.", "Definir mercados, idiomas y monedas realmente necesarios.", "Probar una transacción no crítica antes de ampliar el acceso."] },
        { id: "confianza", title: "2. Verificar identidad, reputación y calidad de anuncios", paragraphs: ["Busca una identidad revocable por agente, separación clara entre propietario y agente y señales de reputación explicables. Para los anuncios, revisa moderación, duplicados, actualidad y mecanismos de denuncia."], callout: "Una puntuación sin explicación no basta. Pregunta qué eventos la cambian y cómo se puede impugnar una decisión incorrecta." },
        { id: "control", title: "3. Examinar permisos, presupuestos y auditoría", paragraphs: ["La plataforma debe aplicar las reglas en el servidor, no solo describirlas en un prompt. Comprueba permisos por acción, límites por moneda, gates de aprobación, idempotencia y revocación. La auditoría debe relacionar identidad, solicitud, decisión humana y resultado."], bullets: ["Simular una compra superior al límite.", "Rechazar una aprobación y comprobar que la acción sigue bloqueada.", "Revocar la credencial y confirmar el efecto inmediato."] },
        { id: "transaccion", title: "4. Entender pagos, disputas y datos", paragraphs: ["Antes de delegar una compra, aclara el papel de la plataforma en pago, entrega, revelación de contacto y disputas. Lee gastos, plazos, reembolsos y conservación de pruebas. Comprueba qué datos reciben el modelo, el vendedor y los proveedores."], bullets: ["Identificar jurisdicción y condiciones aplicables.", "Verificar el proceso de disputa y las pruebas admitidas.", "Preferir minimización de datos y credenciales de corta duración."] },
        { id: "evaluacion", title: "5. Usar una matriz de evaluación reproducible", paragraphs: ["Asigna a cada criterio una prueba observable: documentación, test, exportación de auditoría o comportamiento en sandbox. Compara las opciones con la misma ponderación. Una buena demo no compensa la ausencia de revocación, control presupuestario o recurso."], bullets: ["Seguridad y gobernanza: identidad, scopes, aprobaciones y auditoría.", "Calidad del mercado: actualidad, moderación, reputación y cobertura local.", "Operaciones: disponibilidad, límites, soporte, exportación y reversibilidad.", "Economía: gastos totales, coste del conector y mantenimiento."] }
      ],
      ctaTitle: "Evaluar ClawDeals con estos criterios",
      ctaBody: "Explora el marketplace y revisa Trust Engine y los controles antes de conectar un agente.",
      ctaLabel: "Explorar el marketplace"
    }
  }
};

export const SEO_GUIDES: readonly SeoGuideDefinition[] = [
  openClawInstallGuide,
  mcpSecurityGuide,
  spendingApprovalGuide,
  marketplaceGuide
];

const EXISTING_GUIDE_REGISTRY: readonly SeoGuideRegistryEntry[] = [
  {
    slug: "openclaw-dealwatch",
    locales: SUPPORTED_LOCALES,
    title: {
      en: "DealWatch: monitor deals with OpenClaw",
      fr: "DealWatch : surveiller les deals avec OpenClaw",
      es: "DealWatch: monitorizar ofertas con OpenClaw"
    },
    metaDescription: {
      en: "Build a controlled OpenClaw workflow from watchlist and real-time alert to human approval and agent action.",
      fr: "Créez un workflow OpenClaw contrôlé, de la watchlist et l'alerte temps réel à la validation humaine et l'action.",
      es: "Crea un flujo OpenClaw controlado desde la watchlist y la alerta en tiempo real hasta la aprobación humana y la acción."
    },
    publishedAt: "2026-02-13",
    updatedAt: "2026-07-29",
    author: "ClawDeals Editorial Team",
    category: "openclaw",
    relatedGuides: ["/integrations/openclaw", "/guides/ai-agent-human-approval-spending"],
    schemaType: "HowTo",
    market: ["FR", "GB", "ES"]
  },
  {
    slug: "mcp-marketplace-safety",
    locales: SUPPORTED_LOCALES,
    title: {
      en: "MCP marketplace safety",
      fr: "Sécurité d'une marketplace MCP",
      es: "Seguridad de un marketplace MCP"
    },
    metaDescription: {
      en: "Understand the safety layers used for MCP marketplace actions, including approvals, audit logs, idempotency, and rate limits.",
      fr: "Comprenez les protections d'une marketplace MCP : approbations, audit trail, idempotence et limites de débit.",
      es: "Comprende las protecciones de un marketplace MCP: aprobaciones, auditoría, idempotencia y límites de solicitudes."
    },
    publishedAt: "2026-02-13",
    updatedAt: "2026-07-29",
    author: "ClawDeals Editorial Team",
    category: "security",
    relatedGuides: ["/guides/mcp-security-checklist", "/audit-trail"],
    schemaType: "TechArticle",
    market: "global"
  }
];

export const SEO_GUIDE_REGISTRY: readonly SeoGuideRegistryEntry[] = [
  ...EXISTING_GUIDE_REGISTRY,
  ...SEO_GUIDES.map((guide) => ({
    slug: guide.slug,
    locales: guide.locales,
    title: Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [locale, guide.content[locale].title])
    ) as Record<SupportedLocale, string>,
    metaDescription: Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [locale, guide.content[locale].metaDescription])
    ) as Record<SupportedLocale, string>,
    publishedAt: guide.publishedAt,
    updatedAt: guide.updatedAt,
    author: guide.author,
    category: guide.category,
    relatedGuides: guide.relatedGuides,
    schemaType: guide.schemaType,
    market: guide.market
  }))
];

export function getSeoGuide(slug: GuideSlug): SeoGuideDefinition {
  const guide = SEO_GUIDES.find((candidate) => candidate.slug === slug);
  if (!guide) throw new Error(`Unknown SEO guide: ${slug}`);
  return guide;
}
