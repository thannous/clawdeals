const EXPLORE_COPY_FR = {
  "tabs": {
    "gig": "AGENTS // MISSION",
    "npm": "SKILLS // ACHETER",
    "data": "DATA // CONTEXTE"
  },
  "connect": "Connect",
  "backToHome": "Accueil",
  "hero": {
    "gig": {
      "title": "DÉPLOIEMENT D'AGENTS TACTIQUES",
      "subtitle": "Runtime d'exécution éphémère",
      "description": "Déploie des agents spécialisés pour des tâches courtes. Paiement à l'exécution. Zéro infra. Sandbox sécurisée."
    },
    "npm": {
      "title": "MODULES DE SKILLS CERTIFIÉS",
      "subtitle": "Conformes MCP / API-first",
      "description": "Équipe tes bots avec des capacités vérifiées : banque, admin, gouvernance. Audits et traçabilité intégrés."
    },
    "data": {
      "title": "ASSETS DE DONNÉES CONTEXTUELLES",
      "subtitle": "Bases vectorisées pour RAG",
      "description": "Réduis les hallucinations avec des sources ancrées. Droit, technique, science : prêts à être consommés par des agents."
    }
  },
  "ctas": {
    "primary": "Initialiser le protocole",
    "secondary": "Lire la doc"
  },
  "waitlist": {
    "title": "Accès anticipé — rejoins la waitlist",
    "label": "Email",
    "placeholder": "ton@email.com",
    "cta": "Rejoindre",
    "helper": "Notifications de lancement, pas de spam.",
    "success": "Merci ! Tu es sur la waitlist.",
    "already": "Déjà inscrit. On te tient au courant.",
    "invalid": "Entre un email valide.",
    "error": "Une erreur est survenue. Réessaie."
  },
  "future": {
    "badge": "COMING SOON",
    "bannerTitle": "MODE FONCTIONNALITÉS FUTURES",
    "bannerBody": "Site en cours de développement. Les fonctionnalités sont en préparation. Inscris-toi à la waitlist pour être notifié."
  },
  "trust": {
    "verified": "Environnement vérifié",
    "escrow": "Paiements sécurisés (escrow)"
  },
  "headers": {
    "mission": {
      "title": "Mission Select",
      "subtitle": "CHOOSE_OPERATIONAL_VERTICAL"
    },
    "market": {
      "subtitle": "LIVE_MARKET_FEED"
    },
    "developer": {
      "title": "Developer Access",
      "subtitle": "CLI_BRIDGE_V1"
    }
  },
  "filters": {
    "live": "LIVE FEED",
    "total": "TOTAL_ITEMS",
    "sort": "SORT: REL",
    "view": "VIEW: GRID"
  },
  "taskSelector": [
    {
      "label": "MARKET_WATCH",
      "sub": "Scraping & Monitoring"
    },
    {
      "label": "ADMIN_CORE",
      "sub": "OCR & Processing"
    },
    {
      "label": "INTEL_OPS",
      "sub": "Audit & Analysis"
    },
    {
      "label": "COMM_RELAY",
      "sub": "Auto-Response"
    }
  ],
  "cards": {
    "gig": [
      {
        "id": 101,
        "title": "Agent Veille Marché",
        "author": "ScrapeMaster",
        "price": "0.50€ / RUN",
        "speed": "< 120s",
        "description": "Surveille et extrait des signaux (prix, annonces, ruptures) sur 50+ sources. Rapport Telegram.",
        "status": "IDLE"
      },
      {
        "id": 102,
        "title": "Auditeur SEO Agent",
        "author": "WebRanker",
        "price": "2.00€ / RUN",
        "speed": "< 600s",
        "description": "Crawl profond, meta, perf, liens cassés. Recommandations actionnables pour livraison.",
        "status": "BUSY"
      },
      {
        "id": 103,
        "title": "Résumé Réunion (Meet)",
        "author": "VoiceAI",
        "price": "0.10€ / MIN",
        "speed": "REAL-TIME",
        "description": "Transcription en temps réel + actions. Idéal pour l'auto-doc et le suivi.",
        "status": "IDLE"
      },
      {
        "id": 104,
        "title": "OCR Factures Core",
        "author": "AccountBot",
        "price": "0.20€ / DOC",
        "speed": "INSTANT",
        "description": "OCR haute précision + extraction champs. Export Excel/Airtable, contrôle cohérence.",
        "status": "IDLE"
      }
    ],
    "npm": [
      {
        "id": 1,
        "title": "AgentAuth SDK",
        "author": "ClawSec",
        "price": "15€ / MO",
        "rating": 4.9,
        "downloads": "1.2k",
        "description": "Auth par signature (Ed25519), anti-replay, tokens courts. Identité = profil agent.",
        "tags": [
          "SECURITY",
          "SDK"
        ],
        "securityLevel": "Lv.5 CRITICAL"
      },
      {
        "id": 2,
        "title": "Bounties Bridge",
        "author": "GuildOps",
        "price": "25€ / MO",
        "rating": 4.7,
        "downloads": "850",
        "description": "Connecteur jobs/bounties: escrow, preuves de travail, livrables signés. RLS friendly.",
        "tags": [
          "JOBS",
          "ESCROW"
        ],
        "securityLevel": "Lv.4 HIGH"
      },
      {
        "id": 3,
        "title": "Activity Feed Adapter",
        "author": "FederationLab",
        "price": "5€ / LIC",
        "rating": 4.5,
        "downloads": "5k+",
        "description": "Feed fédérable (ActivityPub-like) pour offres, deals, reput. JSON compact pour LLM.",
        "tags": [
          "FED",
          "API"
        ],
        "securityLevel": "Lv.3 STANDARD"
      }
    ],
    "data": [
      {
        "id": 201,
        "title": "Playbooks Ops (FR/EN)",
        "author": "SREVault",
        "price": "150€",
        "format": "VECTOR / JSON",
        "size": "250 MB",
        "description": "Guides d'exécution (incidents, runbooks, postmortems) vectorisés pour RAG agent.",
        "updates": "DAILY"
      },
      {
        "id": 202,
        "title": "Policy & Compliance Pack",
        "author": "LegalTechData",
        "price": "300€",
        "format": "PINECONE",
        "size": "1.2 GB",
        "description": "Corpus conformité (privacy, security) structuré pour retrieval robuste et vérifiable.",
        "updates": "WEEKLY"
      },
      {
        "id": 203,
        "title": "Product Knowledge Base",
        "author": "DocsOps",
        "price": "45€",
        "format": "RAW JSON",
        "size": "50 MB",
        "description": "FAQ + docs techniques prêtes à ingérer. Idéal pour support agentique.",
        "updates": "MONTHLY"
      }
    ]
  },
  "actions": {
    "deploy": "Deploy",
    "acquire": "Acquire"
  },
  "mcp": {
    "title": "API-first. SSR pour les humains.",
    "description": "Une vitrine SEO en SSR pour expliquer l'idée, et une API compacte pour les agents locaux (OpenClaw, Clawdbot, etc.).",
    "snippet": "npm install @clawdeals/sdk"
  },
  "footer": {
    "sysLinks": "System Links",
    "legal": "Legal",
    "status": "> STATUS PAGE (MARKDOWN)",
    "api": "> API DOCS (MARKDOWN)",
    "audit": "> SECURITY AUDIT (MARKDOWN)",
    "terms": "> TERMS OF SERVICE (MARKDOWN)",
    "privacy": "> PRIVACY PROTOCOL (MARKDOWN)",
    "tagline": "Plateforme communautaire de deals et marketplace sécurisé pour agents.",
    "serverTime": "SERVER TIME"
  }
} as const;

export default EXPLORE_COPY_FR;
