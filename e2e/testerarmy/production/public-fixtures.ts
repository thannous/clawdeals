import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test as base } from "@e2e-dev/web";
import { expect } from "e2e";

export const APP_ORIGIN = "https://app.clawdeals.com";
export const MARKETING_ORIGIN = "https://clawdeals.com";
const permittedOrigins = new Set([APP_ORIGIN, MARKETING_ORIGIN]);
type RefusedRequest = { method: string; origin: string; path: string };
type CollectionError = { stage: string; name: string; message: string; stack?: string };

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
    let bodyFailed = false;
    let bodyError: unknown;
    try { await provide(); } catch (error) { bodyFailed = true; bodyError = error; }
    const collectionErrors: CollectionError[] = [];
    const rawCollectionErrors: unknown[] = [];
    function recordError(stage: string, error: unknown) {
      rawCollectionErrors.push(error);
      collectionErrors.push(error instanceof Error
        ? { stage, name: error.name, message: error.message, stack: error.stack }
        : { stage, name: "ThrownValue", message: "Non-Error collection failure" });
    }
    async function collect(stage: string, action: () => Promise<void>) {
      try { await action(); } catch (error) { recordError(stage, error); }
    }
    let publicBuild: { url: string; title: string; buildId: string | null } | null = null;
    let screenshot: string | null = null;
    await collect("public-build", async () => {
      publicBuild = await browser.evaluate(() => {
        const data = document.querySelector<HTMLScriptElement>("script#__NEXT_DATA__")?.textContent;
        return { url: location.href, title: document.title, buildId: data ? JSON.parse(data).buildId : null };
      });
    });
    // Same explicit output environment as the config for supplementary JSON proof.
    const outputRoot = process.env.PARITY_OUTPUT ?? ".e2e/production-public";
    // Since e2e 0.21.3 app.screenshot returns the absolute path of the file it
    // wrote (#1326). Record it relative to the run output so the exportable
    // manifest stays portable and carries no local directory layout.
    await collect("screenshot", async () => { screenshot = relative(resolve(outputRoot), await app.screenshot("production-public-final")); });
    const evidenceDirectory = join(outputRoot, "request-guards");
    const evidencePath = join(evidenceDirectory, `${randomUUID()}.json`);
    const writeEvidence = () => {
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(evidencePath, JSON.stringify({
        publicBuild, screenshot, bodyFailed,
        primaryError: bodyError instanceof Error ? { name: bodyError.name, message: bodyError.message, stack: bodyError.stack } : null,
        collectionErrors, permittedOrigins: [...permittedOrigins],
        forwardedMethods: ["GET", "HEAD"], refusedWrites, refusedExternal,
        services: "real public production reads; no API mocks; all mutations aborted"
      }, null, 2) + "\n");
    };
    try { writeEvidence(); } catch (error) {
      recordError("manifest", error);
      // A best-effort second write retains the manifest failure itself. It does
      // not turn a failed collection into a pass, even if this write succeeds.
      try { writeEvidence(); } catch (secondary) { recordError("manifest-error-record", secondary); }
    }
    if (collectionErrors.length) console.error(JSON.stringify({ productionPublicCollectionErrors: collectionErrors }));
    // The runner closes this isolated context after fixture teardown. Keep
    // the guard active until then, including for late background requests.
    if (bodyFailed) throw bodyError;
    if (collectionErrors.length) throw new AggregateError(rawCollectionErrors, "Production public evidence collection failed");
  }
});
