import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const ownerId = "11111111-1111-4111-8111-111111111111";
const approvalId = "22222222-2222-4222-8222-222222222222";
const approvalPath = `/fr/my/approvals/${approvalId}`;
const user = { id: ownerId, aud: "authenticated", role: "authenticated", email: "synthetic-owner@example.test", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-10-15T08:00:00Z" };
const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: ownerId, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), "synthetic-signature"].join(".");

// The real auth client retains a synthetic Supabase session. Its owner cookie
// expires independently, and a delayed bridge exposes route-render cancellation.
test("a client-side return to login survives a router update while restoring its owner session", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  let authenticated = false;
  let bridgeCalls = 0;
  let approvalPosts = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method) ? route.continue() : route.abort());
  await browser.route("**/auth/v1/user**", route => route.fulfill({ json: user }));
  await browser.route("**/api/v1/auth/session:bridge", async route => {
    bridgeCalls += 1;
    if (bridgeCalls > 1) await gate;
    authenticated = true;
    await route.fulfill({ json: { data: { authenticated: true } } });
  });
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated, owner_id: authenticated ? ownerId : null } } }));
  await browser.route("**/api/v1/approvals/**", async route => {
    if (route.request.method === "POST") { approvalPosts += 1; await route.abort(); return; }
    await route.fulfill({ json: { data: { approval_id: approvalId, owner_id: ownerId, state: "PENDING", action_type: "offer_over_budget",
      action_ref: { mission_id: "44444444-4444-4444-8444-444444444444", amount: 1350, currency: "EUR" },
      action_payload_redacted: { offer: { amount: 1350, currency: "EUR" } } } } });
  });
  try {
    await app.open(`/auth/callback?next=${encodeURIComponent(approvalPath)}#access_token=${token}&refresh_token=synthetic-refresh&expires_in=3600&token_type=bearer&type=signup`);
    await expect(browser).toHaveURL(approvalPath);
    await screen.getByTestId("approval-offer-amount").fill("1290");
    authenticated = false;
    await screen.getByRole("button", "Approuver").tap();
    await screen.getByRole("link", "Se reconnecter").tap();
    await expect.poll(() => bridgeCalls).toBe(2);
    await expect(screen.getByTestId("auth-login-email")).toBeVisible();
    // A shallow URL update replaces the Pages Router context without changing
    // the return destination. The in-flight session check must still complete.
    await browser.evaluate(async () => {
      const router = (window as any).next.router;
      await router.replace({ pathname: router.pathname, query: { ...router.query, mode: "signup" } }, undefined, { shallow: true });
      return null;
    });
    await expect(screen.getByTestId("auth-login-submit")).toHaveText(/^Créer mon compte$/i);
    release();
    await expect(browser).toHaveURL(approvalPath);
    await expect(screen.getByTestId("approval-offer-amount")).toHaveValue("1290");
    expect(bridgeCalls).toBe(2);
    expect(approvalPosts).toBe(0);
    await app.screenshot("automatic-owner-session-restored");
  } finally { release(); }
});
