import { test as base, surfaceOf, type Browser } from "@e2e-dev/web";
import { expect as e2eExpect } from "e2e";
import type { Page, BrowserContext, APIRequestContext } from "@playwright/test";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { desktopEngine, mobileEngine } from "./web-engines";

// Matchers only: TesterArmy remains the sole runner and owns the browser trace.
export const { expect }: typeof import("@playwright/test") = createRequire(import.meta.url)("@playwright/test");
type Historical = { page: Page; context: BrowserContext; request: APIRequestContext; browser: Browser; baseURL: string };
type ArtifactInfo = { outputPath(name: string): string; attach(name: string, artifact: { body: string | Buffer; contentType: string }): Promise<void> };
type Body = (fixtures: Historical, info: ArtifactInfo) => Promise<void>;

export function createHistoricalTest() {
  let timeout = 60_000;
  let hooks: Array<(fixtures: Historical) => Promise<void>> = [];
  const parity = base.extend<{ historical: Historical }>({
    historical: async ({ app, browser }, provide) => {
      const forbidden: string[] = [];
      const origin = new URL(app.baseUrl!).origin;
      // Existing page.route mocks take precedence. Unmocked API traffic must
      // never turn a client contract test into an authenticated backend action.
      await browser.route("**/*", async route => {
        const url = new URL(route.request.url);
        if (url.origin === origin && (!url.pathname.startsWith("/api/") || ["GET", "HEAD"].includes(route.request.method))) await route.continue();
        else {
          if (url.origin === origin) forbidden.push(`${route.request.method} ${url.pathname}`);
          await route.abort();
        }
      });
      await app.open();
      const width = await browser.evaluate(() => window.innerWidth);
      const surface = surfaceOf(width === 390 ? mobileEngine : desktopEngine)!;
      const page = surface.page() as unknown as Page;
      const context = surface.context() as unknown as BrowserContext;
      const request = context.request;
      const goto = page.goto;
      const get = request.get;
      const addInitScript = page.addInitScript;
      // e2e0.15's TypeScript loader preserves callback names with esbuild's
      // __name helper. Its browser fixture has no public addInitScript yet.
      // Give function callbacks that lexical helper without touching app globals;
      // string/path/content scripts retain the Page API's original behavior.
      page.addInitScript = (script, arg) => {
        if (typeof script !== "function") return addInitScript.call(page, script, arg);
        const source = `(() => { const __name = (target, value) => Object.defineProperty(target, 'name', { value, configurable: true }); return (${script.toString()})(${JSON.stringify(arg)}); })()`;
        return addInitScript.call(page, { content: source });
      };
      page.setDefaultTimeout(30_000);
      page.setDefaultNavigationTimeout(30_000);
      page.goto = (url, options) => goto.call(page, new URL(url, app.baseUrl!).href, options);
      request.get = (url, options) => get.call(request, new URL(url, app.baseUrl!).href, options);
      try { await provide({ page, context, request, browser, baseURL: app.baseUrl! }); }
      finally {
        page.goto = goto;
        page.addInitScript = addInitScript;
        request.get = get;
        e2eExpect.soft(forbidden, "All mutating client API requests use identified historical mocks").toEqual([]);
      }
    },
  });
  const register = (title: string, body: Body) => {
    const setup = [...hooks];
    const attemptTimeout = timeout;
    return parity(title, { timeout: attemptTimeout }, async ({ historical, app }) => {
      const folder = join(process.env.PARITY_OUTPUT ?? ".e2e", "parity-artifacts", `${createHash("sha256").update(title).digest("hex").slice(0, 12)}-${Date.now()}`);
      mkdirSync(folder, { recursive: true });
      const captures: string[] = [];
      const info: ArtifactInfo = {
        outputPath(name) { const path = join(folder, name); captures.push(path); return path; },
        async attach(name, artifact) { writeFileSync(info.outputPath(`${name}.${artifact.contentType === "image/png" ? "png" : "json"}`), artifact.body); }
      };
      try {
        for (const hook of setup) await hook(historical);
        await body(historical, info);
        await app.screenshot("historical-final");
      } finally { writeFileSync(join(folder, "artifacts.json"), JSON.stringify(captures, null, 2) + "\n"); }
    });
  };
  return Object.assign(register, {
    describe(title: string, body: () => void) {
      base.describe(title, () => {
        const previous = { hooks: [...hooks], timeout };
        try { body(); } finally { hooks = previous.hooks; timeout = previous.timeout; }
      });
    },
    beforeEach(hook: (fixtures: Historical) => Promise<void>) { hooks.push(hook); },
    setTimeout(value: number) { timeout = value; },
    skip: base.skip,
  });
}
