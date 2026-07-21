import { describe, expect, it } from "vitest";
import { buildSitemapXml, getServerSideProps } from "../../pages/sitemap.xml";

type MockRes = {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
  getHeader: (name: string) => string | undefined;
  write: (chunk: string) => void;
  end: (chunk?: string) => void;
  body: string;
};

function createMockRes(): MockRes {
  const headers = new Map<string, string>();
  let body = "";

  return {
    statusCode: 200,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    write(chunk) {
      body += String(chunk);
    },
    end(chunk) {
      if (typeof chunk === "string") body += chunk;
    },
    get body() {
      return body;
    }
  };
}

describe("sitemap.xml", () => {
  it("includes marketing host urls for edge-proxied requests and sets Vary", async () => {
    const res = createMockRes();
    const req = {
      headers: {
        host: "app.clawdeals.com",
        "x-edge-router-proxy": "marketing",
        "x-forwarded-host": "clawdeals.com",
        "x-forwarded-proto": "https"
      }
    };

    await getServerSideProps({ req, res } as any);

    expect(res.body).toContain("<loc>https://clawdeals.com/</loc>");
    expect(res.body).toContain("<loc>https://clawdeals.com/browse</loc>");
    expect(res.body).toContain("<loc>https://clawdeals.com/browse/deals</loc>");
    expect(res.body).toContain("<loc>https://clawdeals.com/marketplace</loc>");
    expect(res.body).toContain("<loc>https://clawdeals.com/fr/browse</loc>");
    expect(res.body).toContain("<loc>https://clawdeals.com/es/marketplace</loc>");
    expect(res.getHeader("vary")).toContain("x-edge-router-proxy");
    expect(res.getHeader("vary")).toContain("x-forwarded-host");
  });

  it("includes localized guide hubs and every registry-backed guide", () => {
    const xml = buildSitemapXml({ baseUrl: "https://clawdeals.com" });

    expect(xml).toContain("<loc>https://clawdeals.com/guides</loc>");
    expect(xml).toContain("<loc>https://clawdeals.com/fr/integrations</loc>");
    expect(xml).toContain("<loc>https://clawdeals.com/es/guides/openclaw-skill-vs-mcp-vs-clawhub</loc>");
    expect(xml).toContain("<loc>https://clawdeals.com/fr/guides/mcp-security-checklist</loc>");
    expect(xml).toContain("<loc>https://clawdeals.com/es/guides/ai-agent-human-approval-spending</loc>");
    expect(xml).toContain("<loc>https://clawdeals.com/guides/ai-agent-marketplace</loc>");
    expect(xml).toContain("<loc>https://clawdeals.com/pricing</loc>");
    expect(xml).toContain("<loc>https://clawdeals.com/fr/about/editorial</loc>");
    expect(xml).toContain("<loc>https://clawdeals.com/es/pricing</loc>");
    expect(xml).toContain('hreflang="en-GB" href="https://clawdeals.com/guides"');
    expect(xml).toContain('hreflang="fr-FR" href="https://clawdeals.com/fr/guides"');
    expect(xml).toContain('hreflang="es-ES" href="https://clawdeals.com/es/guides"');
  });

  it("uses route-level content dates instead of a deployment fallback", () => {
    const xml = buildSitemapXml({ baseUrl: "https://clawdeals.com" });
    const homeEntry = xml.match(/<loc>https:\/\/clawdeals\.com\/<\/loc>\s+<lastmod>([^<]+)<\/lastmod>/);
    const newGuideEntry = xml.match(/<loc>https:\/\/clawdeals\.com\/guides\/mcp-security-checklist<\/loc>\s+<lastmod>([^<]+)<\/lastmod>/);

    expect(homeEntry?.[1]).toBe("2026-02-27");
    expect(newGuideEntry?.[1]).toBe("2026-07-18");
    expect(xml).not.toContain("2025-01-01");
  });
});
