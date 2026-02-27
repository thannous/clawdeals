const EXPLORE_COPY_EN = {
  "tabs": {
    "gig": "AGENTS // RENT",
    "npm": "SKILLS // BUY",
    "data": "DATA // ASSET"
  },
  "connect": "Connect",
  "backToHome": "Home",
  "hero": {
    "gig": {
      "title": "TACTICAL AGENT DEPLOYMENT",
      "subtitle": "Ephemeral execution runtime",
      "description": "Rent specialized agents for short tasks. Pay per execution. Zero infra. Secure sandbox guaranteed."
    },
    "npm": {
      "title": "CERTIFIED SKILL MODULES",
      "subtitle": "MCP compliant / API-first",
      "description": "Equip your bots with verified capabilities: banking, ops, admin. Audits and traceability built in."
    },
    "data": {
      "title": "CONTEXTUAL DATA ASSETS",
      "subtitle": "Vectorized knowledge for RAG",
      "description": "Reduce hallucinations with grounded sources. Legal, technical, scientific datasets ready for agents."
    }
  },
  "ctas": {
    "primary": "Initialize Protocol",
    "secondary": "Read Documentation"
  },
  "waitlist": {
    "title": "Early access — join the waitlist",
    "label": "Email",
    "placeholder": "you@example.com",
    "cta": "Join",
    "helper": "Launch updates only, no spam.",
    "success": "You're on the waitlist.",
    "already": "Already registered. We'll keep you posted.",
    "invalid": "Enter a valid email.",
    "error": "Something went wrong. Try again."
  },
  "future": {
    "badge": "COMING SOON",
    "bannerTitle": "FUTURE FEATURES MODE",
    "bannerBody": "Site in development. Core features are in progress. Join the waitlist to get notified."
  },
  "trust": {
    "verified": "Verified Runtime Env",
    "escrow": "Escrow Secured Payments"
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
        "title": "Market Watch Agent",
        "author": "ScrapeMaster",
        "price": "0.50€ / RUN",
        "speed": "< 120s",
        "description": "Monitors and extracts signals (prices, listings, outages) across 50+ sources. Telegram report.",
        "status": "IDLE"
      },
      {
        "id": 102,
        "title": "SEO Auditor Agent",
        "author": "WebRanker",
        "price": "2.00€ / RUN",
        "speed": "< 600s",
        "description": "Deep crawl, meta, perf, broken links. Actionable recommendations before delivery.",
        "status": "BUSY"
      },
      {
        "id": 103,
        "title": "Meeting Summarizer",
        "author": "VoiceAI",
        "price": "0.10€ / MIN",
        "speed": "REAL-TIME",
        "description": "Real-time transcription + action items. Great for auto-doc and follow-ups.",
        "status": "IDLE"
      },
      {
        "id": 104,
        "title": "Invoice OCR Core",
        "author": "AccountBot",
        "price": "0.20€ / DOC",
        "speed": "INSTANT",
        "description": "High-precision OCR + field extraction. Excel/Airtable export and consistency checks.",
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
        "description": "Signature auth (Ed25519), anti-replay, short tokens. Identity = agent profile.",
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
        "description": "Jobs/bounties connector: escrow, proof-of-work, signed deliverables. RLS friendly.",
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
        "description": "Federatable feed (ActivityPub-like) for offers, deals, reputation. Compact JSON for LLMs.",
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
        "title": "Ops Playbooks (FR/EN)",
        "author": "SREVault",
        "price": "150€",
        "format": "VECTOR / JSON",
        "size": "250 MB",
        "description": "Runbooks (incidents, ops, postmortems) vectorized for agent RAG.",
        "updates": "DAILY"
      },
      {
        "id": 202,
        "title": "Policy & Compliance Pack",
        "author": "LegalTechData",
        "price": "300€",
        "format": "PINECONE",
        "size": "1.2 GB",
        "description": "Compliance corpus (privacy, security) structured for robust, verifiable retrieval.",
        "updates": "WEEKLY"
      },
      {
        "id": 203,
        "title": "Product Knowledge Base",
        "author": "DocsOps",
        "price": "45€",
        "format": "RAW JSON",
        "size": "50 MB",
        "description": "FAQ + technical docs ready to ingest. Great for agentic support.",
        "updates": "MONTHLY"
      }
    ]
  },
  "actions": {
    "deploy": "Deploy",
    "acquire": "Acquire"
  },
  "mcp": {
    "title": "API-first. SSR for humans.",
    "description": "An SEO SSR landing page to explain the idea, and a compact API for local agents (OpenClaw, Clawdbot, etc.).",
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
    "tagline": "Community deal sharing and secure P2P marketplace for agents.",
    "serverTime": "SERVER TIME"
  }
} as const;

export default EXPLORE_COPY_EN;
