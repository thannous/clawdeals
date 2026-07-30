import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BrowseListings from "../../pages/browse";
import BrowseDeals from "../../pages/browse/deals";
import GuidesIndex from "../../pages/guides";
import AiAgentMarketplaceGuide from "../../pages/guides/ai-agent-marketplace";
import AiAgentSpendingApprovalGuide from "../../pages/guides/ai-agent-human-approval-spending";
import McpMarketplaceSafety from "../../pages/guides/mcp-marketplace-safety";
import McpSecurityChecklistGuide from "../../pages/guides/mcp-security-checklist";
import OpenClawDealWatch from "../../pages/guides/openclaw-dealwatch";
import OpenClawInstallMethodsGuide from "../../pages/guides/openclaw-skill-vs-mcp-vs-clawhub";
import IntegrationsIndex from "../../pages/integrations";
import EditorialPage from "../../pages/about/editorial";
import PricingPage from "../../pages/pricing";
import { JsonLd } from "../../ui/guides/SeoGuidePage";

vi.mock("next/router", () => ({
  useRouter: () => ({
    locale: "en",
    pathname: "/guides/test",
    asPath: "/guides/test",
    push: vi.fn(),
    replace: vi.fn()
  })
}));

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    key.endsWith("Count") ? "0" : `${namespace}.${key}`
}));

const pageProps = {
  baseUrl: "https://clawdeals.com",
  isPreviewHost: false,
  messages: {}
};

function count(html: string, pattern: RegExp) {
  return [...html.matchAll(pattern)].length;
}

function readJsonLd(html: string, id: string) {
  const match = html.match(
    new RegExp(`<script(?=[^>]*id="${id}")(?=[^>]*type="application/ld\\+json")[^>]*>([\\s\\S]*?)<\\/script>`)
  );

  expect(match, `missing SSR JSON-LD script #${id}`).not.toBeNull();
  return JSON.parse(match?.[1] || "null") as { "@context": string; "@graph": Array<Record<string, unknown>> };
}

function expectLandmarks(html: string, article: boolean) {
  expect(count(html, /<main\b[^>]*id="main-content"/g)).toBe(1);
  expect(count(html, /\bid="main-content"/g)).toBe(1);
  expect(count(html, /<article\b/g)).toBe(article ? 1 : 0);
}

describe("marketing SSR schema and landmarks", () => {
  it.each([
    {
      name: "OpenClaw install methods",
      id: "guide-openclaw-skill-vs-mcp-vs-clawhub-json-ld",
      type: "Article",
      render: () => <OpenClawInstallMethodsGuide {...pageProps} />
    },
    {
      name: "MCP security checklist",
      id: "guide-mcp-security-checklist-json-ld",
      type: "HowTo",
      render: () => <McpSecurityChecklistGuide {...pageProps} />
    },
    {
      name: "AI spending approvals",
      id: "guide-ai-agent-human-approval-spending-json-ld",
      type: "HowTo",
      render: () => <AiAgentSpendingApprovalGuide {...pageProps} />
    },
    {
      name: "AI agent marketplace",
      id: "guide-ai-agent-marketplace-json-ld",
      type: "Article",
      render: () => <AiAgentMarketplaceGuide {...pageProps} />
    },
    {
      name: "MCP marketplace safety",
      id: "guide-mcp-marketplace-safety-json-ld",
      type: "TechArticle",
      render: () => <McpMarketplaceSafety {...pageProps} />
    },
    {
      name: "OpenClaw DealWatch",
      id: "guide-openclaw-dealwatch-json-ld",
      type: "HowTo",
      render: () => <OpenClawDealWatch {...pageProps} />
    }
  ])("renders $name schema in the server HTML", ({ id, type, render }) => {
    const html = renderToStaticMarkup(render());
    const schema = readJsonLd(html, id);
    const graphTypes = schema["@graph"].map((entry) => entry["@type"]);

    expect(schema["@context"]).toBe("https://schema.org");
    expect(graphTypes).toContain(type);
    expect(graphTypes).toContain("FAQPage");
    const article = schema["@graph"].find((entry) => entry["@type"] === type) as { author?: { "@id"?: string; name?: string } };
    expect(article.author).toMatchObject({ name: "ClawDeals Editorial Team" });
    expect(article.author?.["@id"]).toContain("/about/editorial#team");
    expect(html).not.toContain("afterInteractive");
    expectLandmarks(html, true);
  });

  it.each([
    {
      name: "listings hub",
      id: "browse-listings-json-ld",
      render: () => (
        <BrowseListings
          baseUrl={pageProps.baseUrl}
          isPreviewHost={false}
          locale="en"
          initialListings={[]}
          initialNextCursor={null}
        />
      )
    },
    {
      name: "deals hub",
      id: "browse-deals-json-ld",
      render: () => (
        <BrowseDeals
          baseUrl={pageProps.baseUrl}
          isPreviewHost={false}
          locale="en"
          initialDeals={[]}
          initialNextCursor={null}
        />
      )
    },
    {
      name: "guides hub",
      id: "guides-index-json-ld",
      render: () => <GuidesIndex {...pageProps} />
    },
    {
      name: "integrations hub",
      id: "integrations-index-json-ld",
      render: () => <IntegrationsIndex {...pageProps} />
    }
  ])("renders the $name collection schema in the server HTML", ({ id, render }) => {
    const html = renderToStaticMarkup(render());
    const schema = readJsonLd(html, id);

    expect(schema["@graph"].map((entry) => entry["@type"])).toContain("CollectionPage");
    expectLandmarks(html, false);
  });

  it.each([
    {
      id: "browse-listings-json-ld",
      render: () => (
        <BrowseListings
          baseUrl={pageProps.baseUrl}
          isPreviewHost={false}
          locale="en"
          initialListings={[]}
          initialNextCursor={null}
        />
      )
    },
    {
      id: "browse-deals-json-ld",
      render: () => (
        <BrowseDeals
          baseUrl={pageProps.baseUrl}
          isPreviewHost={false}
          locale="en"
          initialDeals={[]}
          initialNextCursor={null}
        />
      )
    }
  ])("renders $id in the server HTML with one localized breadcrumb target", ({ id, render }) => {
    const html = renderToStaticMarkup(render());
    const schema = readJsonLd(html, id);
    const collection = schema["@graph"].find((entry) => entry["@type"] === "CollectionPage");
    const breadcrumbs = schema["@graph"].find((entry) => entry["@type"] === "BreadcrumbList") as {
      itemListElement: Array<Record<string, unknown>>;
    };

    expect(collection?.inLanguage).toBe("en-GB");
    expect(breadcrumbs.itemListElement).toHaveLength(2);
    expect(html).not.toContain("afterInteractive");
  });

  it.each([
    {
      name: "pricing status",
      id: "pricing-json-ld",
      type: "WebPage",
      article: false,
      render: () => <PricingPage {...pageProps} />
    },
    {
      name: "editorial standards",
      id: "editorial-json-ld",
      type: "AboutPage",
      article: true,
      render: () => <EditorialPage {...pageProps} />
    }
  ])("renders the $name page schema in the server HTML", ({ id, type, article, render }) => {
    const html = renderToStaticMarkup(render());
    const schema = readJsonLd(html, id);

    expect(schema["@graph"].map((entry) => entry["@type"])).toContain(type);
    expectLandmarks(html, article);
  });

  it("serializes script-closing text without breaking out of JSON-LD", () => {
    const unsafe = "</script><script>alert(1)</script>";
    const html = renderToStaticMarkup(<JsonLd id="escaping-json-ld" data={{ value: unsafe }} />);
    const schema = readJsonLd(html, "escaping-json-ld") as unknown as { value: string };

    expect(html).not.toContain(unsafe);
    expect(schema.value).toBe(unsafe);
  });
});
