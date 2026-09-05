import { describe, expect, it } from "vitest";
import { getServerSideProps } from "../../pages/robots.txt";

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

describe("robots.txt", () => {
  it("returns allow rules for edge-proxied marketing host and sets Vary", async () => {
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

    expect(res.body).toContain("Allow: /");
    expect(res.body).toContain("Sitemap: https://clawdeals.com/sitemap.xml");
    expect(res.getHeader("vary")).toContain("x-edge-router-proxy");
    expect(res.getHeader("vary")).toContain("x-forwarded-host");
  });

  it("returns disallow rules for direct app host request", async () => {
    const res = createMockRes();
    const req = {
      headers: {
        host: "app.clawdeals.com"
      }
    };

    await getServerSideProps({ req, res } as any);

    expect(res.body).toContain("Disallow: /");
  });
});

it("lets crawlers read sandbox noindex without advertising its sitemap", async () => {
  const res = createMockRes();
  await getServerSideProps({ req: { headers: { host: "sandbox.clawdeals.com" } }, res } as any);
  expect(res.getHeader("X-Robots-Tag")).toBe("noindex, follow");
  expect(res.body).toBe("User-agent: *\nAllow: /\n");
  expect(res.body).not.toContain("Sitemap:");
});
