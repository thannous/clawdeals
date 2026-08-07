import { describe, expect, it } from "vitest";
import { getServerSideProps } from "../../pages/mcp";

type MockRes = {
  setHeader: (name: string, value: string | string[]) => void;
  getHeader: (name: string) => string | undefined;
};

function createMockRes(): MockRes {
  const headers = new Map<string, string>();

  return {
    setHeader(name, value) {
      headers.set(name.toLowerCase(), Array.isArray(value) ? value.join(", ") : String(value));
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    }
  };
}

describe("MCP page cache policy", () => {
  it("enables shared caching on the public marketing host", async () => {
    const res = createMockRes();
    const req = {
      headers: {
        host: "app.clawdeals.com",
        "x-edge-router-proxy": "marketing",
        "x-forwarded-host": "clawdeals.com",
        "x-forwarded-proto": "https"
      }
    };

    await getServerSideProps({ req, res, locale: "es" } as any);

    expect(res.getHeader("cache-control")).toBe(
      "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
    );
  });

  it("keeps direct preview-host responses uncached", async () => {
    const res = createMockRes();
    const req = { headers: { host: "app.clawdeals.com" } };

    await getServerSideProps({ req, res, locale: "es" } as any);

    expect(res.getHeader("cache-control")).toBe("no-store");
  });
});
