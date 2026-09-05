import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

async function headersForWholeOrigin(): Promise<Record<string, string>> {
  const config = require("../../next.config.js");
  const rules = await config.headers();
  const rule = rules.find((entry: { source: string; has?: unknown }) => entry.source === "/:path*" && !entry.has);
  expect(rule).toBeDefined();
  // Without `locale: false` the i18n router prefixes the source and `/` gets no headers.
  expect(rule.locale).toBe(false);
  return Object.fromEntries(rule.headers.map((header: { key: string; value: string }) => [header.key, header.value]));
}

describe("Next.js response headers", () => {
  it("requests origin-keyed agent clusters consistently for the whole origin", async () => {
    const headers = await headersForWholeOrigin();
    expect(headers["Origin-Agent-Cluster"]).toBe("?1");
  });

  it("ships the baseline security headers on every route (TI-509)", async () => {
    const headers = await headersForWholeOrigin();
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["Content-Security-Policy-Report-Only"]).toContain("frame-ancestors 'self'");
    // Report-only first: nothing may be enforced before the reports are reviewed.
    expect(headers["Content-Security-Policy"]).toBeUndefined();
  });
});

describe("Next.js redirects", () => {
  it("permanently redirects the legacy marketplace hub to browse for every locale (TI-511)", async () => {
    const config = require("../../next.config.js");
    const redirects = await config.redirects();

    expect(redirects).toContainEqual({
      source: "/marketplace",
      destination: "/browse",
      permanent: true
    });
  });
});

it.each([
  ["sandbox.clawdeals.com", "noindex, follow"],
  ["staging.app.clawdeals.com", "noindex, follow"],
  ["clawdeals.com", undefined],
  ["app.clawdeals.com", undefined]
])("limits global noindex to sandbox hosts: %s", async (host, expected) => {
  const rules = await require("../../next.config.js").headers();
  const matching = rules.filter((rule: any) => !rule.has || rule.has.every((condition: any) =>
    condition.type === "host" && new RegExp(`^${condition.value}$`).test(host)
  ));
  const headers = Object.fromEntries(matching.flatMap((rule: any) => rule.headers.map((header: any) => [header.key, header.value])));
  expect(headers["X-Robots-Tag"]).toBe(expected);
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
});
