import type { SupportedLocale } from "../shared/i18n";
import type { GuideSlug } from "./seo-guides";

export type GuideComparisonTable = {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
};

export type GuideFaq = {
  question: string;
  answer: string;
};

export type GuideSource = {
  label: string;
  publisher: string;
  url: string;
};

export type SeoGuideEnhancement = {
  table: GuideComparisonTable;
  faqHeading: string;
  faqs: readonly GuideFaq[];
  sourcesHeading: string;
  sourcesIntro: string;
  sources: readonly GuideSource[];
};

const OPENCLAW_SOURCES = [
  {
    label: "Skills",
    publisher: "OpenClaw documentation",
    url: "https://docs.openclaw.ai/tools/skills"
  },
  {
    label: "ClawHub registry",
    publisher: "OpenClaw documentation",
    url: "https://docs.openclaw.ai/clawhub"
  },
  {
    label: "Security best practices",
    publisher: "Model Context Protocol",
    url: "https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices"
  }
] as const;

const MCP_SOURCES = [
  {
    label: "Security best practices",
    publisher: "Model Context Protocol",
    url: "https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices"
  },
  {
    label: "Client security best practices",
    publisher: "Model Context Protocol",
    url: "https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices"
  },
  {
    label: "OAuth 2.0 Security Best Current Practice (RFC 9700)",
    publisher: "RFC Editor",
    url: "https://www.rfc-editor.org/rfc/rfc9700.html"
  }
] as const;

const GOVERNANCE_SOURCES = [
  {
    label: "Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile",
    publisher: "NIST",
    url: "https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence"
  },
  {
    label: "Client security best practices",
    publisher: "Model Context Protocol",
    url: "https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices"
  },
  {
    label: "ClawDeals policy manifest",
    publisher: "ClawDeals",
    url: "/policies.md"
  }
] as const;

const MARKETPLACE_SOURCES = [
  {
    label: "How ClawHub works",
    publisher: "OpenClaw documentation",
    url: "https://docs.openclaw.ai/clawhub/how-it-works"
  },
  {
    label: "Skills",
    publisher: "OpenClaw documentation",
    url: "https://docs.openclaw.ai/tools/skills"
  },
  {
    label: "Security best practices",
    publisher: "Model Context Protocol",
    url: "https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices"
  },
  {
    label: "Artificial Intelligence Risk Management Framework: Generative Artificial Intelligence Profile",
    publisher: "NIST",
    url: "https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence"
  }
] as const;

export const SEO_GUIDE_ENHANCEMENTS: Record<GuideSlug, Record<SupportedLocale, SeoGuideEnhancement>> = {
  "openclaw-skill-vs-mcp-vs-clawhub": {
    en: {
      table: {
        caption: "Comparison of the three OpenClaw connection paths",
        columns: ["Option", "Best fit", "Main trade-off"],
        rows: [
          ["Skill URL", "Evaluation and low-maintenance instructions", "The remote source and requested permissions still require review"],
          ["MCP server", "Structured tools, version pinning, and monitored production use", "You operate a runtime and its secrets"],
          ["ClawHub", "Teams already managing skills through the registry", "Registry delivery does not replace publisher and change review"]
        ]
      },
      faqHeading: "Frequently asked questions",
      faqs: [
        {
          question: "Does ClawHub replace an MCP server?",
          answer: "No. ClawHub distributes skills, while MCP defines a protocol for exposing structured tools and resources. A deployment can use one or both depending on the client and operating model."
        },
        {
          question: "Which option should I test first?",
          answer: "Start with the path that matches your existing controls. A Skill URL has less setup, while MCP is more appropriate when you already require pinned versions, isolated secrets, and tool-level logs."
        },
        {
          question: "Do installation choices enforce spending limits?",
          answer: "No. Installation and distribution do not replace budgets, approval rules, revocation, or audit controls configured around marketplace actions."
        }
      ],
      sourcesHeading: "Sources and review basis",
      sourcesIntro: "The comparison was reviewed against the following primary documentation on 18 July 2026.",
      sources: OPENCLAW_SOURCES
    },
    fr: {
      table: {
        caption: "Comparaison des trois méthodes de connexion à OpenClaw",
        columns: ["Option", "Cas adapté", "Compromis principal"],
        rows: [
          ["Skill URL", "Évaluation et instructions avec peu de maintenance", "La source distante et les permissions demandées restent à vérifier"],
          ["Serveur MCP", "Outils structurés, version épinglée et usage supervisé en production", "Vous exploitez un runtime et ses secrets"],
          ["ClawHub", "Équipes qui gèrent déjà leurs skills via ce registre", "La distribution ne remplace pas la vérification de l'éditeur et des changements"]
        ]
      },
      faqHeading: "Questions fréquentes",
      faqs: [
        {
          question: "ClawHub remplace-t-il un serveur MCP ?",
          answer: "Non. ClawHub distribue des skills, tandis que MCP définit un protocole pour exposer des outils et ressources structurés. Un déploiement peut utiliser l'un, l'autre ou les deux selon le client et le modèle d'exploitation."
        },
        {
          question: "Quelle option tester en premier ?",
          answer: "Commencez par la méthode compatible avec vos contrôles existants. Une Skill URL demande moins de configuration ; MCP est plus adapté si vous exigez déjà des versions épinglées, des secrets isolés et des journaux par outil."
        },
        {
          question: "Le mode d'installation applique-t-il les limites de dépense ?",
          answer: "Non. L'installation et la distribution ne remplacent ni les budgets, ni les règles d'approbation, ni la révocation, ni l'audit des actions marketplace."
        }
      ],
      sourcesHeading: "Sources et méthode de révision",
      sourcesIntro: "Cette comparaison a été vérifiée le 18 juillet 2026 à partir des documentations primaires suivantes.",
      sources: OPENCLAW_SOURCES
    },
    es: {
      table: {
        caption: "Comparación de las tres formas de conectar OpenClaw",
        columns: ["Opción", "Uso adecuado", "Principal contrapartida"],
        rows: [
          ["Skill URL", "Evaluación e instrucciones con poco mantenimiento", "La fuente remota y los permisos solicitados aún deben revisarse"],
          ["Servidor MCP", "Herramientas estructuradas, versión fijada y uso supervisado en producción", "Debes operar un runtime y sus secretos"],
          ["ClawHub", "Equipos que ya gestionan skills mediante el registro", "La distribución no sustituye la revisión del editor y los cambios"]
        ]
      },
      faqHeading: "Preguntas frecuentes",
      faqs: [
        {
          question: "¿ClawHub sustituye a un servidor MCP?",
          answer: "No. ClawHub distribuye skills, mientras que MCP define un protocolo para exponer herramientas y recursos estructurados. Un despliegue puede usar uno o ambos según el cliente y el modelo operativo."
        },
        {
          question: "¿Qué opción debería probar primero?",
          answer: "Empieza por la vía que encaje con tus controles actuales. Una Skill URL requiere menos configuración; MCP es más apropiado si ya necesitas versiones fijadas, secretos aislados y registros por herramienta."
        },
        {
          question: "¿La instalación aplica límites de gasto?",
          answer: "No. La instalación y la distribución no sustituyen los presupuestos, las reglas de aprobación, la revocación ni la auditoría de las acciones del marketplace."
        }
      ],
      sourcesHeading: "Fuentes y método de revisión",
      sourcesIntro: "La comparación se revisó el 18 de julio de 2026 con la siguiente documentación primaria.",
      sources: OPENCLAW_SOURCES
    }
  },
  "mcp-security-checklist": {
    en: {
      table: {
        caption: "Minimum controls to verify before production",
        columns: ["Control", "Evidence to verify", "Failure signal"],
        rows: [
          ["Identity and scope", "A dedicated identity and least-privilege tool allowlist", "A shared token or tools enabled by default"],
          ["Secrets", "Runtime injection, rotation, and revocation procedure", "Credentials in prompts, logs, or source control"],
          ["Approval", "A server-side rule for financial or irreversible actions", "The model can bypass the approval path"],
          ["Audit", "Request IDs, actor, tool, decision, and outcome", "A transaction cannot be traced end to end"]
        ]
      },
      faqHeading: "Frequently asked questions",
      faqs: [
        {
          question: "Is a trusted MCP server enough to secure a client?",
          answer: "No. The client still needs explicit consent, safe token handling, validated redirect flows, tool visibility, and controls against confused-deputy and prompt-injection risks."
        },
        {
          question: "Should an MCP client store a bearer token in its configuration file?",
          answer: "Prefer a secret store or runtime injection. If local storage is unavoidable, restrict permissions, exclude the file from source control, and document rotation and revocation."
        },
        {
          question: "What should block a production launch?",
          answer: "Block launch when sensitive tools lack least privilege, approval cannot be enforced outside the model, secrets cannot be revoked, or actions cannot be reconciled with an audit record."
        }
      ],
      sourcesHeading: "Sources and review basis",
      sourcesIntro: "This checklist was reviewed against the following primary security guidance on 18 July 2026.",
      sources: MCP_SOURCES
    },
    fr: {
      table: {
        caption: "Contrôles minimaux à vérifier avant la production",
        columns: ["Contrôle", "Preuve à vérifier", "Signal d'échec"],
        rows: [
          ["Identité et portée", "Une identité dédiée et une allowlist d'outils au moindre privilège", "Un jeton partagé ou des outils activés par défaut"],
          ["Secrets", "Injection à l'exécution, rotation et procédure de révocation", "Identifiants dans les prompts, journaux ou le dépôt"],
          ["Approbation", "Une règle côté serveur pour les actions financières ou irréversibles", "Le modèle peut contourner le parcours d'approbation"],
          ["Audit", "Identifiant de requête, acteur, outil, décision et résultat", "Une transaction ne peut pas être retracée de bout en bout"]
        ]
      },
      faqHeading: "Questions fréquentes",
      faqs: [
        {
          question: "Un serveur MCP de confiance suffit-il à sécuriser le client ?",
          answer: "Non. Le client doit aussi gérer le consentement explicite, les jetons, les redirections, la visibilité des outils et les risques de confusion d'autorité ou d'injection de prompt."
        },
        {
          question: "Un client MCP peut-il stocker un bearer token dans sa configuration ?",
          answer: "Préférez un coffre de secrets ou une injection à l'exécution. Si le stockage local est inévitable, limitez les permissions, excluez le fichier du dépôt et documentez rotation et révocation."
        },
        {
          question: "Quel défaut doit bloquer la mise en production ?",
          answer: "Bloquez le lancement si les outils sensibles n'appliquent pas le moindre privilège, si l'approbation dépend uniquement du modèle, si les secrets ne sont pas révocables ou si les actions ne sont pas rapprochables d'un audit."
        }
      ],
      sourcesHeading: "Sources et méthode de révision",
      sourcesIntro: "Cette checklist a été vérifiée le 18 juillet 2026 à partir des recommandations de sécurité primaires suivantes.",
      sources: MCP_SOURCES
    },
    es: {
      table: {
        caption: "Controles mínimos antes de producción",
        columns: ["Control", "Prueba que verificar", "Señal de fallo"],
        rows: [
          ["Identidad y alcance", "Una identidad dedicada y una lista de herramientas con privilegios mínimos", "Un token compartido o herramientas activadas por defecto"],
          ["Secretos", "Inyección en ejecución, rotación y procedimiento de revocación", "Credenciales en prompts, registros o el repositorio"],
          ["Aprobación", "Una regla del servidor para acciones financieras o irreversibles", "El modelo puede evitar el flujo de aprobación"],
          ["Auditoría", "ID de solicitud, actor, herramienta, decisión y resultado", "No es posible rastrear una transacción de extremo a extremo"]
        ]
      },
      faqHeading: "Preguntas frecuentes",
      faqs: [
        {
          question: "¿Un servidor MCP de confianza basta para proteger el cliente?",
          answer: "No. El cliente también necesita consentimiento explícito, gestión segura de tokens y redirecciones, visibilidad de herramientas y controles frente a confusión de autoridad e inyección de prompts."
        },
        {
          question: "¿Debe un cliente MCP guardar un bearer token en su configuración?",
          answer: "Es preferible un almacén de secretos o la inyección en ejecución. Si el almacenamiento local es inevitable, restringe permisos, excluye el archivo del repositorio y documenta rotación y revocación."
        },
        {
          question: "¿Qué debe bloquear el lanzamiento a producción?",
          answer: "Bloquea el lanzamiento si las herramientas sensibles no tienen privilegios mínimos, la aprobación depende solo del modelo, los secretos no se pueden revocar o las acciones no se pueden conciliar con una auditoría."
        }
      ],
      sourcesHeading: "Fuentes y método de revisión",
      sourcesIntro: "La checklist se revisó el 18 de julio de 2026 con las siguientes guías primarias de seguridad.",
      sources: MCP_SOURCES
    }
  },
  "ai-agent-human-approval-spending": {
    en: {
      table: {
        caption: "Example approval tiers to adapt to your own risk policy",
        columns: ["Risk tier", "Example", "Default decision", "Evidence to retain"],
        rows: [
          ["Low", "Read-only search or comparison", "Allow within the declared scope", "Query, sources, and agent identity"],
          ["Medium", "Reversible reservation or seller message", "Allow only within a narrow policy", "Policy version, inputs, and result"],
          ["High", "Payment, binding purchase, or irreversible action", "Require human approval", "Approver, decision time, amount, and final outcome"]
        ]
      },
      faqHeading: "Frequently asked questions",
      faqs: [
        {
          question: "Should every agent action require approval?",
          answer: "Not necessarily. Read-only and low-impact actions can follow a documented allowlist, while financial, binding, or irreversible actions should cross an independently enforced approval boundary."
        },
        {
          question: "Can the model decide whether its own purchase needs approval?",
          answer: "The model may describe context, but the final gate should be enforced by server-side policy using trusted inputs such as amount, action type, account, and market."
        },
        {
          question: "What belongs in an approval record?",
          answer: "Keep the actor, agent, requested action, material parameters, policy version, decision, approver when applicable, timestamps, request ID, and outcome."
        }
      ],
      sourcesHeading: "Sources and review basis",
      sourcesIntro: "The governance model was reviewed against the following primary material on 18 July 2026.",
      sources: GOVERNANCE_SOURCES
    },
    fr: {
      table: {
        caption: "Exemple de niveaux d'approbation à adapter à votre politique de risque",
        columns: ["Niveau de risque", "Exemple", "Décision par défaut", "Preuve à conserver"],
        rows: [
          ["Faible", "Recherche ou comparaison en lecture seule", "Autoriser dans le périmètre déclaré", "Requête, sources et identité de l'agent"],
          ["Moyen", "Réservation réversible ou message à un vendeur", "Autoriser uniquement dans une politique étroite", "Version de politique, entrées et résultat"],
          ["Élevé", "Paiement, achat engageant ou action irréversible", "Exiger une approbation humaine", "Approbateur, heure de décision, montant et résultat final"]
        ]
      },
      faqHeading: "Questions fréquentes",
      faqs: [
        {
          question: "Chaque action d'un agent doit-elle être approuvée ?",
          answer: "Pas nécessairement. Les actions en lecture seule et à faible impact peuvent suivre une allowlist documentée ; les actions financières, engageantes ou irréversibles doivent franchir une approbation appliquée indépendamment du modèle."
        },
        {
          question: "Le modèle peut-il décider lui-même si son achat exige une approbation ?",
          answer: "Le modèle peut décrire le contexte, mais le contrôle final doit être appliqué côté serveur à partir d'entrées fiables comme le montant, le type d'action, le compte et le marché."
        },
        {
          question: "Que doit contenir une preuve d'approbation ?",
          answer: "Conservez l'acteur, l'agent, l'action demandée, les paramètres matériels, la version de politique, la décision, l'approbateur si nécessaire, les horodatages, l'identifiant de requête et le résultat."
        }
      ],
      sourcesHeading: "Sources et méthode de révision",
      sourcesIntro: "Ce modèle de gouvernance a été vérifié le 18 juillet 2026 à partir des documents primaires suivants.",
      sources: GOVERNANCE_SOURCES
    },
    es: {
      table: {
        caption: "Ejemplo de niveles de aprobación que debes adaptar a tu política de riesgo",
        columns: ["Nivel de riesgo", "Ejemplo", "Decisión predeterminada", "Prueba que conservar"],
        rows: [
          ["Bajo", "Búsqueda o comparación de solo lectura", "Permitir dentro del alcance declarado", "Consulta, fuentes e identidad del agente"],
          ["Medio", "Reserva reversible o mensaje a un vendedor", "Permitir solo dentro de una política limitada", "Versión de política, entradas y resultado"],
          ["Alto", "Pago, compra vinculante o acción irreversible", "Exigir aprobación humana", "Aprobador, hora de decisión, importe y resultado final"]
        ]
      },
      faqHeading: "Preguntas frecuentes",
      faqs: [
        {
          question: "¿Todas las acciones del agente necesitan aprobación?",
          answer: "No necesariamente. Las acciones de solo lectura y bajo impacto pueden seguir una lista documentada; las acciones financieras, vinculantes o irreversibles deben cruzar una aprobación aplicada de forma independiente al modelo."
        },
        {
          question: "¿Puede el modelo decidir si su propia compra necesita aprobación?",
          answer: "El modelo puede describir el contexto, pero el control final debe aplicarse en el servidor con datos fiables como el importe, el tipo de acción, la cuenta y el mercado."
        },
        {
          question: "¿Qué debe incluir un registro de aprobación?",
          answer: "Conserva el actor, el agente, la acción solicitada, los parámetros materiales, la versión de la política, la decisión, el aprobador si corresponde, las marcas de tiempo, el ID de solicitud y el resultado."
        }
      ],
      sourcesHeading: "Fuentes y método de revisión",
      sourcesIntro: "El modelo de gobernanza se revisó el 18 de julio de 2026 con los siguientes documentos primarios.",
      sources: GOVERNANCE_SOURCES
    }
  },
  "ai-agent-marketplace": {
    en: {
      table: {
        caption: "Marketplace evaluation scorecard",
        columns: ["Criterion", "Evidence to request", "Warning sign"],
        rows: [
          ["Publisher and artifact", "Publisher identity, version, changelog, and integrity information", "No attributable publisher or mutable unversioned artifact"],
          ["Permissions", "Declared tools, data access, outbound domains, and least-privilege defaults", "Broad or hidden permissions"],
          ["Transaction controls", "Budgets, approval boundaries, idempotency, and revocation", "The agent can commit an irreversible action without an external gate"],
          ["Audit and incidents", "Request-level logs, correction channel, and response procedure", "No trace linking a decision to its outcome"]
        ]
      },
      faqHeading: "Frequently asked questions",
      faqs: [
        {
          question: "Is a large catalogue proof that a marketplace is safe?",
          answer: "No. Catalogue size does not establish publisher identity, artifact integrity, permission quality, transaction controls, or incident response. Evaluate those controls directly."
        },
        {
          question: "What should I inspect before installing an agent skill?",
          answer: "Check the publisher, version, source or artifact, requested permissions, outbound access, update history, revocation path, and how sensitive actions are approved and audited."
        },
        {
          question: "Can a trust score replace my own policy?",
          answer: "No. A score can help prioritise review, but your policy should independently enforce allowed tools, budgets, approval thresholds, and revocation."
        }
      ],
      sourcesHeading: "Sources and review basis",
      sourcesIntro: "The scorecard was reviewed against the following primary documentation on 18 July 2026.",
      sources: MARKETPLACE_SOURCES
    },
    fr: {
      table: {
        caption: "Grille d'évaluation d'une marketplace",
        columns: ["Critère", "Preuve à demander", "Signal d'alerte"],
        rows: [
          ["Éditeur et artefact", "Identité de l'éditeur, version, changelog et informations d'intégrité", "Aucun éditeur attribuable ou artefact mutable sans version"],
          ["Permissions", "Outils, accès aux données, domaines sortants et moindre privilège déclarés", "Permissions larges ou masquées"],
          ["Contrôles de transaction", "Budgets, approbation, idempotence et révocation", "L'agent peut engager une action irréversible sans contrôle externe"],
          ["Audit et incidents", "Journaux par requête, canal de correction et procédure de réponse", "Aucune trace reliant une décision à son résultat"]
        ]
      },
      faqHeading: "Questions fréquentes",
      faqs: [
        {
          question: "Un grand catalogue prouve-t-il qu'une marketplace est sûre ?",
          answer: "Non. La taille du catalogue n'établit ni l'identité des éditeurs, ni l'intégrité des artefacts, ni la qualité des permissions, ni les contrôles de transaction ou la réponse aux incidents."
        },
        {
          question: "Que vérifier avant d'installer un skill d'agent ?",
          answer: "Vérifiez l'éditeur, la version, la source ou l'artefact, les permissions, les accès sortants, l'historique des mises à jour, la révocation et la façon dont les actions sensibles sont approuvées et auditées."
        },
        {
          question: "Un score de confiance peut-il remplacer ma politique ?",
          answer: "Non. Un score peut prioriser la revue, mais votre politique doit appliquer séparément les outils autorisés, les budgets, les seuils d'approbation et la révocation."
        }
      ],
      sourcesHeading: "Sources et méthode de révision",
      sourcesIntro: "Cette grille a été vérifiée le 18 juillet 2026 à partir des documentations primaires suivantes.",
      sources: MARKETPLACE_SOURCES
    },
    es: {
      table: {
        caption: "Tabla de evaluación de un marketplace",
        columns: ["Criterio", "Prueba que solicitar", "Señal de alerta"],
        rows: [
          ["Editor y artefacto", "Identidad del editor, versión, changelog e información de integridad", "Editor no atribuible o artefacto mutable sin versión"],
          ["Permisos", "Herramientas, acceso a datos, dominios salientes y privilegios mínimos declarados", "Permisos amplios u ocultos"],
          ["Controles de transacción", "Presupuestos, aprobación, idempotencia y revocación", "El agente puede ejecutar una acción irreversible sin control externo"],
          ["Auditoría e incidentes", "Registros por solicitud, canal de corrección y procedimiento de respuesta", "Ningún rastro que relacione una decisión con su resultado"]
        ]
      },
      faqHeading: "Preguntas frecuentes",
      faqs: [
        {
          question: "¿Un catálogo grande demuestra que un marketplace es seguro?",
          answer: "No. El tamaño del catálogo no acredita la identidad del editor, la integridad del artefacto, la calidad de los permisos, los controles de transacción ni la respuesta a incidentes."
        },
        {
          question: "¿Qué debo revisar antes de instalar una skill de agente?",
          answer: "Comprueba el editor, la versión, la fuente o artefacto, los permisos, el acceso saliente, el historial de actualizaciones, la revocación y cómo se aprueban y auditan las acciones sensibles."
        },
        {
          question: "¿Una puntuación de confianza puede sustituir mi política?",
          answer: "No. Una puntuación puede priorizar la revisión, pero tu política debe aplicar de forma independiente las herramientas permitidas, los presupuestos, los umbrales de aprobación y la revocación."
        }
      ],
      sourcesHeading: "Fuentes y método de revisión",
      sourcesIntro: "La tabla se revisó el 18 de julio de 2026 con la siguiente documentación primaria.",
      sources: MARKETPLACE_SOURCES
    }
  }
};

export function getSeoGuideEnhancement(slug: GuideSlug, locale: SupportedLocale): SeoGuideEnhancement {
  return SEO_GUIDE_ENHANCEMENTS[slug][locale];
}
