import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test as base } from "@e2e-dev/web";
import { expect } from "e2e";

export const APP_ORIGIN = "https://app.clawdeals.com";
export const MARKETING_ORIGIN = "https://clawdeals.com";
const permittedOrigins = new Set([APP_ORIGIN, MARKETING_ORIGIN]);
type RefusedRequest = { method: string; origin: string; path: string };

export const test = base.extend<{ publicTraffic: void }>({
  publicTraffic: async ({ app, browser }, provide) => {
    expect(app.baseUrl).toBe(`${APP_ORIGIN}/`);
    const refusedWrites: RefusedRequest[] = [];
    const refusedExternal: RefusedRequest[] = [];
    // Install before app.open. No API fixture is used: canonical public GET/HEAD
    // traffic reaches production; every mutation and external request is denied.
    await browser.route("**/*", async route => {
      const url = new URL(route.request.url);
      const entry = { method: route.request.method, origin: url.origin, path: url.pathname };
      if (!["GET", "HEAD"].includes(entry.method)) {
        refusedWrites.push(entry);
        await route.abort();
      } else if (!permittedOrigins.has(url.origin)) {
        refusedExternal.push(entry);
        await route.abort();
      } else {
        await route.continue();
      }
    });
    try {
      await provide();
    } finally {
      const publicBuild = await browser.evaluate(() => {
        const data = document.querySelector<HTMLScriptElement>("script#__NEXT_DATA__")?.textContent;
        return { url: location.href, title: document.title, buildId: data ? JSON.parse(data).buildId : null };
      });
      await app.screenshot("production-public-final");
      // app.screenshot returns an attempt-relative artifact path. Use the same
      // explicit output environment as the config for supplementary JSON proof.
      const evidenceDirectory = join(process.env.PARITY_OUTPUT ?? ".e2e/production-public", "request-guards");
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(join(evidenceDirectory, `${randomUUID()}.json`), JSON.stringify({
        publicBuild, permittedOrigins: [...permittedOrigins],
        forwardedMethods: ["GET", "HEAD"], refusedWrites, refusedExternal,
        services: "real public production reads; no API mocks; all mutations aborted"
      }, null, 2) + "\n");
      await browser.unroute("**/*");
    }
  }
});
