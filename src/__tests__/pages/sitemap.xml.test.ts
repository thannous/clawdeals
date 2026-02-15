import { describe, expect, it } from "vitest";
import { getServerSideProps } from "../../pages/sitemap.xml";

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
    expect(res.getHeader("vary")).toContain("x-edge-router-proxy");
    expect(res.getHeader("vary")).toContain("x-forwarded-host");
  });
});
