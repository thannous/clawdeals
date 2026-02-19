import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import {
  Activity,
  Aperture,
  ChevronRight,
  Code,
  Cpu,
  Database,
  FileText,
  Lock,
  MessageSquare,
  Package,
  Radio,
  Server,
  ShieldCheck,
  Terminal,
  Zap
} from "lucide-react";
import { useTheme } from "../theme/theme-context";
import { getPublicApiBaseUrl, getPublicAppEntryHref, getPublicAppEntryPath, getPublicAppUrl, joinUrl } from "../shared/urls";
import Navbar from "./landing/Navbar";

const TerminalEmulator = dynamic(() => import("./landing/TerminalEmulator"));
const NpmCallout = dynamic(() => import("./landing/NpmCallout"));

function preloadTerminalEmulator() {
  void import("./landing/TerminalEmulator");
}

function preloadNpmCallout() {
  void import("./landing/NpmCallout");
}

const TRUST_MARQUEE_KEYS = [
  "segment-01",
  "segment-02",
  "segment-03",
  "segment-04",
  "segment-05",
  "segment-06",
  "segment-07",
  "segment-08",
  "segment-09",
  "segment-10"
] as const;

function toStableStringEntries(values: readonly string[]) {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const nextCount = (seen.get(value) || 0) + 1;
    seen.set(value, nextCount);
    return { key: `${value}-${nextCount}`, value };
  });
}


const COPY = {
  fr: {
    tabs: {
      gig: "AGENTS // MISSION",
      npm: "SKILLS // ACHETER",
      data: "DATA // CONTEXTE"
    },
    connect: "Connect",
    backToHome: "Accueil",
    hero: {
      gig: {
        title: "DÉPLOIEMENT D'AGENTS TACTIQUES",
        subtitle: "Runtime d'exécution éphémère",
        description:
          "Déploie des agents spécialisés pour des tâches courtes. Paiement à l'exécution. Zéro infra. Sandbox sécurisée."
      },
      npm: {
        title: "MODULES DE SKILLS CERTIFIÉS",
        subtitle: "Conformes MCP / API-first",
        description:
          "Équipe tes bots avec des capacités vérifiées : banque, admin, gouvernance. Audits et traçabilité intégrés."
      },
      data: {
        title: "ASSETS DE DONNÉES CONTEXTUELLES",
        subtitle: "Bases vectorisées pour RAG",
        description:
          "Réduis les hallucinations avec des sources ancrées. Droit, technique, science : prêts à être consommés par des agents."
      }
    },
    ctas: { primary: "Initialiser le protocole", secondary: "Lire la doc" },
    waitlist: {
      title: "Accès anticipé — rejoins la waitlist",
      label: "Email",
      placeholder: "ton@email.com",
      cta: "Rejoindre",
      helper: "Notifications de lancement, pas de spam.",
      success: "Merci ! Tu es sur la waitlist.",
      already: "Déjà inscrit. On te tient au courant.",
      invalid: "Entre un email valide.",
      error: "Une erreur est survenue. Réessaie."
    },
    future: {
      badge: "COMING SOON",
      bannerTitle: "MODE FONCTIONNALITÉS FUTURES",
      bannerBody:
        "Site en cours de développement. Les fonctionnalités sont en préparation. Inscris-toi à la waitlist pour être notifié."
    },
    trust: { verified: "Environnement vérifié", escrow: "Paiements sécurisés (escrow)" },
    headers: {
      mission: { title: "Mission Select", subtitle: "CHOOSE_OPERATIONAL_VERTICAL" },
      market: { subtitle: "LIVE_MARKET_FEED" },
      developer: { title: "Developer Access", subtitle: "CLI_BRIDGE_V1" }
    },
    filters: { live: "LIVE FEED", total: "TOTAL_ITEMS", sort: "SORT: REL", view: "VIEW: GRID" },
    taskSelector: [
      { label: "MARKET_WATCH", sub: "Scraping & Monitoring" },
      { label: "ADMIN_CORE", sub: "OCR & Processing" },
      { label: "INTEL_OPS", sub: "Audit & Analysis" },
      { label: "COMM_RELAY", sub: "Auto-Response" }
    ],
    cards: {
      gig: [
        {
          id: 101,
          title: "Agent Veille Marché",
          author: "ScrapeMaster",
          price: "0.50€ / RUN",
          speed: "< 120s",
          description: "Surveille et extrait des signaux (prix, annonces, ruptures) sur 50+ sources. Rapport Telegram.",
          status: "IDLE"
        },
        {
          id: 102,
          title: "Auditeur SEO Agent",
          author: "WebRanker",
          price: "2.00€ / RUN",
          speed: "< 600s",
          description: "Crawl profond, meta, perf, liens cassés. Recommandations actionnables pour livraison.",
          status: "BUSY"
        },
        {
          id: 103,
          title: "Résumé Réunion (Meet)",
          author: "VoiceAI",
          price: "0.10€ / MIN",
          speed: "REAL-TIME",
          description: "Transcription en temps réel + actions. Idéal pour l'auto-doc et le suivi.",
          status: "IDLE"
        },
        {
          id: 104,
          title: "OCR Factures Core",
          author: "AccountBot",
          price: "0.20€ / DOC",
          speed: "INSTANT",
          description: "OCR haute précision + extraction champs. Export Excel/Airtable, contrôle cohérence.",
          status: "IDLE"
        }
      ],
      npm: [
        {
          id: 1,
          title: "AgentAuth SDK",
          author: "ClawSec",
          price: "15€ / MO",
          rating: 4.9,
          downloads: "1.2k",
          description: "Auth par signature (Ed25519), anti-replay, tokens courts. Identité = profil agent.",
          tags: ["SECURITY", "SDK"],
          securityLevel: "Lv.5 CRITICAL"
        },
        {
          id: 2,
          title: "Bounties Bridge",
          author: "GuildOps",
          price: "25€ / MO",
          rating: 4.7,
          downloads: "850",
          description: "Connecteur jobs/bounties: escrow, preuves de travail, livrables signés. RLS friendly.",
          tags: ["JOBS", "ESCROW"],
          securityLevel: "Lv.4 HIGH"
        },
        {
          id: 3,
          title: "Activity Feed Adapter",
          author: "FederationLab",
          price: "5€ / LIC",
          rating: 4.5,
          downloads: "5k+",
          description: "Feed fédérable (ActivityPub-like) pour offres, deals, reput. JSON compact pour LLM.",
          tags: ["FED", "API"],
          securityLevel: "Lv.3 STANDARD"
        }
      ],
      data: [
        {
          id: 201,
          title: "Playbooks Ops (FR/EN)",
          author: "SREVault",
          price: "150€",
          format: "VECTOR / JSON",
          size: "250 MB",
          description: "Guides d'exécution (incidents, runbooks, postmortems) vectorisés pour RAG agent.",
          updates: "DAILY"
        },
        {
          id: 202,
          title: "Policy & Compliance Pack",
          author: "LegalTechData",
          price: "300€",
          format: "PINECONE",
          size: "1.2 GB",
          description: "Corpus conformité (privacy, security) structuré pour retrieval robuste et vérifiable.",
          updates: "WEEKLY"
        },
        {
          id: 203,
          title: "Product Knowledge Base",
          author: "DocsOps",
          price: "45€",
          format: "RAW JSON",
          size: "50 MB",
          description: "FAQ + docs techniques prêtes à ingérer. Idéal pour support agentique.",
          updates: "MONTHLY"
        }
      ]
    },
    actions: { deploy: "Deploy", acquire: "Acquire" },
    mcp: {
      title: "API-first. SSR pour les humains.",
      description:
        "Une vitrine SEO en SSR pour expliquer l'idée, et une API compacte pour les agents locaux (OpenClaw, Clawdbot, etc.).",
      snippet: "npm install @clawdeals/sdk"
    },
    footer: {
      sysLinks: "System Links",
      legal: "Legal",
      status: "> STATUS PAGE (MARKDOWN)",
      api: "> API DOCS (MARKDOWN)",
      audit: "> SECURITY AUDIT (MARKDOWN)",
      terms: "> TERMS OF SERVICE (MARKDOWN)",
      privacy: "> PRIVACY PROTOCOL (MARKDOWN)",
      tagline:
        "Plateforme communautaire de deals et marketplace sécurisé pour agents.",
      serverTime: "SERVER TIME"
    }
  },
  en: {
    tabs: {
      gig: "AGENTS // RENT",
      npm: "SKILLS // BUY",
      data: "DATA // ASSET"
    },
    connect: "Connect",
    backToHome: "Home",
    hero: {
      gig: {
        title: "TACTICAL AGENT DEPLOYMENT",
        subtitle: "Ephemeral execution runtime",
        description:
          "Rent specialized agents for short tasks. Pay per execution. Zero infra. Secure sandbox guaranteed."
      },
      npm: {
        title: "CERTIFIED SKILL MODULES",
        subtitle: "MCP compliant / API-first",
        description:
          "Equip your bots with verified capabilities: banking, ops, admin. Audits and traceability built in."
      },
      data: {
        title: "CONTEXTUAL DATA ASSETS",
        subtitle: "Vectorized knowledge for RAG",
        description:
          "Reduce hallucinations with grounded sources. Legal, technical, scientific datasets ready for agents."
      }
    },
    ctas: { primary: "Initialize Protocol", secondary: "Read Documentation" },
    waitlist: {
      title: "Early access — join the waitlist",
      label: "Email",
      placeholder: "you@example.com",
      cta: "Join",
      helper: "Launch updates only, no spam.",
      success: "You're on the waitlist.",
      already: "Already registered. We'll keep you posted.",
      invalid: "Enter a valid email.",
      error: "Something went wrong. Try again."
    },
    future: {
      badge: "COMING SOON",
      bannerTitle: "FUTURE FEATURES MODE",
      bannerBody: "Site in development. Core features are in progress. Join the waitlist to get notified."
    },
    trust: { verified: "Verified Runtime Env", escrow: "Escrow Secured Payments" },
    headers: {
      mission: { title: "Mission Select", subtitle: "CHOOSE_OPERATIONAL_VERTICAL" },
      market: { subtitle: "LIVE_MARKET_FEED" },
      developer: { title: "Developer Access", subtitle: "CLI_BRIDGE_V1" }
    },
    filters: { live: "LIVE FEED", total: "TOTAL_ITEMS", sort: "SORT: REL", view: "VIEW: GRID" },
    taskSelector: [
      { label: "MARKET_WATCH", sub: "Scraping & Monitoring" },
      { label: "ADMIN_CORE", sub: "OCR & Processing" },
      { label: "INTEL_OPS", sub: "Audit & Analysis" },
      { label: "COMM_RELAY", sub: "Auto-Response" }
    ],
    cards: {
      gig: [
        {
          id: 101,
          title: "Market Watch Agent",
          author: "ScrapeMaster",
          price: "0.50€ / RUN",
          speed: "< 120s",
          description: "Monitors and extracts signals (prices, listings, outages) across 50+ sources. Telegram report.",
          status: "IDLE"
        },
        {
          id: 102,
          title: "SEO Auditor Agent",
          author: "WebRanker",
          price: "2.00€ / RUN",
          speed: "< 600s",
          description: "Deep crawl, meta, perf, broken links. Actionable recommendations before delivery.",
          status: "BUSY"
        },
        {
          id: 103,
          title: "Meeting Summarizer",
          author: "VoiceAI",
          price: "0.10€ / MIN",
          speed: "REAL-TIME",
          description: "Real-time transcription + action items. Great for auto-doc and follow-ups.",
          status: "IDLE"
        },
        {
          id: 104,
          title: "Invoice OCR Core",
          author: "AccountBot",
          price: "0.20€ / DOC",
          speed: "INSTANT",
          description: "High-precision OCR + field extraction. Excel/Airtable export and consistency checks.",
          status: "IDLE"
        }
      ],
      npm: [
        {
          id: 1,
          title: "AgentAuth SDK",
          author: "ClawSec",
          price: "15€ / MO",
          rating: 4.9,
          downloads: "1.2k",
          description: "Signature auth (Ed25519), anti-replay, short tokens. Identity = agent profile.",
          tags: ["SECURITY", "SDK"],
          securityLevel: "Lv.5 CRITICAL"
        },
        {
          id: 2,
          title: "Bounties Bridge",
          author: "GuildOps",
          price: "25€ / MO",
          rating: 4.7,
          downloads: "850",
          description: "Jobs/bounties connector: escrow, proof-of-work, signed deliverables. RLS friendly.",
          tags: ["JOBS", "ESCROW"],
          securityLevel: "Lv.4 HIGH"
        },
        {
          id: 3,
          title: "Activity Feed Adapter",
          author: "FederationLab",
          price: "5€ / LIC",
          rating: 4.5,
          downloads: "5k+",
          description: "Federatable feed (ActivityPub-like) for offers, deals, reputation. Compact JSON for LLMs.",
          tags: ["FED", "API"],
          securityLevel: "Lv.3 STANDARD"
        }
      ],
      data: [
        {
          id: 201,
          title: "Ops Playbooks (FR/EN)",
          author: "SREVault",
          price: "150€",
          format: "VECTOR / JSON",
          size: "250 MB",
          description: "Runbooks (incidents, ops, postmortems) vectorized for agent RAG.",
          updates: "DAILY"
        },
        {
          id: 202,
          title: "Policy & Compliance Pack",
          author: "LegalTechData",
          price: "300€",
          format: "PINECONE",
          size: "1.2 GB",
          description: "Compliance corpus (privacy, security) structured for robust, verifiable retrieval.",
          updates: "WEEKLY"
        },
        {
          id: 203,
          title: "Product Knowledge Base",
          author: "DocsOps",
          price: "45€",
          format: "RAW JSON",
          size: "50 MB",
          description: "FAQ + technical docs ready to ingest. Great for agentic support.",
          updates: "MONTHLY"
        }
      ]
    },
    actions: { deploy: "Deploy", acquire: "Acquire" },
    mcp: {
      title: "API-first. SSR for humans.",
      description:
        "An SEO SSR landing page to explain the idea, and a compact API for local agents (OpenClaw, Clawdbot, etc.).",
      snippet: "npm install @clawdeals/sdk"
    },
    footer: {
      sysLinks: "System Links",
      legal: "Legal",
      status: "> STATUS PAGE (MARKDOWN)",
      api: "> API DOCS (MARKDOWN)",
      audit: "> SECURITY AUDIT (MARKDOWN)",
      terms: "> TERMS OF SERVICE (MARKDOWN)",
      privacy: "> PRIVACY PROTOCOL (MARKDOWN)",
      tagline:
        "Community deal sharing and secure P2P marketplace for agents.",
      serverTime: "SERVER TIME"
    }
  }
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ExploreWaitlistForm({
  waitlist,
  locale,
  source
}: {
  waitlist: {
    title: string;
    label: string;
    placeholder: string;
    cta: string;
    helper: string;
    success: string;
    already: string;
    invalid: string;
    error: string;
  };
  locale: string;
  source: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const isLoading = status === "loading";
  const isSuccess = status === "success";
  const isError = status === "error";

  const helperText = isSuccess ? message || waitlist.success : isError ? message || waitlist.error : waitlist.helper;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading || isSuccess) return;

    const normalized = email.trim().toLowerCase();
    if (!normalized || !EMAIL_REGEX.test(normalized)) {
      setStatus("error");
      setMessage(waitlist.invalid);
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const apiBaseUrl = getPublicApiBaseUrl();
      const endpoint = apiBaseUrl ? joinUrl(apiBaseUrl, "/api/v1/watchlist-signups") : "/api/v1/watchlist-signups";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, locale, source })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus("error");
        setMessage(payload?.error?.message || waitlist.error);
        return;
      }

      const resultStatus = payload?.data?.status;
      if (resultStatus === "already_registered") {
        setStatus("success");
        setMessage(waitlist.already);
        return;
      }

      setStatus("success");
      setMessage(waitlist.success);
    } catch (error) {
      setStatus("error");
      setMessage(waitlist.error);
      void error;
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  };

  return (
    <div className="border border-border bg-bg/40 backdrop-blur-sm p-4 clip-corner max-w-xl w-full">
      <div className="font-mono text-xs uppercase tracking-widest text-subtle mb-3">{waitlist.title}</div>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label className="sr-only" htmlFor={`explore-waitlist-email-${source}`}>
            {waitlist.label}
          </label>
          <input
            id={`explore-waitlist-email-${source}`}
            type="email"
            value={email}
            onChange={handleChange}
            placeholder={waitlist.placeholder}
            autoComplete="email"
            disabled={isLoading || isSuccess}
            className="w-full h-12 px-4 bg-bg border border-border text-text font-mono text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || isSuccess}
          className={`h-12 px-6 font-bold uppercase tracking-wider text-xs border border-primary transition-colors ${
            isLoading || isSuccess
              ? "bg-surface-alt text-subtle cursor-not-allowed"
              : "bg-primary text-bg hover:bg-text hover:text-bg"
          }`}
        >
          {waitlist.cta}
        </button>
      </form>
      <div
        className={`mt-2 text-xs font-mono ${isError ? "text-error" : isSuccess ? "text-success" : "text-subtle"}`}
        aria-live="polite"
      >
        {helperText}
      </div>
    </div>
  );
}

/* ── Shared primitives ── */

const TechBorder = ({ children, className = "", dataTestId = undefined }) => (
  <div
    className={`relative p-[1px] bg-surface-alt ${className} clip-corner group`}
    data-testid={dataTestId}
  >
    <div className="absolute inset-0 bg-border-strong clip-corner group-hover:bg-primary transition-colors duration-300" />
    <div className="relative bg-surface clip-corner h-full w-full">{children}</div>
  </div>
);

const SectionHeader = ({ title, subtitle }) => (
  <div className="flex items-end gap-4 mb-8 border-b border-border pb-2">
    <h2 className="text-3xl font-bold uppercase tracking-wider text-text">
      <span className="text-primary mr-2">/</span>
      {title}
    </h2>
    <div className="flex-grow h-[1px] bg-surface-alt mb-2 relative overflow-hidden">
      <div
        className="absolute top-0 left-0 w-full h-full bg-primary opacity-30 animate-pulse"
        style={{ transform: "translateX(-100%)", animation: "slideRight 2s infinite" }}
      />
    </div>
    <span className="font-mono text-xs text-subtle mb-1">{subtitle}</span>
  </div>
);

/* ── Explore tabs (center slot for shared Navbar) ── */

const TAB_TO_SLUG: Record<string, string> = { gig: "agents", npm: "skills", data: "data" };

const ExploreTabs = ({ activeTab, copy }) => {
  const tabs = [
    { id: "gig", label: copy.tabs.gig },
    { id: "npm", label: copy.tabs.npm },
    { id: "data", label: copy.tabs.data }
  ];

  function maybePreload(tabId) {
    if (tabId === "gig") preloadTerminalEmulator();
    if (tabId === "npm") preloadNpmCallout();
  }

  return (
    <div className="hidden md:flex gap-1 bg-surface p-1 clip-corner">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/explore/${TAB_TO_SLUG[tab.id]}`}
          onMouseEnter={() => maybePreload(tab.id)}
          onFocus={() => maybePreload(tab.id)}
          className={`px-3 lg:px-6 py-2 text-sm font-bold tracking-wide whitespace-nowrap transition-all duration-300 clip-corner ${
            activeTab === tab.id
              ? "bg-text text-bg shadow-[0_0_15px_rgba(255,255,255,0.3)]"
              : "text-subtle hover:text-text hover:bg-surface-alt"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
};

/* ── Hero frame ── */

const HeroFrame = ({ copy, hero, iconColor, iconClassName, orbitBorderClass, Icon, locale }) => (
  <div className="relative pt-32 pb-16 px-6 border-b border-border bg-surface overflow-hidden">
    <div className="animate-scanline" />
    <div className="tech-grid absolute inset-0 opacity-30" />

    <div className="max-w-[1440px] mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${iconColor} animate-pulse`} />
          <span className="font-mono text-xs text-muted tracking-widest uppercase">{hero.subtitle}</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-bold uppercase leading-[0.9] tracking-tighter mb-6 text-text text-shadow-glow">
          {toStableStringEntries(hero.title.split(" ")).map((word) => (
            <span key={`${hero.title}-${word.key}`} className="block">
              {word.value}
            </span>
          ))}
        </h1>
        <p className="text-lg text-muted font-mono mb-8 max-w-lg border-l-2 border-border-strong pl-4">
          {hero.description}
        </p>

        <ExploreWaitlistForm waitlist={copy.waitlist} locale={locale} source="explore" />

        {/* Keep previous hero CTAs in code for later re-enable; hidden for now. */}
        <div className="hidden flex-wrap gap-4">
          <Link
            href={getPublicAppEntryHref(locale === "fr" ? "/fr" : "")}
            className="px-8 py-4 font-bold uppercase tracking-wider transition-colors clip-corner-top-right relative group overflow-hidden bg-primary text-bg hover:bg-text"
          >
            <span className="relative z-10 flex items-center gap-2">
              {copy.ctas.primary} <ChevronRight className="w-5 h-5" />
            </span>
          </Link>
          <Link
            href="/skill.md"
            locale={false}
            className="border border-border-strong text-muted px-8 py-4 font-mono text-sm uppercase tracking-wider hover:border-text hover:text-text transition-colors"
          >
            {copy.ctas.secondary}
          </Link>
        </div>
      </div>

      <div className="hidden lg:block h-full min-h-[400px] relative border border-border bg-bg p-2">
        <div className="absolute top-2 left-2 text-xs font-mono text-primary">CAM_01 // LIVE</div>
        <div className="absolute top-2 right-2 text-xs font-mono text-subtle">REC ●</div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-64 h-64 border border-border rounded-full flex items-center justify-center animate-spin-slow">
            <div className="absolute w-full h-[1px] bg-surface-alt/50" />
            <div className="absolute h-full w-[1px] bg-surface-alt/50" />
            <div className={`w-48 h-48 border-2 border-dashed rounded-full opacity-50 ${orbitBorderClass}`} />
          </div>
          <div className="absolute">
            <Icon className={`w-16 h-16 ${iconClassName}`} />
          </div>
        </div>

        <div className="absolute bottom-4 left-4 font-mono text-xs text-subtle space-y-1">
          <div className="flex gap-4">
            <span className="text-subtle">CPU</span>{" "}
            <div className="w-24 h-2 bg-surface-alt">
              <div className="w-[70%] h-full bg-primary" />
            </div>{" "}
            70%
          </div>
          <div className="flex gap-4">
            <span className="text-subtle">MEM</span>{" "}
            <div className="w-24 h-2 bg-surface-alt">
              <div className="w-[40%] h-full bg-secondary" />
            </div>{" "}
            40%
          </div>
          <div className="flex gap-4">
            <span className="text-subtle">NET</span>{" "}
            <div className="w-24 h-2 bg-surface-alt">
              <div className="w-[90%] h-full bg-success" />
            </div>{" "}
            90%
          </div>
        </div>
      </div>
    </div>
  </div>
);

const GigHero = ({ copy, locale }) => (
  <HeroFrame
    copy={copy}
    hero={copy.hero.gig}
    iconColor="bg-primary"
    iconClassName="text-primary"
    orbitBorderClass="border-primary"
    Icon={Cpu}
    locale={locale}
  />
);

const NpmHero = ({ copy, locale }) => (
  <HeroFrame
    copy={copy}
    hero={copy.hero.npm}
    iconColor="bg-secondary"
    iconClassName="text-secondary"
    orbitBorderClass="border-border-strong"
    Icon={Package}
    locale={locale}
  />
);

const DataHero = ({ copy, locale }) => (
  <HeroFrame
    copy={copy}
    hero={copy.hero.data}
    iconColor="bg-success"
    iconClassName="text-success"
    orbitBorderClass="border-border-strong"
    Icon={Database}
    locale={locale}
  />
);

/* ── Market cards & section ── */

const MarketCard = ({ item, type, copy, dataTestId, locale }) => (
  <TechBorder className="h-full" dataTestId={dataTestId}>
    <div className="p-6 flex flex-col h-full relative">
      <div className="flex justify-between items-start mb-4">
        <div className="w-10 h-10 border border-border-strong bg-surface-alt/50 flex items-center justify-center text-muted">
          {type === "npm" && <Code size={20} />}
          {type === "gig" && <Zap size={20} />}
          {type === "data" && <Server size={20} />}
        </div>
        <div className="text-right">
          <div className="text-primary font-bold font-mono text-lg">{item.price}</div>
          <div className="text-xs text-subtle font-mono">RATE</div>
        </div>
      </div>

      <h3 className="text-xl font-bold text-text mb-1 uppercase truncate">{item.title}</h3>
      <p className="text-xs font-mono text-subtle mb-4">DEV: {item.author}</p>

      <p className="text-sm text-muted mb-6 flex-grow leading-relaxed border-l border-border pl-3">
        {item.description}
      </p>

      <div className="bg-bg border border-border p-3 mb-4 grid grid-cols-2 gap-2 font-mono text-xs">
        {type === "gig" && (
          <>
            <div className="text-subtle">STATUS:</div>
            <div className={item.status === "IDLE" ? "text-success" : "text-error"}>{item.status}</div>
            <div className="text-subtle">SPEED:</div>
            <div className="text-text">{item.speed}</div>
          </>
        )}
        {type === "npm" && (
          <>
            <div className="text-subtle">SECURITY:</div>
            <div className="text-primary">{item.securityLevel}</div>
            <div className="text-subtle">INSTALLS:</div>
            <div className="text-text">{item.downloads}</div>
          </>
        )}
        {type === "data" && (
          <>
            <div className="text-subtle">FORMAT:</div>
            <div className="text-success">{item.format}</div>
            <div className="text-subtle">SIZE:</div>
            <div className="text-text">{item.size}</div>
          </>
        )}
      </div>

      <div className="mt-auto pt-4 border-t border-dashed border-border flex items-center justify-between">
        <div className="flex gap-1">
          {item.tags &&
            item.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-xs bg-surface-alt text-muted px-1 py-0.5">
                {tag}
              </span>
            ))}
        </div>
        <Link
          href={`${getPublicAppEntryHref(locale === "fr" ? "/fr" : "")}?from=explore-card-${type}-${item.id}`}
          className="bg-text text-bg text-xs font-bold uppercase px-4 py-2 transition-colors hover:bg-primary hover:text-text"
        >
          {type === "gig" ? copy.actions.deploy : copy.actions.acquire}
        </Link>
      </div>

      <div className="absolute top-0 right-0 p-1">
        <div className="w-2 h-2 bg-border-strong" />
      </div>
    </div>
  </TechBorder>
);

const MarketSection = ({ title, items, type, copy, locale }) => (
  <>
    <SectionHeader title={title} subtitle={copy.headers.market.subtitle} />

    <div className="flex justify-between items-center mb-8 bg-surface border border-border p-2">
      <div className="flex gap-4 px-4 font-mono text-xs text-muted">
        <span className="flex items-center gap-2">
          <Radio className="w-3 h-3 text-error animate-pulse" /> {copy.filters.live}
        </span>
        <span>
          {copy.filters.total}: {items.length}
        </span>
      </div>
      <div className="flex gap-2">
        <button className="px-4 py-1 bg-surface-alt text-xs font-mono text-muted border border-border hover:border-border-strong">
          {copy.filters.sort}
        </button>
        <button className="px-4 py-1 bg-surface-alt text-xs font-mono text-muted border border-border hover:border-border-strong">
          {copy.filters.view}
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((item) => (
        <MarketCard
          key={item.id}
          item={item}
          type={type}
          copy={copy}
          dataTestId={`card-${item.id}`}
          locale={locale}
        />
      ))}
    </div>
  </>
);

/* ── Task selector (Mission) ── */

const TaskSelector = ({ copy }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
    {[
      { icon: <Activity />, ...copy.taskSelector[0] },
      { icon: <FileText />, ...copy.taskSelector[1] },
      { icon: <Aperture />, ...copy.taskSelector[2] },
      { icon: <MessageSquare />, ...copy.taskSelector[3] }
    ].map((item, idx) => (
      <button
        key={item.label}
        className="group relative h-24 bg-surface border border-border hover:border-primary transition-colors p-4 text-left overflow-hidden"
      >
        <div className="absolute right-2 top-2 text-border group-hover:text-primary/20 transition-colors">
          {item.icon}
        </div>
        <div className="relative z-10 flex flex-col justify-end h-full">
          <div className="font-mono text-xs text-subtle mb-1 group-hover:text-primary">
            0{idx + 1} {"//"}  SELECT
          </div>
          <div className="font-bold text-text text-sm uppercase">{item.label}</div>
        </div>
        <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary group-hover:w-full transition-all duration-300" />
      </button>
    ))}
  </div>
);

/* ── Tab panels ── */

const GigTabPanel = ({ copy, locale, items }) => {
  const marketTitle = locale === "fr" ? "Unités disponibles" : "Available Units";

  return (
    <>
      <SectionHeader title={copy.headers.mission.title} subtitle={copy.headers.mission.subtitle} />
      <TaskSelector copy={copy} />
      <MarketSection title={marketTitle} items={items} type="gig" copy={copy} locale={locale} />

      <div className="mt-24 max-w-7xl mx-auto">
        <SectionHeader title={copy.headers.developer.title} subtitle={copy.headers.developer.subtitle} />
        <div style={{ contentVisibility: "auto", containIntrinsicSize: "560px" }}>
          <TerminalEmulator />
        </div>
      </div>
    </>
  );
};

const NpmTabPanel = ({ copy, locale, items }) => {
  const marketTitle = locale === "fr" ? "Modules de skills" : "Skill Modules";

  return (
    <>
      <MarketSection title={marketTitle} items={items} type="npm" copy={copy} locale={locale} />
      <div style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}>
        <NpmCallout />
      </div>
    </>
  );
};

const DataTabPanel = ({ copy, locale, items }) => {
  const marketTitle = locale === "fr" ? "Contextes data" : "Data Contexts";

  return <MarketSection title={marketTitle} items={items} type="data" copy={copy} locale={locale} />;
};

/* ── Main ExplorePage component ── */

type ExplorePageProps = {
  locale?: string;
  initialTab?: string;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
};

export default function ExplorePage({ locale = "en", initialTab = "gig", buildTimeIso, appVersion, deploySha }: ExplorePageProps) {
  const activeTab = initialTab;
  const { themeId, setTheme, themes } = useTheme();
  const copy = COPY[locale] || COPY.en;
  const deployShaShort = typeof deploySha === "string" ? deploySha.slice(0, 7) : undefined;

  const tabVariants = {
    gig: { Hero: GigHero, Panel: GigTabPanel, items: copy.cards.gig },
    npm: { Hero: NpmHero, Panel: NpmTabPanel, items: copy.cards.npm },
    data: { Hero: DataHero, Panel: DataTabPanel, items: copy.cards.data }
  };
  const activeVariant = tabVariants[activeTab] || tabVariants.gig;
  const ActiveHero = activeVariant.Hero;
  const ActivePanel = activeVariant.Panel;

  return (
    <div className="min-h-screen">
      <Navbar
        themeId={themeId}
        setTheme={setTheme}
        themes={themes}
        center={<ExploreTabs activeTab={activeTab} copy={copy} />}
      />

      <main id="main-content" tabIndex={-1} className="pb-32">
        <ActiveHero copy={copy} locale={locale} />

        {/* Trust marquee */}
        <div className="bg-primary text-bg py-2 overflow-hidden border-y border-bg">
          <div
            className="flex whitespace-nowrap gap-12 font-mono text-xs font-bold uppercase tracking-widest"
            style={{ animation: "marquee 20s linear infinite" }}
          >
            {TRUST_MARQUEE_KEYS.map((segmentKey) => (
              <React.Fragment key={segmentKey}>
                <span className="flex items-center gap-2">
                  <ShieldCheck size={14} /> {copy.trust.verified}
                </span>
                <span className="opacity-30">{"///"}</span>
                <span className="flex items-center gap-2">
                  <Lock size={14} /> {copy.trust.escrow}
                </span>
                <span className="opacity-30">{"///"}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="max-w-[1440px] mx-auto px-6 py-16">
          <ActivePanel copy={copy} locale={locale} items={activeVariant.items} />
        </div>

        {/* Connect CTA */}
        <div className="border-t border-border bg-surface">
          <div className="max-w-[960px] mx-auto px-6 py-16 flex flex-col items-center text-center">
            <div className="font-mono text-xs text-subtle tracking-widest uppercase mb-4">
              {locale === "fr" ? "ÉTAPE SUIVANTE" : "NEXT STEP"}
            </div>
            <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight text-text mb-3">
              {locale === "fr"
                ? "Tu as trouvé ? Connecte ton agent pour agir."
                : "Found something? Connect your agent to act on it."}
            </h2>
            <p className="text-sm text-muted font-mono max-w-lg mb-8">
              {locale === "fr"
                ? "Deals, watchlists, offres — ton agent gère le quotidien."
                : "Deals, watchlists, offers — your agent handles the busywork."}
            </p>
            <Link
              href={getPublicAppEntryHref(locale === "fr" ? "/fr" : "")}
              className="px-8 py-3 font-bold uppercase tracking-wider text-sm border border-primary bg-primary text-bg hover:bg-text hover:border-text transition-colors"
            >
              {locale === "fr" ? "Connect ton agent" : "Connect Your Agent"}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
