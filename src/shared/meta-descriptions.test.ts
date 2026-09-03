import { describe, expect, test } from "vitest";
import { META_DESCRIPTION_MIN_LENGTH, META_DESCRIPTION_MAX_LENGTH } from "./seo";

// --- Category A: Inline pages with export const META_DESCRIPTION ---
import { META_DESCRIPTION as CONSOLE_APPROVALS } from "../pages/console/approvals";
import { META_DESCRIPTION as CONSOLE_APPROVAL_DETAIL } from "../pages/console/approvals/[approval_id]";
import { META_DESCRIPTION as CONSOLE_AUDIT } from "../pages/console/audit";
import { META_DESCRIPTION as CONSOLE_CHANNELS } from "../pages/console/channels";
import { META_DESCRIPTION as CONSOLE_LISTINGS } from "../pages/console/listings";
import { META_DESCRIPTION as CONSOLE_LISTING_DETAIL } from "../pages/console/listings/[listing_id]";
import { META_DESCRIPTION as CONSOLE_LIVE_FEED } from "../pages/console/live-feed";
import { META_DESCRIPTION as CONSOLE_MODERATION } from "../pages/console/moderation";
import { META_DESCRIPTION as CONSOLE_OPS } from "../pages/console/ops";
import { META_DESCRIPTION as CONSOLE_REPORTS } from "../pages/console/reports";
import { META_DESCRIPTION as CONSOLE_REPORT_DETAIL } from "../pages/console/reports/[report_id]";
import { META_DESCRIPTION as CONSOLE_RISK_RULES } from "../pages/console/risk-rules";
import { META_DESCRIPTION as CONSOLE_THREADS } from "../pages/console/threads";
import { META_DESCRIPTION as CONSOLE_THREAD_DETAIL } from "../pages/console/threads/[thread_id]";
import { META_DESCRIPTION as CONSOLE_TIMELINE } from "../pages/console/timeline";
import { META_DESCRIPTION as AUTH_LOGIN } from "../pages/auth/login";
import { META_DESCRIPTION as AUTH_LOGIN_LEGACY } from "../pages/auth/login-legacy";
import { META_DESCRIPTION as AUTH_VERIFY } from "../pages/auth/verify";
import { META_DESCRIPTION as AUTH_RESET } from "../pages/auth/reset";
import { META_DESCRIPTION as AUTH_CALLBACK } from "../pages/auth/callback";
import { META_DESCRIPTION as SETTINGS_ACCOUNT } from "../pages/settings/account";
import { META_DESCRIPTION as SETTINGS_PROFILE } from "../pages/settings/profile";
import { META_DESCRIPTION as SETTINGS_CONNECTED_APPS } from "../pages/settings/connected-apps";
import { META_DESCRIPTION as SETTINGS_IDENTITIES } from "../pages/settings/identities";
import { META_DESCRIPTION as MY_DEALS } from "../pages/my/deals";
import { META_DESCRIPTION as MY_LISTINGS } from "../pages/my/listings";
import { META_DESCRIPTION as MY_LISTING_DETAIL } from "../pages/my/listings/[id]";
import { META_DESCRIPTION as MY_OFFERS } from "../pages/my/offers";
import { META_DESCRIPTION as MY_APPROVALS } from "../pages/my/approvals";
import { META_DESCRIPTION as MY_APPROVAL_DETAIL } from "../pages/my/approvals/[id]";
import { META_DESCRIPTION as MY_THREADS } from "../pages/my/threads";
import { META_DESCRIPTION as DEV_EVENTS } from "../pages/developer/events";
import { META_DESCRIPTION as DEV_INDEX } from "../pages/developer/index";
import { META_DESCRIPTION as DEV_WATCHLISTS_NEW } from "../pages/developer/watchlists/new";
import { META_DESCRIPTION as DEALS_PAGE } from "../pages/deals";
import { META_DESCRIPTION as KEYS_PAGE } from "../pages/keys";
import { META_DESCRIPTION as NOT_FOUND } from "../pages/404";
import { META_DESCRIPTION as PAIR_PAGE } from "../pages/pair";
import { META_DESCRIPTION as START_PAGE } from "../pages/start";
import { META_DESCRIPTION as WEBMCP_PAGE } from "../pages/dev/webmcp";
import { META as WEBMCP_DEMO_META, META_DESCRIPTION as WEBMCP_DEMO_PAGE } from "../pages/webmcp";
import { META_DESCRIPTION as DEVICE_PAGE } from "../pages/device";
import { META_DESCRIPTION as MCP_PAGE } from "../pages/mcp";

// --- Category B: Multilingual META objects ---
import { META as MARKETPLACE_META } from "../pages/marketplace";
import { META as BROWSE_META } from "../pages/browse/index";
import { META as BROWSE_DEALS_META } from "../pages/browse/deals/index";
import { META as BROWSE_LISTING_META } from "../pages/browse/[id]";
import { META as BROWSE_DEAL_DETAIL_META } from "../pages/browse/deals/[dealId]";

// --- Category C: SEO objects ---
import { SEO as DEALWATCH_SEO } from "../pages/guides/openclaw-dealwatch";
import { SEO as OPENCLAW_SEO } from "../pages/integrations/openclaw";

// --- Category D: i18n JSON ---
import enMessages from "../../messages/en.json";
import frMessages from "../../messages/fr.json";
import esMessages from "../../messages/es.json";

// ---- Helpers ----

type DescEntry = { page: string; locale: string; desc: string };

function flattenSeoDescriptions(
  messages: Record<string, any>,
  locale: string,
  prefix = ""
): DescEntry[] {
  const entries: DescEntry[] = [];
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      if ("description" in value && typeof value.description === "string") {
        entries.push({ page: path, locale, desc: value.description });
      }
      entries.push(...flattenSeoDescriptions(value, locale, path));
    }
  }
  return entries;
}

// ---- Build description list ----

const staticDescriptions: DescEntry[] = [
  // Console
  { page: "console/approvals", locale: "en", desc: CONSOLE_APPROVALS },
  { page: "console/approvals/[id]", locale: "en", desc: CONSOLE_APPROVAL_DETAIL },
  { page: "console/audit", locale: "en", desc: CONSOLE_AUDIT },
  { page: "console/channels", locale: "en", desc: CONSOLE_CHANNELS },
  { page: "console/listings", locale: "en", desc: CONSOLE_LISTINGS },
  { page: "console/listings/[id]", locale: "en", desc: CONSOLE_LISTING_DETAIL },
  { page: "console/live-feed", locale: "en", desc: CONSOLE_LIVE_FEED },
  { page: "console/moderation", locale: "en", desc: CONSOLE_MODERATION },
  { page: "console/ops", locale: "en", desc: CONSOLE_OPS },
  { page: "console/reports", locale: "en", desc: CONSOLE_REPORTS },
  { page: "console/reports/[id]", locale: "en", desc: CONSOLE_REPORT_DETAIL },
  { page: "console/risk-rules", locale: "en", desc: CONSOLE_RISK_RULES },
  { page: "console/threads", locale: "en", desc: CONSOLE_THREADS },
  { page: "console/threads/[id]", locale: "en", desc: CONSOLE_THREAD_DETAIL },
  { page: "console/timeline", locale: "en", desc: CONSOLE_TIMELINE },
  // Auth
  { page: "auth/login", locale: "en", desc: AUTH_LOGIN },
  { page: "auth/login-legacy", locale: "en", desc: AUTH_LOGIN_LEGACY },
  { page: "auth/verify", locale: "en", desc: AUTH_VERIFY },
  { page: "auth/reset", locale: "en", desc: AUTH_RESET },
  { page: "auth/callback", locale: "en", desc: AUTH_CALLBACK },
  // Settings
  { page: "settings/account", locale: "en", desc: SETTINGS_ACCOUNT },
  { page: "settings/profile", locale: "en", desc: SETTINGS_PROFILE },
  { page: "settings/connected-apps", locale: "en", desc: SETTINGS_CONNECTED_APPS },
  { page: "settings/identities", locale: "en", desc: SETTINGS_IDENTITIES },
  // My
  { page: "my/deals", locale: "en", desc: MY_DEALS },
  { page: "my/listings", locale: "en", desc: MY_LISTINGS },
  { page: "my/listings/[id]", locale: "en", desc: MY_LISTING_DETAIL },
  { page: "my/offers", locale: "en", desc: MY_OFFERS },
  { page: "my/approvals", locale: "en", desc: MY_APPROVALS },
  { page: "my/approvals/[id]", locale: "en", desc: MY_APPROVAL_DETAIL },
  { page: "my/threads", locale: "en", desc: MY_THREADS },
  // Developer
  { page: "developer/events", locale: "en", desc: DEV_EVENTS },
  { page: "developer/index", locale: "en", desc: DEV_INDEX },
  { page: "developer/watchlists/new", locale: "en", desc: DEV_WATCHLISTS_NEW },
  // Other
  { page: "deals", locale: "en", desc: DEALS_PAGE },
  { page: "keys", locale: "en", desc: KEYS_PAGE },
  { page: "404", locale: "en", desc: NOT_FOUND },
  { page: "pair", locale: "en", desc: PAIR_PAGE },
  { page: "start", locale: "en", desc: START_PAGE },
  { page: "dev/webmcp", locale: "en", desc: WEBMCP_PAGE },
  { page: "webmcp", locale: "en", desc: WEBMCP_DEMO_PAGE },
  { page: "device", locale: "en", desc: DEVICE_PAGE },
  { page: "mcp", locale: "en", desc: MCP_PAGE },
];

// Multilingual META objects
const multilingualDescriptions: DescEntry[] = [
  // marketplace
  { page: "webmcp", locale: "en", desc: WEBMCP_DEMO_META.en.description },
  { page: "webmcp", locale: "fr", desc: WEBMCP_DEMO_META.fr.description },
  { page: "webmcp", locale: "es", desc: WEBMCP_DEMO_META.es.description },
  { page: "marketplace", locale: "en", desc: MARKETPLACE_META.en.description },
  { page: "marketplace", locale: "fr", desc: MARKETPLACE_META.fr.description },
  { page: "marketplace", locale: "es", desc: MARKETPLACE_META.es.description },
  // browse/index
  { page: "browse", locale: "en", desc: BROWSE_META.en.description },
  { page: "browse", locale: "fr", desc: BROWSE_META.fr.description },
  { page: "browse", locale: "es", desc: BROWSE_META.es.description },
  // browse/deals
  { page: "browse/deals", locale: "en", desc: BROWSE_DEALS_META.en.description },
  { page: "browse/deals", locale: "fr", desc: BROWSE_DEALS_META.fr.description },
  { page: "browse/deals", locale: "es", desc: BROWSE_DEALS_META.es.description },
  // browse/[id]
  { page: "browse/[id]", locale: "en", desc: BROWSE_LISTING_META.en.description },
  { page: "browse/[id]", locale: "fr", desc: BROWSE_LISTING_META.fr.description },
  { page: "browse/[id]", locale: "es", desc: BROWSE_LISTING_META.es.description },
  // browse/deals/[dealId]
  { page: "browse/deals/[dealId]", locale: "en", desc: BROWSE_DEAL_DETAIL_META.en.description },
  { page: "browse/deals/[dealId]", locale: "fr", desc: BROWSE_DEAL_DETAIL_META.fr.description },
  { page: "browse/deals/[dealId]", locale: "es", desc: BROWSE_DEAL_DETAIL_META.es.description },
  // guides/openclaw-dealwatch
  { page: "guides/openclaw-dealwatch", locale: "en", desc: DEALWATCH_SEO.en.description },
  { page: "guides/openclaw-dealwatch", locale: "fr", desc: DEALWATCH_SEO.fr.description },
  // integrations/openclaw
  { page: "integrations/openclaw", locale: "en", desc: OPENCLAW_SEO.en.description },
  { page: "integrations/openclaw", locale: "fr", desc: OPENCLAW_SEO.fr.description },
];

// i18n JSON descriptions (seo.* keys)
const i18nDescriptions: DescEntry[] = [
  ...flattenSeoDescriptions(enMessages.seo, "en"),
  ...flattenSeoDescriptions(frMessages.seo, "fr"),
  ...flattenSeoDescriptions(esMessages.seo, "es"),
];

const allDescriptions = [
  ...staticDescriptions,
  ...multilingualDescriptions,
  ...i18nDescriptions,
];

// ---- Tests ----

describe("meta descriptions are 110-160 chars", () => {
  test.each(allDescriptions)(
    "$page ($locale) — $desc",
    ({ desc }) => {
      expect(desc.length).toBeGreaterThanOrEqual(META_DESCRIPTION_MIN_LENGTH);
      expect(desc.length).toBeLessThanOrEqual(META_DESCRIPTION_MAX_LENGTH);
    }
  );
});
