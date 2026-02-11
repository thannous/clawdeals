export type LandingLocale = "fr" | "en";

export type MissionKey = "market_watch" | "admin_core" | "intel_ops" | "comm_relay";

export type ThemeOption = {
  id: string;
  label: string;
};

type HeaderCopy = {
  title: string;
  subtitle: string;
};

type ShowcaseCopy = {
  title: string;
  bullets: string[];
  cta: string;
};

type HowItWorksFlow = {
  label: string;
  steps: {
    label: string;
    sub: string;
  }[];
};

type MissionMessage = {
  type: "bot" | "user";
  text: string;
};

type MissionConversation = {
  header: string;
  online: string;
  messages: MissionMessage[];
};

export type LandingCopy = {
  connect: string;
  searchPlaceholder: string;
  hero: {
    headline: string;
    subheadline: string;
    cta: string;
    deals: {
      title: string;
      subtitle: string;
      description: string;
    };
    marketplace: {
      title: string;
      subtitle: string;
      description: string;
    };
  };
  ctas: {
    browseDeals: string;
    postDeal: string;
    browseListings: string;
    createListing: string;
  };
  future: {
    badge: string;
    bannerTitle: string;
    bannerBody: string;
  };
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
  trust: {
    verified: string;
    escrow: string;
  };
  headers: {
    deals: HeaderCopy;
    marketplace: HeaderCopy;
    howItWorks: HeaderCopy;
    missionSelect: HeaderCopy;
    secondary: HeaderCopy;
    developer: HeaderCopy;
    faq: HeaderCopy;
  };
  showcase: {
    deals: ShowcaseCopy;
    marketplace: ShowcaseCopy;
  };
  howItWorks: {
    deals: HowItWorksFlow;
    marketplace: HowItWorksFlow;
  };
  secondary: {
    agents: {
      title: string;
      description: string;
    };
    skills: {
      title: string;
      description: string;
    };
    data: {
      title: string;
      description: string;
    };
  };
  chat: {
    deals: {
      header: string;
      online: string;
      messages: {
        newDeal: string;
        heatingUp: string;
        votedUp: string;
        newDeal2: string;
        shared: string;
      };
    };
    marketplace: {
      header: string;
      online: string;
      messages: {
        newListing: string;
        offerReceived: string;
        counter: string;
        accepted: string;
        contactRevealed: string;
        complete: string;
      };
    };
    missions: Record<MissionKey, MissionConversation>;
  };
  mcp: {
    title: string;
    description: string;
    snippet: string;
  };
  faq: {
    items: {
      q: string;
      a: string;
    }[];
  };
  footer: {
    sysLinks: string;
    legal: string;
    status: string;
    api: string;
    audit: string;
    terms: string;
    privacy: string;
    tagline: string;
    serverTime: string;
  };
};
