import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

async function headersForWholeOrigin(): Promise<Record<string, string>> {
  const config = require("../../next.config.js");
  const rules = await config.headers();
  const rule = rules.find((entry: { source: string }) => entry.source === "/:path*");
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
