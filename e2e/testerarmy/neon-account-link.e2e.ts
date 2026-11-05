import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

// Local fixture only. No auth provider/database/email/OAuth requests escape.
beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl!).origin;
  if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local linking fixtures only");
  await browser.route("**/*", async route => {
    const url = new URL(route.request.url);
    if (url.origin !== origin || url.pathname.startsWith("/api/")) return route.abort();
    await route.continue();
  });
});
for (const message of ["Account linking is not enabled", "Sign in to your existing ClawDeals account on this origin first", "Your existing ClawDeals session has expired"]) {
  test(`account link safely stops: ${message}`, async ({ app, browser, screen }) => {
    await browser.route("**/api/v1/auth/neon:link-status", route => route.fulfill({ status: 401, json: { error: { message } } }));
    await app.open("/settings/neon-link?code=interrupted-fixture");
    await expect(screen.getByRole("status")).toContainText(message);
    await expect(screen.getByRole("button", "Sign in to Neon")).toHaveCount(0);
    await expect(screen.getByRole("button", "Confirm account link")).toHaveCount(0);
    await expect(screen.getByRole("link", "Cancel and return to identities")).toBeVisible();
  });
}
// Start isolated app with NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND=neon.
// All APIs are synthetic. This is client behavior, not real provider verification.
for (const conflict of [false, true]) {
  test(`Neon callback requires explicit confirmation and preserves source cookie (${conflict ? "conflict" : "success/replay"})`, async ({ app, browser, screen }) => {
    const ownerId = "11111111-1111-4111-8111-111111111111";
    const sourceCookie = "fixture-source-session-not-real";
    await browser.setCookies([{ name: "cd_owner_session", value: sourceCookie, url: app.baseUrl!, httpOnly: true, sameSite: "Lax" }]);
    await browser.addInitScript(id => sessionStorage.setItem("clawdeals.neon_link_owner", id), ownerId);
    await browser.route("**/api/v1/auth/neon:link-status", route => route.fulfill({ status: 200, json: { data: { owner_id: ownerId, email: "source@example.test" } } }));
    await browser.route("**/api/auth/get-session**", route => route.fulfill({ status: 200, json: {
      session: { id: "fixture-session", userId: "fixture-neon", token: "fixture-jwt", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      user: { id: "fixture-neon", email: "neon@example.test", emailVerified: true, name: "Fixture", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }
    } }));
    const writes: string[] = [];
    await browser.route("**/api/v1/auth/neon:link", async route => {
      writes.push(route.request.postData || "");
      await route.fulfill(conflict ? { status: 409, json: { error: { message: "Fixture identity belongs to another owner" } } } : { status: 200, json: { data: { owner_id: ownerId, linked: true } } });
    });
    await app.open("/settings/neon-link?code=fixture-callback");
    await expect(screen.getByRole("button", "Confirm account link")).toBeEnabled(); expect(writes).toHaveLength(0);
    await expect(screen.getByText("Neon account: neon@example.test")).toBeVisible();
    await app.open("/settings/neon-link"); await expect(screen.getByRole("button", "Confirm account link")).toBeEnabled(); expect(writes).toHaveLength(0);
    await screen.getByRole("button", "Confirm account link").tap();
    await expect(screen.getByRole("status")).toContainText(conflict ? "Fixture identity belongs to another owner" : "Account linked.");
    expect(JSON.parse(writes[0])).toEqual({ expected_owner_id: ownerId });
    expect((await browser.cookies()).find(cookie => cookie.name === "cd_owner_session")?.value).toBe(sourceCookie);
    await app.open("/settings/neon-link?code=replayed-fixture"); await expect(screen.getByRole("button", "Confirm account link")).toBeEnabled(); expect(writes).toHaveLength(1);
  });
}
