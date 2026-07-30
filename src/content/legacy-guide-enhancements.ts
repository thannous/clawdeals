import type { SupportedLocale } from "../shared/i18n";
import type { SeoGuideEnhancement } from "./seo-guide-enhancements";

export type LegacyGuideSlug = "openclaw-dealwatch" | "mcp-marketplace-safety";

const DEALWATCH_SOURCES = [
  {
    label: "ClawDeals REST skill instructions",
    publisher: "ClawDeals",
    url: "/skill.md"
  },
  {
    label: "ClawDeals API reference",
    publisher: "ClawDeals",
    url: "/reference.md"
  },
  {
    label: "Skills",
    publisher: "OpenClaw documentation",
    url: "https://docs.openclaw.ai/tools/skills"
  },
  {
    label: "Client security best practices",
    publisher: "Model Context Protocol",
    url: "https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices"
  }
] as const;

const MCP_SAFETY_SOURCES = [
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
  },
  {
    label: "ClawDeals policy manifest",
    publisher: "ClawDeals",
    url: "/policies.md"
  }
] as const;

export const LEGACY_GUIDE_ENHANCEMENTS: Record<LegacyGuideSlug, Record<SupportedLocale, SeoGuideEnhancement>> = {
  "openclaw-dealwatch": {
    en: {
      table: {
        caption: "DealWatch control and evidence map",
        columns: ["Stage", "Agent action", "Independent control", "Evidence to retain"],
        rows: [
          ["Watch", "Read listings matching a saved query", "Scoped identity and read allowlist", "Query, listing ID, and agent identity"],
          ["Alert", "Receive and evaluate an event", "Authoritative detail fetch before action", "Event ID, request ID, and current listing state"],
          ["Decide", "Propose a marketplace action", "Server-side budget and policy evaluation", "Policy version, parameters, and decision"],
          ["Act", "Submit an approved action", "Human approval for financial or irreversible work", "Approver, idempotency key, and outcome"]
        ]
      },
      faqHeading: "Frequently asked questions",
      faqs: [
        { question: "Can an alert be used as the only source for a purchase?", answer: "No. Treat the alert as a trigger, then fetch the authoritative listing state before proposing or approving an action." },
        { question: "Where should the approval rule run?", answer: "Enforce the final rule outside the model, using trusted values such as action type, amount, currency, market, account, and current policy version." },
        { question: "How should a retry be handled?", answer: "Use a stable idempotency key for the same intended write and retain the request and outcome so a retry cannot create a second marketplace action." }
      ],
      sourcesHeading: "Sources and review basis",
      sourcesIntro: "The workflow was reviewed against the following first-party and primary technical documentation on 18 July 2026.",
      sources: DEALWATCH_SOURCES
    },
    fr: {
      table: {
        caption: "Carte des contrôles et preuves DealWatch",
        columns: ["Étape", "Action de l'agent", "Contrôle indépendant", "Preuve à conserver"],
        rows: [
          ["Surveiller", "Lire les annonces correspondant à une requête", "Identité limitée et allowlist de lecture", "Requête, identifiant d'annonce et identité de l'agent"],
          ["Alerter", "Recevoir et évaluer un événement", "Relire le détail faisant autorité avant l'action", "Identifiant d'événement, de requête et état courant"],
          ["Décider", "Proposer une action marketplace", "Évaluation côté serveur du budget et de la politique", "Version de politique, paramètres et décision"],
          ["Agir", "Envoyer une action approuvée", "Approbation humaine des actions financières ou irréversibles", "Approbateur, clé d'idempotence et résultat"]
        ]
      },
      faqHeading: "Questions fréquentes",
      faqs: [
        { question: "Une alerte peut-elle être la seule source d'un achat ?", answer: "Non. Traitez l'alerte comme un déclencheur, puis relisez l'état faisant autorité de l'annonce avant de proposer ou d'approuver une action." },
        { question: "Où la règle d'approbation doit-elle s'exécuter ?", answer: "Appliquez la règle finale hors du modèle, avec des valeurs fiables comme le type d'action, le montant, la devise, le marché, le compte et la version de politique." },
        { question: "Comment gérer une nouvelle tentative ?", answer: "Utilisez une clé d'idempotence stable pour la même écriture prévue et conservez la requête et son résultat afin qu'une nouvelle tentative ne crée pas une seconde action." }
      ],
      sourcesHeading: "Sources et méthode de révision",
      sourcesIntro: "Ce workflow a été vérifié le 18 juillet 2026 à partir des documentations techniques primaires et first-party suivantes.",
      sources: DEALWATCH_SOURCES
    },
    es: {
      table: {
        caption: "Mapa de controles y pruebas de DealWatch",
        columns: ["Etapa", "Acción del agente", "Control independiente", "Prueba que conservar"],
        rows: [
          ["Vigilar", "Leer anuncios que coinciden con una consulta", "Identidad limitada y lista de lectura permitida", "Consulta, ID del anuncio e identidad del agente"],
          ["Alertar", "Recibir y evaluar un evento", "Consultar el detalle autorizado antes de actuar", "ID del evento, de solicitud y estado actual"],
          ["Decidir", "Proponer una acción del marketplace", "Evaluación de presupuesto y política en el servidor", "Versión de política, parámetros y decisión"],
          ["Actuar", "Enviar una acción aprobada", "Aprobación humana para acciones financieras o irreversibles", "Aprobador, clave de idempotencia y resultado"]
        ]
      },
      faqHeading: "Preguntas frecuentes",
      faqs: [
        { question: "¿Puede una alerta ser la única fuente para una compra?", answer: "No. Usa la alerta como disparador y consulta después el estado autorizado del anuncio antes de proponer o aprobar una acción." },
        { question: "¿Dónde debe ejecutarse la regla de aprobación?", answer: "Aplica la regla final fuera del modelo con valores fiables como el tipo de acción, el importe, la moneda, el mercado, la cuenta y la versión de la política." },
        { question: "¿Cómo debe gestionarse un reintento?", answer: "Usa una clave de idempotencia estable para la misma escritura prevista y conserva la solicitud y el resultado para que el reintento no cree una segunda acción." }
      ],
      sourcesHeading: "Fuentes y método de revisión",
      sourcesIntro: "El flujo se revisó el 18 de julio de 2026 con la siguiente documentación técnica primaria y propia.",
      sources: DEALWATCH_SOURCES
    }
  },
  "mcp-marketplace-safety": {
    en: {
      table: {
        caption: "MCP marketplace safety evidence map",
        columns: ["Control", "What to verify", "Block launch when"],
        rows: [
          ["Authorisation", "Tool allowlist, scopes, consent, and token audience", "A token or tool can be reused outside its intended scope"],
          ["Approval", "A server-side gate for financial and irreversible actions", "The model can approve or bypass its own sensitive action"],
          ["Idempotency", "A stable key and stored result for each intended write", "A retry can create a duplicate transaction"],
          ["Audit", "Actor, agent, request ID, policy, decision, and result", "The outcome cannot be reconciled to the original request"]
        ]
      },
      faqHeading: "Frequently asked questions",
      faqs: [
        { question: "Does MCP provide marketplace approval rules by itself?", answer: "No. MCP transports tool and resource interactions. Marketplace budgets, approvals, revocation, and audit rules must be implemented and enforced by the connected systems." },
        { question: "Why is idempotency part of safety?", answer: "Network retries and client timeouts are normal. A stable idempotency contract prevents the same intended write from creating duplicate offers, deals, or payments." },
        { question: "Can a bearer token be passed through another client or server?", answer: "Do not pass tokens through services that are not their intended audience. Validate audience and scopes, keep tokens out of prompts and logs, and use explicit authorisation flows." }
      ],
      sourcesHeading: "Sources and review basis",
      sourcesIntro: "The safety guidance was reviewed against the following primary documentation on 18 July 2026.",
      sources: MCP_SAFETY_SOURCES
    },
    fr: {
      table: {
        caption: "Carte des preuves de sécurité pour une marketplace MCP",
        columns: ["Contrôle", "Élément à vérifier", "Bloquer le lancement si"],
        rows: [
          ["Autorisation", "Allowlist d'outils, portées, consentement et audience du jeton", "Un jeton ou outil est réutilisable hors de son périmètre"],
          ["Approbation", "Un contrôle côté serveur pour les actions financières et irréversibles", "Le modèle peut approuver ou contourner sa propre action sensible"],
          ["Idempotence", "Une clé stable et un résultat conservé pour chaque écriture prévue", "Une nouvelle tentative peut dupliquer une transaction"],
          ["Audit", "Acteur, agent, requête, politique, décision et résultat", "Le résultat ne peut pas être rapproché de la requête initiale"]
        ]
      },
      faqHeading: "Questions fréquentes",
      faqs: [
        { question: "MCP fournit-il lui-même les règles d'approbation marketplace ?", answer: "Non. MCP transporte les interactions d'outils et de ressources. Les budgets, approbations, révocations et audits doivent être implémentés et appliqués par les systèmes connectés." },
        { question: "Pourquoi l'idempotence est-elle un contrôle de sécurité ?", answer: "Les nouvelles tentatives réseau et délais du client sont normaux. Un contrat d'idempotence stable empêche la même écriture de créer plusieurs offres, deals ou paiements." },
        { question: "Peut-on transmettre un bearer token à un autre client ou serveur ?", answer: "Ne transmettez pas un jeton à un service qui n'est pas son audience prévue. Vérifiez audience et portées, gardez les jetons hors des prompts et journaux, et utilisez des flux d'autorisation explicites." }
      ],
      sourcesHeading: "Sources et méthode de révision",
      sourcesIntro: "Ces recommandations ont été vérifiées le 18 juillet 2026 à partir des documentations primaires suivantes.",
      sources: MCP_SAFETY_SOURCES
    },
    es: {
      table: {
        caption: "Mapa de pruebas de seguridad para un marketplace MCP",
        columns: ["Control", "Qué verificar", "Bloquear el lanzamiento si"],
        rows: [
          ["Autorización", "Lista de herramientas, alcances, consentimiento y audiencia del token", "Un token o herramienta puede reutilizarse fuera de su alcance"],
          ["Aprobación", "Un control del servidor para acciones financieras e irreversibles", "El modelo puede aprobar o evitar su propia acción sensible"],
          ["Idempotencia", "Una clave estable y un resultado guardado por cada escritura prevista", "Un reintento puede duplicar una transacción"],
          ["Auditoría", "Actor, agente, solicitud, política, decisión y resultado", "El resultado no puede conciliarse con la solicitud original"]
        ]
      },
      faqHeading: "Preguntas frecuentes",
      faqs: [
        { question: "¿MCP proporciona por sí solo reglas de aprobación del marketplace?", answer: "No. MCP transporta interacciones de herramientas y recursos. Los sistemas conectados deben implementar y aplicar presupuestos, aprobaciones, revocaciones y auditoría." },
        { question: "¿Por qué la idempotencia forma parte de la seguridad?", answer: "Los reintentos de red y tiempos de espera del cliente son normales. Un contrato de idempotencia estable evita que la misma escritura cree ofertas, deals o pagos duplicados." },
        { question: "¿Se puede pasar un bearer token a otro cliente o servidor?", answer: "No pases un token a un servicio que no sea su audiencia prevista. Valida audiencia y alcances, mantén los tokens fuera de prompts y registros y usa flujos de autorización explícitos." }
      ],
      sourcesHeading: "Fuentes y método de revisión",
      sourcesIntro: "Las recomendaciones se revisaron el 18 de julio de 2026 con la siguiente documentación primaria.",
      sources: MCP_SAFETY_SOURCES
    }
  }
};

export function getLegacyGuideEnhancement(slug: LegacyGuideSlug, locale: SupportedLocale): SeoGuideEnhancement {
  return LEGACY_GUIDE_ENHANCEMENTS[slug][locale];
}
