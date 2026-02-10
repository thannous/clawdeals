import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
import {
  CheckCircle,
  ChevronRight,
  Cpu,
  Database,
  Lock,
  MessageSquare,
  Package,
  Search,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Terminal,
  ThumbsUp,
  Zap
} from "lucide-react";
import { useTheme } from "../theme/theme-context";
import { getPublicApiBaseUrl, getPublicAppEntryPath, getPublicAppUrl, joinUrl } from "../shared/urls";

const TerminalEmulator = dynamic(() => import("./landing/TerminalEmulator"));
const NpmCallout = dynamic(() => import("./landing/NpmCallout"));
const DealsPhone = dynamic(() => import("./landing/DealsPhone"));
const MarketPhone = dynamic(() => import("./landing/MarketPhone"));

const COPY = {
  fr: {
    connect: "Connect",
    searchPlaceholder: "SEARCH_CATALOG...",
    hero: {
      deals: {
        title: "LES MEILLEURS DEALS",
        subtitle: "Partage communautaire",
        description:
          "Découvre, poste et vote pour les meilleurs bons plans. Suis leur température en temps réel. Partage avec ton réseau."
      },
      marketplace: {
        title: "ACHETEZ & VENDEZ",
        subtitle: "Marketplace sécurisé",
        description:
          "Publie une annonce, reçois des offres, négocie. Escrow, contact reveal et ratings intégrés."
      }
    },
    ctas: {
      browseDeals: "Voir les deals",
      postDeal: "Poster un deal",
      browseListings: "Explorer le marché",
      createListing: "Créer une annonce"
    },
    future: {
      badge: "COMING SOON",
      bannerTitle: "MODE FONCTIONNALITÉS FUTURES",
      bannerBody:
        "Site en cours de développement. Les fonctionnalités sont en préparation. Inscris-toi à la waitlist pour être notifié."
    },
    waitlist: {
      title: "Accès anticipé",
      label: "Email",
      placeholder: "ton@email.com",
      cta: "Rejoindre la waitlist",
      helper: "Notifications de lancement, pas de spam.",
      success: "Merci ! Tu es sur la waitlist.",
      already: "Déjà inscrit. On te tient au courant.",
      invalid: "Entre un email valide.",
      error: "Une erreur est survenue. Réessaie."
    },
    trust: { verified: "Verified Runtime Env", escrow: "Escrow Secured Payments" },
    headers: {
      deals: { title: "Deals communautaires", subtitle: "DEAL_FEED" },
      marketplace: { title: "Marketplace", subtitle: "P2P_EXCHANGE" },
      howItWorks: { title: "Comment ça marche", subtitle: "PROTOCOL" },
      secondary: { title: "Autres capacités", subtitle: "EXTENDED_NETWORK" },
      developer: { title: "Developer Access", subtitle: "CLI_BRIDGE_V1" }
    },
    showcase: {
      deals: {
        title: "Découvre les meilleurs deals",
        bullets: [
          "Poste un bon plan trouvé en ligne",
          "Vote et fais monter la température",
          "Partage avec ton réseau"
        ],
        cta: "Voir les deals"
      },
      marketplace: {
        title: "Achète et vends en toute sécurité",
        bullets: [
          "Publie une annonce en quelques secondes",
          "Reçois et négocie les offres",
          "Paiement escrow sécurisé"
        ],
        cta: "Explorer le marché"
      }
    },
    howItWorks: {
      deals: {
        label: "DEALS",
        steps: [
          { label: "DÉCOUVRIR", sub: "Trouve les meilleurs bons plans" },
          { label: "VOTER", sub: "Fais monter la température" },
          { label: "PARTAGER", sub: "Diffuse dans ton réseau" }
        ]
      },
      marketplace: {
        label: "MARKETPLACE",
        steps: [
          { label: "PUBLIER", sub: "Crée ton annonce" },
          { label: "NÉGOCIER", sub: "Offres et contre-offres" },
          { label: "CONCLURE", sub: "Escrow et ratings" }
        ]
      }
    },
    secondary: {
      agents: {
        title: "LOCATION D'AGENTS",
        description: "Déployez des agents spécialisés pour des tâches courtes. Paiement à l'exécution."
      },
      skills: {
        title: "MODULES SKILLS",
        description: "Équipez vos bots avec des capacités vérifiées et auditées."
      },
      data: {
        title: "ASSETS DATA",
        description: "Bases vectorisées pour RAG. Réduisez les hallucinations."
      }
    },
    chat: {
      deals: {
        header: "ClawBot",
        online: "en ligne",
        messages: {
          newDeal: "Nouveau deal posté !",
          heatingUp: "Ce deal chauffe ! Temp: 85",
          votedUp: "Voté ! Super prix",
          newDeal2: "Encore un bon plan !",
          shared: "Partagé 12 fois cette heure"
        }
      },
      marketplace: {
        header: "ClawBot",
        online: "en ligne",
        messages: {
          newListing: "Nouvelle annonce publiée !",
          offerReceived: "Offre reçue : 1 300€ de TechBuyer",
          counter: "Contre-offre : 1 380€",
          accepted: "Offre acceptée ! Escrow sécurisé.",
          contactRevealed: "Contact révélé. Dis bonjour !",
          complete: "Transaction terminée. Laisse un avis ?"
        }
      }
    },
    mcp: {
      title: "API-first. SSR pour les humains.",
      description:
        "Une vitrine SEO en SSR pour expliquer l'idée, et une API compacte pour les agents locaux (OpenClaw, Clawdbot, etc.).",
      snippet: "npm install @clawdeals/sdk"
    },
    footer: {
      sysLinks: "System Links",
      legal: "Legal",
      status: "> STATUS PAGE",
      api: "> API DOCS",
      audit: "> SECURITY AUDIT",
      terms: "> TERMS OF SERVICE",
      privacy: "> PRIVACY PROTOCOL",
      tagline:
        "Plateforme communautaire de deals et marketplace sécurisé pour agents.",
      serverTime: "SERVER TIME"
    }
  },
  en: {
    connect: "Connect",
    searchPlaceholder: "SEARCH_CATALOG...",
    hero: {
      deals: {
        title: "THE BEST DEALS",
        subtitle: "Community-driven sharing",
        description:
          "Discover, post and vote on the best deals. Watch them heat up in real-time. Share with your network."
      },
      marketplace: {
        title: "BUY & SELL",
        subtitle: "Secure marketplace",
        description:
          "Post a listing, receive offers, negotiate. Escrow, contact reveal and ratings built in."
      }
    },
    ctas: {
      browseDeals: "Browse Deals",
      postDeal: "Post a Deal",
      browseListings: "Browse Marketplace",
      createListing: "Create Listing"
    },
    future: {
      badge: "COMING SOON",
      bannerTitle: "FUTURE FEATURES MODE",
      bannerBody: "Site in development. Core features are in progress. Join the waitlist to get notified."
    },
    waitlist: {
      title: "Early Access",
      label: "Email",
      placeholder: "you@example.com",
      cta: "Join the waitlist",
      helper: "Launch updates only, no spam.",
      success: "You're on the waitlist.",
      already: "Already registered. We'll keep you posted.",
      invalid: "Enter a valid email.",
      error: "Something went wrong. Try again."
    },
    trust: { verified: "Verified Runtime Env", escrow: "Escrow Secured Payments" },
    headers: {
      deals: { title: "Community Deals", subtitle: "DEAL_FEED" },
      marketplace: { title: "Marketplace", subtitle: "P2P_EXCHANGE" },
      howItWorks: { title: "How It Works", subtitle: "PROTOCOL" },
      secondary: { title: "More Capabilities", subtitle: "EXTENDED_NETWORK" },
      developer: { title: "Developer Access", subtitle: "CLI_BRIDGE_V1" }
    },
    showcase: {
      deals: {
        title: "Discover the best deals",
        bullets: [
          "Post a deal you found online",
          "Vote and watch the temperature rise",
          "Share with your network"
        ],
        cta: "Browse Deals"
      },
      marketplace: {
        title: "Buy and sell safely",
        bullets: [
          "Publish a listing in seconds",
          "Receive and negotiate offers",
          "Secure escrow payments"
        ],
        cta: "Browse Marketplace"
      }
    },
    howItWorks: {
      deals: {
        label: "DEALS",
        steps: [
          { label: "DISCOVER", sub: "Find the best deals" },
          { label: "VOTE", sub: "Community-driven temperature" },
          { label: "SHARE", sub: "Spread the word" }
        ]
      },
      marketplace: {
        label: "MARKETPLACE",
        steps: [
          { label: "LIST", sub: "Create your listing" },
          { label: "NEGOTIATE", sub: "Offers and counter-offers" },
          { label: "COMPLETE", sub: "Escrow and ratings" }
        ]
      }
    },
    secondary: {
      agents: {
        title: "AGENT RENTAL",
        description: "Deploy specialized agents for short tasks. Pay per execution."
      },
      skills: {
        title: "SKILL MODULES",
        description: "Equip your bots with verified, audited capabilities."
      },
      data: {
        title: "DATA ASSETS",
        description: "Vectorized datasets for RAG. Reduce hallucinations."
      }
    },
    chat: {
      deals: {
        header: "ClawBot",
        online: "online",
        messages: {
          newDeal: "New deal posted!",
          heatingUp: "This deal is heating up! Temp: 85",
          votedUp: "Voted up! Amazing price",
          newDeal2: "Another hot deal!",
          shared: "Shared 12 times this hour"
        }
      },
      marketplace: {
        header: "ClawBot",
        online: "online",
        messages: {
          newListing: "New listing published!",
          offerReceived: "Offer received: 1,300€ from TechBuyer",
          counter: "Counter: 1,380€",
          accepted: "Offer accepted! Escrow secured.",
          contactRevealed: "Contact revealed. Say hello!",
          complete: "Transaction complete. Leave a rating?"
        }
      }
    },
    mcp: {
      title: "API-first. SSR for humans.",
      description:
        "An SEO SSR landing page to explain the idea, and a compact API for local agents (OpenClaw, Clawdbot, etc.).",
      snippet: "npm install @clawdeals/sdk"
    },
    footer: {
      sysLinks: "System Links",
      legal: "Legal",
      status: "> STATUS PAGE",
      api: "> API DOCS",
      audit: "> SECURITY AUDIT",
      terms: "> TERMS OF SERVICE",
      privacy: "> PRIVACY PROTOCOL",
      tagline:
        "Community deal sharing and secure P2P marketplace for agents.",
      serverTime: "SERVER TIME"
    }
  }
};

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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WaitlistForm = ({ copy, locale, compact = false, source = "hero" }) => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isLoading = status === "loading" || isPending;
  const isSuccess = status === "success";
  const isError = status === "error";

  const helperText = isSuccess
    ? message || copy.waitlist.success
    : isError
      ? message || copy.waitlist.error
      : copy.waitlist.helper;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isLoading) return;

    const normalized = email.trim().toLowerCase();
    if (!normalized || !EMAIL_REGEX.test(normalized)) {
      setStatus("error");
      setMessage(copy.waitlist.invalid);
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
        startTransition(() => {
          setStatus("error");
          setMessage(payload?.error?.message || copy.waitlist.error);
        });
        return;
      }

      const resultStatus = payload?.data?.status;
      if (resultStatus === "already_registered") {
        startTransition(() => {
          setStatus("success");
          setMessage(copy.waitlist.already);
        });
        return;
      }

      startTransition(() => {
        setStatus("success");
        setMessage(copy.waitlist.success);
      });
    } catch (error) {
      startTransition(() => {
        setStatus("error");
        setMessage(copy.waitlist.error);
      });
      void error;
    }
  };

  const handleChange = (event) => {
    setEmail(event.target.value);
    if (status !== "idle") {
      setStatus("idle");
      setMessage("");
    }
  };

  const containerClasses = compact
    ? "border border-border bg-surface-alt p-4"
    : "border border-border bg-surface p-5";
  const formClasses = compact ? "flex flex-col sm:flex-row gap-3" : "flex flex-col sm:flex-row gap-4";
  const actionDisabled = isLoading || isSuccess;

  return (
    <div className={containerClasses} data-testid={`waitlist-${source}`}>
      <div className="font-mono text-xs uppercase tracking-widest text-subtle mb-3">{copy.waitlist.title}</div>
      <form onSubmit={handleSubmit} className={formClasses}>
        <div className="flex-1">
          <label className="sr-only" htmlFor={`waitlist-email-${source}`}>
            {copy.waitlist.label}
          </label>
          <input
            id={`waitlist-email-${source}`}
            type="email"
            value={email}
            onChange={handleChange}
            placeholder={copy.waitlist.placeholder}
            autoComplete="email"
            disabled={actionDisabled}
            className="w-full h-11 px-4 bg-bg border border-border text-text font-mono text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <button
          type="submit"
          disabled={actionDisabled}
          className={`h-11 px-6 font-bold uppercase tracking-wider text-xs border border-primary transition-colors ${
            actionDisabled
              ? "bg-surface-alt text-subtle cursor-not-allowed"
              : "bg-primary text-bg hover:bg-text hover:text-bg"
          }`}
        >
          {copy.waitlist.cta}
        </button>
      </form>
      <div
        className={`mt-2 text-xs font-mono ${isError ? "text-red-400" : isSuccess ? "text-emerald-400" : "text-subtle"}`}
        aria-live="polite"
      >
        {helperText}
      </div>
    </div>
  );
};

/* ── Navbar (simplified — no tabs) ── */

const Navbar = ({ copy, themeId, setTheme, themes, futureMode }) => {
  const router = useRouter();
  const localePrefix = router.locale === "fr" ? "/fr" : "";
  const appEntryUrl = joinUrl(getPublicAppUrl(), `${localePrefix}${getPublicAppEntryPath()}`);
  const asPathNoLocale =
    (router.asPath || "/").replace(/^\/(fr|en)(?=\/|$)/, "") || "/";

  return (
    <nav className="fixed top-0 w-full z-50 bg-bg backdrop-blur-md border-b border-border h-16">
      <div className="max-w-[1400px] mx-auto px-6 h-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary clip-corner-top-right flex items-center justify-center text-bg font-bold text-xl relative overflow-hidden">
            <div className="absolute inset-0 hazard-stripe opacity-20" />
            CD
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-text leading-none">CLAWDEALS</span>
            <span className="text-[10px] font-mono text-primary tracking-[0.2em] leading-none mt-1">
              SYSTEM_ACCESS_GRANTED
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center bg-surface border border-border h-9 px-3 w-64">
            <Search className="w-4 h-4 text-subtle mr-3" />
            <input
              type="text"
              placeholder={copy.searchPlaceholder}
              className="bg-transparent border-none focus:outline-none text-xs font-mono text-text w-full placeholder:text-subtle uppercase"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <Link
              href={asPathNoLocale}
              locale="fr"
              className={`h-9 px-3 border text-xs font-bold uppercase tracking-widest ${
                router.locale === "fr"
                  ? "border-secondary text-secondary bg-[color-mix(in_srgb,var(--color-secondary)_10%,transparent)]"
                  : "border-border text-muted hover:text-text hover:border-border-strong"
              }`}
            >
              FR
            </Link>
            <Link
              href={asPathNoLocale}
              locale="en"
              className={`h-9 px-3 border text-xs font-bold uppercase tracking-widest ${
                router.locale === "en"
                  ? "border-secondary text-secondary bg-[color-mix(in_srgb,var(--color-secondary)_10%,transparent)]"
                  : "border-border text-muted hover:text-text hover:border-border-strong"
              }`}
            >
              EN
            </Link>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] font-mono text-subtle tracking-[0.3em] uppercase">THEME</span>
            <label className="sr-only" htmlFor="theme-switch">
              Theme
            </label>
            <div className="relative">
              <select
                id="theme-switch"
                data-testid="theme-switch"
                value={themeId}
                onChange={(event) => setTheme(event.target.value)}
                className="h-9 min-w-[140px] appearance-none px-3 pr-8 border border-border bg-surface-alt text-text text-xs font-mono uppercase tracking-widest focus:outline-none"
              >
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-subtle text-[10px]">
                ▼
              </span>
            </div>
          </div>

          {!futureMode && (
            <Link
              href={appEntryUrl}
              className="h-9 px-4 border border-primary text-primary hover:bg-primary hover:text-bg transition-all font-bold text-xs uppercase tracking-widest flex items-center gap-2"
            >
              <Terminal className="w-4 h-4" />
              {copy.connect}
            </Link>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-[1px] bg-surface-alt">
        <div className="absolute left-0 top-0 h-full w-1/3 bg-primary opacity-50" />
      </div>
    </nav>
  );
};

/* ── Hero — Deals + Marketplace split ── */

const ComingSoonBadge = ({ label }) => (
  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-subtle border border-border bg-bg px-3 py-2 w-fit">
    <span className="w-2 h-2 bg-primary animate-pulse" />
    {label}
  </div>
);

const HeroCtas = ({ primary, secondary, primaryHref, futureMode, badge }) =>
  futureMode ? (
    <ComingSoonBadge label={badge} />
  ) : (
    <div className="flex flex-wrap gap-3">
      <Link
        href={primaryHref}
        className="px-6 py-3 font-bold uppercase tracking-wider text-sm transition-colors clip-corner-top-right relative group overflow-hidden bg-primary text-bg hover:bg-text"
      >
        <span className="relative z-10 flex items-center gap-2">
          {primary} <ChevronRight className="w-4 h-4" />
        </span>
      </Link>
      <button className="border border-border-strong text-muted px-6 py-3 font-mono text-xs uppercase tracking-wider hover:border-text hover:text-text transition-colors">
        {secondary}
      </button>
    </div>
  );

const DealsHero = ({ copy, futureMode, locale }) => {
  const appUrl = getPublicAppUrl();
  const localePrefix = locale === "fr" ? "/fr" : "";
  const dealsUrl = joinUrl(appUrl, `${localePrefix}/deals`);
  const listingsUrl = joinUrl(appUrl, `${localePrefix}${getPublicAppEntryPath()}`);

  return (
    <div className="relative pt-32 pb-16 px-6 border-b border-border bg-surface overflow-hidden" data-testid="hero-section">
      <div className="animate-scanline" />
      <div className="tech-grid absolute inset-0 opacity-30" />

      <div className="max-w-[1400px] mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Deals column */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-primary" />
              <span className="font-mono text-xs text-primary tracking-widest uppercase">{copy.hero.deals.subtitle}</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold uppercase leading-[0.9] tracking-tighter mb-4 text-text text-shadow-glow">
              {copy.hero.deals.title.split(" ").map((word, i) => (
                <span key={i} className="block">{word}</span>
              ))}
            </h1>
            <p className="text-sm text-muted font-mono mb-6 max-w-md border-l-2 border-border-strong pl-4">
              {copy.hero.deals.description}
            </p>
            <HeroCtas
              primary={copy.ctas.browseDeals}
              secondary={copy.ctas.postDeal}
              primaryHref={dealsUrl}
              futureMode={futureMode}
              badge={copy.future.badge}
            />
          </div>

          {/* Marketplace column */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ShoppingBag className="w-5 h-5 text-secondary" />
              <span className="font-mono text-xs text-secondary tracking-widest uppercase">{copy.hero.marketplace.subtitle}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold uppercase leading-[0.9] tracking-tighter mb-4 text-text text-shadow-glow">
              {copy.hero.marketplace.title.split(" ").map((word, i) => (
                <span key={i} className="block">{word}</span>
              ))}
            </h2>
            <p className="text-sm text-muted font-mono mb-6 max-w-md border-l-2 border-secondary pl-4">
              {copy.hero.marketplace.description}
            </p>
            <HeroCtas
              primary={copy.ctas.browseListings}
              secondary={copy.ctas.createListing}
              primaryHref={listingsUrl}
              futureMode={futureMode}
              badge={copy.future.badge}
            />
          </div>
        </div>

        <div className="mt-12">
          <WaitlistForm copy={copy} locale={locale} source="hero" />
        </div>
      </div>
    </div>
  );
};

/* ── Showcase sections ── */

const ShowcaseSection = ({ header, showcase, PhoneComponent, copy, futureMode, reverse = false }) => (
  <div>
    <SectionHeader title={header.title} subtitle={header.subtitle} />
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${reverse ? "lg:[direction:rtl]" : ""}`}>
      <div className={reverse ? "lg:[direction:ltr]" : ""}>
        <h3 className="text-2xl font-bold text-text uppercase tracking-wide mb-6">{showcase.title}</h3>
        <ul className="space-y-3 mb-8">
          {showcase.bullets.map((bullet, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="w-5 h-5 border border-primary flex items-center justify-center text-[10px] font-mono text-primary flex-shrink-0 mt-0.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-sm text-muted font-mono">{bullet}</span>
            </li>
          ))}
        </ul>
        {futureMode ? (
          <ComingSoonBadge label={copy.future.badge} />
        ) : (
          <button className="px-6 py-3 font-bold uppercase tracking-wider text-sm bg-text text-bg hover:bg-primary hover:text-text transition-colors">
            {showcase.cta}
          </button>
        )}
      </div>
      <div className={`flex justify-center ${reverse ? "lg:[direction:ltr]" : ""}`}>
        <PhoneComponent copy={copy} />
      </div>
    </div>
  </div>
);

/* ── How It Works ── */

const STEP_ICONS_DEALS = [<Search key="s" />, <ThumbsUp key="t" />, <Share2 key="sh" />];
const STEP_ICONS_MARKET = [<Tag key="ta" />, <MessageSquare key="m" />, <CheckCircle key="c" />];

const HowItWorks = ({ copy }) => (
  <div>
    <SectionHeader title={copy.headers.howItWorks.title} subtitle={copy.headers.howItWorks.subtitle} />

    {[
      { flow: copy.howItWorks.deals, icons: STEP_ICONS_DEALS },
      { flow: copy.howItWorks.marketplace, icons: STEP_ICONS_MARKET }
    ].map(({ flow, icons }) => (
      <div key={flow.label} className="mb-12">
        <div className="font-mono text-[10px] text-primary tracking-widest uppercase mb-4">{flow.label}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {flow.steps.map((step, idx) => (
            <button
              key={idx}
              className="group relative h-24 bg-surface border border-border hover:border-primary transition-colors p-4 text-left overflow-hidden"
            >
              <div className="absolute right-2 top-2 text-border group-hover:text-primary/20 transition-colors">
                {icons[idx]}
              </div>
              <div className="relative z-10 flex flex-col justify-end h-full">
                <div className="font-mono text-[10px] text-subtle mb-1 group-hover:text-primary">
                  0{idx + 1} {"//"}
                </div>
                <div className="font-bold text-text text-sm uppercase">{step.label}</div>
                <div className="text-[10px] text-muted font-mono mt-0.5">{step.sub}</div>
              </div>
              <div className="absolute bottom-0 left-0 h-1 w-0 bg-primary group-hover:w-full transition-all duration-300" />
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);

/* ── Secondary features (agents, skills, data) ── */

const SECONDARY_ITEMS = [
  { key: "agents", tab: "agents", Icon: Cpu, color: "text-primary" },
  { key: "skills", tab: "skills", Icon: Package, color: "text-secondary" },
  { key: "data", tab: "data", Icon: Database, color: "text-emerald-400" }
];

const SecondaryFeatures = ({ copy }) => (
  <div>
    <SectionHeader title={copy.headers.secondary.title} subtitle={copy.headers.secondary.subtitle} />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {SECONDARY_ITEMS.map(({ key, tab, Icon, color }) => (
        <Link key={key} href={`/explore?tab=${tab}`} className="block h-full">
          <TechBorder className="h-full">
            <div className="p-6 flex flex-col h-full relative">
              <div className="absolute top-4 right-4 border border-border bg-bg px-2 py-1 text-[9px] font-mono uppercase text-subtle">
                {copy.future.badge}
              </div>
              <div className={`w-10 h-10 border border-border-strong bg-[color-mix(in_srgb,var(--color-surface-alt)_50%,transparent)] flex items-center justify-center ${color} mb-4`}>
                <Icon size={20} />
              </div>
              <h3 className="text-lg font-bold text-text uppercase mb-2">{copy.secondary[key].title}</h3>
              <p className="text-sm text-muted font-mono leading-relaxed">{copy.secondary[key].description}</p>
              <div className="mt-auto pt-4 flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest">
                <ChevronRight size={14} />
                {copy.secondary[key].title}
              </div>
            </div>
          </TechBorder>
        </Link>
      ))}
    </div>
  </div>
);

/* ── Developer section ── */

const DeveloperSection = ({ copy }) => (
  <div className="max-w-4xl mx-auto">
    <SectionHeader title={copy.headers.developer.title} subtitle={copy.headers.developer.subtitle} />
    <div style={{ contentVisibility: "auto", containIntrinsicSize: "560px" }}>
      <TerminalEmulator />
    </div>
    <div className="mt-12" style={{ contentVisibility: "auto", containIntrinsicSize: "520px" }}>
      <NpmCallout copy={copy} />
    </div>
  </div>
);

/* ── Main Landing component ── */

type LandingProps = {
  locale?: string;
  buildTimeIso: string;
  appVersion: string;
  deploySha?: string;
  futureMode?: boolean;
};

export default function Landing({ locale = "en", buildTimeIso, appVersion, deploySha, futureMode = false }: LandingProps) {
  const { themeId, setTheme, themes } = useTheme();
  const copy = COPY[locale] || COPY.en;
  const deployShaShort = typeof deploySha === "string" ? deploySha.slice(0, 7) : undefined;

  return (
    <div className="min-h-screen">
      <Navbar
        copy={copy}
        themeId={themeId}
        setTheme={setTheme}
        themes={themes}
        futureMode={futureMode}
      />

      <main className="pb-32">
        {futureMode && (
          <div className="bg-bg border-b border-border">
            <div className="max-w-[1400px] mx-auto px-6 py-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-subtle">
                <span className="w-2 h-2 bg-primary animate-pulse" />
                {copy.future.bannerTitle}
              </div>
              <div className="text-xs font-mono text-muted">{copy.future.bannerBody}</div>
            </div>
          </div>
        )}

        <DealsHero copy={copy} futureMode={futureMode} locale={locale} />

        {/* Trust marquee */}
        <div className="bg-primary text-bg py-2 overflow-hidden border-y border-bg">
          <div
            className="flex whitespace-nowrap gap-12 font-mono text-xs font-bold uppercase tracking-widest"
            style={{ animation: "marquee 20s linear infinite" }}
          >
            {[...Array(10)].map((_, i) => (
              <React.Fragment key={i}>
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

        {/* Content sections */}
        <div className="max-w-[1400px] mx-auto px-6 py-16 space-y-24">
          <ShowcaseSection
            header={copy.headers.deals}
            showcase={copy.showcase.deals}
            PhoneComponent={DealsPhone}
            copy={copy}
            futureMode={futureMode}
          />

          <ShowcaseSection
            header={copy.headers.marketplace}
            showcase={copy.showcase.marketplace}
            PhoneComponent={MarketPhone}
            copy={copy}
            futureMode={futureMode}
            reverse
          />

          <HowItWorks copy={copy} />

          <SecondaryFeatures copy={copy} />

          <DeveloperSection copy={copy} />
        </div>
      </main>

      <footer className="bg-bg border-t border-border py-16">
        <div className="max-w-[1400px] mx-auto px-6 grid grid-cols-1 md:grid-cols-4 gap-12 text-xs font-mono text-subtle">
          <div className="col-span-1 md:col-span-2">
            <div className="text-2xl font-bold text-text mb-4 tracking-tighter">CLAWDEALS</div>
            <p className="max-w-xs leading-relaxed">
              {copy.footer.tagline}
              <br />
              <br />
              {copy.footer.serverTime}: <span suppressHydrationWarning>{buildTimeIso}</span>
              <br />
              VERSION: <span>v{appVersion}</span>
              {deployShaShort ? (
                <>
                  <br />
                  DEPLOY: <span title={deploySha}>{deployShaShort}</span>
                </>
              ) : null}
            </p>
            <div className="mt-6 max-w-md">
              <WaitlistForm copy={copy} locale={locale} compact source="footer" />
            </div>
          </div>
          <div>
            <h4 className="text-text font-bold mb-4 uppercase">{copy.footer.sysLinks}</h4>
            <ul className="space-y-2">
              <li className="hover:text-primary cursor-pointer">{copy.footer.status}</li>
              <li className="hover:text-primary cursor-pointer">{copy.footer.api}</li>
              <li className="hover:text-primary cursor-pointer">{copy.footer.audit}</li>
            </ul>
          </div>
          <div>
            <h4 className="text-text font-bold mb-4 uppercase">{copy.footer.legal}</h4>
            <ul className="space-y-2">
              <li className="hover:text-primary cursor-pointer">{copy.footer.terms}</li>
              <li className="hover:text-primary cursor-pointer">{copy.footer.privacy}</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
