import { test } from "@e2e-dev/web";
import { expect } from "e2e";

function localOrigin(baseUrl: string | undefined) {
  const url = new URL(baseUrl || "");
  if (url.origin !== "http://localhost:4398") throw new Error("Rehearsal fixture requires confined localhost:4398");
  return url.origin;
}

test("real Next rehearsal runtime blocks writes, cron and Auth before backend transport", async ({ app }) => {
  const origin = localOrigin(app.baseUrl);
  // Direct runner HTTP requests: no browser routing/interception or server mocks.
  // No database/auth URL or credentials are configured for this runtime.
  for (const [method, path] of [
    ["POST", "/api/v1/auth/neon:link"],
    ["POST", "/api/v1/watchlist-signups"],
    ["DELETE", "/api/v1/owner/identities/fixture"],
    ["GET", "/api/internal/cron/trustscore-recalc-queue"],
    ["GET", "/api/internal/cron/partition-maintenance"],
    ["GET", "/api/auth/get-session"],
    ["POST", "/api/auth/sign-in/social"]
  ]) {
    const response = await fetch(`${origin}${path}`, {
      method, redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json" },
      ...(method === "POST" ? { body: "{}" } : {})
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "REHEARSAL_EFFECT_BLOCKED" } });
  }
});

test("actual Next public rehearsal marker blocks browser Auth factory", async ({ app, browser, screen }) => {
  const origin = localOrigin(app.baseUrl);
  const providerAttempts: string[] = [];
  await browser.route("**/*", async route => {
    const url = new URL(route.request.url);
    if (url.pathname.startsWith("/api/auth/")) providerAttempts.push(url.pathname);
    if (url.origin !== origin || url.pathname.startsWith("/api/")) return route.abort();
    await route.continue();
  });
  // Only source-owner status is synthetic so the UI reaches its real factory.
  // This mock is NOT evidence of a permitted or blocked server operation.
  await browser.route("**/api/v1/auth/neon:link-status", route => route.fulfill({ status: 200, json: { data: {
    owner_id: "11111111-1111-4111-8111-111111111111", email: "fixture@example.test"
  } } }));
  await app.open("/settings/neon-link");
  await expect(screen.getByRole("status")).toContainText("External authentication is disabled in rehearsal; use isolated fixtures");
  await expect(screen.getByRole("button", "Confirm account link")).toBeDisabled();
  await screen.getByRole("button", "Continue with Google").tap();
  await expect(screen.getByRole("status")).toContainText("External authentication is disabled in rehearsal; use isolated fixtures");
  expect(providerAttempts).toHaveLength(0);
});
