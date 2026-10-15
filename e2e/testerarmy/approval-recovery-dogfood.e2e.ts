import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const ownerId = "11111111-1111-4111-8111-111111111111";
const approvalId = "22222222-2222-4222-8222-222222222222";
const listingId = "33333333-3333-4333-8333-333333333333";
const approval = {
  approval_id: approvalId, owner_id: ownerId, state: "PENDING", action_type: "offer_over_budget",
  action_ref_id: "a".repeat(64),
  action_ref: { mission_id: "44444444-4444-4444-8444-444444444444", listing_id: listingId, amount: 1350, currency: "EUR" },
  action_payload_redacted: { offer: { amount: 1350, currency: "EUR" }, policy: { hard_budget_max: 1300 } },
  created_at: "2026-10-15T08:00:00Z"
};
const path = `/fr/my/approvals/${approvalId}`;

// Controlled client recovery only. Auth, approvals and all writes are simulated;
// the separate commerce campaign qualifies real Auth and database persistence.
for (const scenario of ["session expired", "response lost", "response truncated", "storage unavailable", "owner changed"]) {
  test(`an approval recovers safely after ${scenario}`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    let activeOwner: string | null = ownerId;
    let current = structuredClone(approval);
    const writes: { key: string; body: string }[] = [];
    let release!: () => void;
    const responseGate = new Promise<void>(resolve => { release = resolve; });
    let holdLoginProbe = false;
    let loginProbes = 0;
    let releaseLogin!: () => void;
    const loginGate = new Promise<void>(resolve => { releaseLogin = resolve; });
    await browser.route("**/*", async route => {
      if (new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
      else await route.abort();
    });
    await browser.route("**/api/v1/auth/session", async route => {
      if (holdLoginProbe) { loginProbes += 1; await loginGate; }
      await route.fulfill({ json: { data: { authenticated: Boolean(activeOwner), owner_id: activeOwner } } });
    });
    await browser.route(`**/api/v1/approvals/${approvalId}`, route => route.fulfill(activeOwner === ownerId
      ? { json: { data: current } }
      : { status: 401, json: { error: { code: "SESSION_EXPIRED", message: "Session expired" } } }));
    await browser.route(`**/api/v1/approvals/${approvalId}:approve`, async route => {
      writes.push({ key: route.request.headers["idempotency-key"], body: route.request.postData || "" });
      if (scenario === "session expired" && writes.length === 1) {
        activeOwner = null;
        await route.fulfill({ status: 401, json: { error: { code: "SESSION_EXPIRED", message: "Session expired" } } });
        return;
      }
      current = { ...current, state: "APPROVED", action_ref: { ...current.action_ref, amount: 1290 },
        action_payload_redacted: { ...current.action_payload_redacted, offer: { amount: 1290, currency: "EUR" } } };
      if ((scenario === "response lost" || scenario === "response truncated") && writes.length === 1) {
        await responseGate;
        if (scenario === "response truncated") await route.fulfill({ status: 200, contentType: "application/json", body: '{"data":' });
        else await route.abort();
        return;
      }
      await route.fulfill({ json: { data: current } });
    });
    if (scenario === "storage unavailable") {
      await browser.addInitScript(() => {
        const original = Storage.prototype.setItem;
        (window as any).__restoreApprovalStorage = () => { Storage.prototype.setItem = original; };
        Storage.prototype.setItem = function(key, value) {
          if (key.startsWith("clawdeals:approval-recovery:")) throw new DOMException("Storage unavailable", "QuotaExceededError");
          original.call(this, key, value);
        };
      });
    }
    try {
      await app.open(path);
      await screen.getByTestId("approval-offer-amount").fill("1290");
      if (scenario === "owner changed") activeOwner = "55555555-5555-4555-8555-555555555555";
      if (scenario === "response lost") {
        // Same-event-loop double activation also exercises the synchronous lock.
        await browser.evaluate(() => {
          const button = Array.from(document.querySelectorAll("button")).find(item => item.textContent?.trim() === "Approuver");
          button?.click(); button?.click(); return null;
        });
      } else await screen.getByRole("button", "Approuver").tap();
      if (scenario === "session expired") {
        const signIn = screen.getByRole("link", "Se reconnecter");
        await expect(signIn).toBeVisible();
        await expect(signIn).toHaveAttribute("href", `/fr/auth/login?next=${encodeURIComponent(path)}`);
        // Hold LoginPage's actual session probe until the login screen mounts.
        // Restoring the fixture then releases its own redirect; a second
        // app.open(path) would race window.location.assign and cause ERR_ABORTED.
        holdLoginProbe = true;
        await signIn.tap();
        await expect(browser).toHaveURL(`/fr/auth/login?next=${encodeURIComponent(path)}`);
        await expect(screen.getByTestId("auth-login-email")).toBeVisible();
        await expect.poll(() => loginProbes).toBe(1);
        activeOwner = ownerId;
        holdLoginProbe = false;
        releaseLogin();
        await expect(browser).toHaveURL(path);
        await expect(screen.getByTestId("approval-offer-amount")).toHaveValue("1290");
        await browser.reload();
        await expect(screen.getByTestId("approval-offer-amount")).toHaveValue("1290");
        await screen.getByRole("button", "Approuver").tap();
        await expect.poll(() => writes.length).toBe(2);
        expect(JSON.parse(writes[1].body)).toEqual({ amount: 1290 });
      } else if (scenario === "response lost" || scenario === "response truncated") {
        await expect.poll(() => writes.length).toBe(1);
        await expect(screen.getByRole("button", "Approuver")).toBeDisabled();
        await expect(screen.getByTestId("approval-offer-amount")).toBeDisabled();
        release();
        await expect(screen.getByRole("button", "Vérifier le résultat")).toBeEnabled();
        await browser.reload();
        await expect(screen.getByTestId("approval-offer-amount")).toHaveValue("1290");
        await screen.getByRole("button", "Vérifier le résultat").tap();
        await expect.poll(() => writes.length).toBe(2);
        expect(writes[1]).toEqual(writes[0]);
      } else {
        await expect(screen.getByRole("alert").filter({ hasText: scenario === "owner changed" ? "compte" : "stockage" })).toBeVisible();
        expect(writes).toHaveLength(0);
        if (scenario === "owner changed") activeOwner = ownerId;
        else await browser.evaluate(() => { (window as any).__restoreApprovalStorage(); return null; });
        await screen.getByRole("button", "Approuver").tap();
        await expect.poll(() => writes.length).toBe(1);
      }
      await expect(screen.getByRole("button", "Approuver")).toHaveCount(0);
      await expect(screen.getByRole("button", "Vérifier le résultat")).toHaveCount(0);
      await app.screenshot(`approval-recovered-${scenario.replaceAll(" ", "-")}`);
    } finally { release(); releaseLogin(); }
  });
}

test("approval context stays usable after resolution and never treats internal hashes as listings", async ({ app, browser, screen }) => {
  const missionId = approval.action_ref.mission_id;
  const otherListingId = "66666666-6666-4666-8666-666666666666";
  const cases = [
    { data: approval, label: "Voir la mission", href: `/fr/my/missions/${missionId}` },
    // Public listings disappear when RESERVED/COMPLETED; the owner mission remains accessible.
    { data: { ...approval, state: "APPROVED" }, label: "Voir la mission", href: `/fr/my/missions/${missionId}` },
    { data: { ...approval, state: "APPROVED", action_type: "listing_publish", action_ref_id: otherListingId,
      action_ref: { listing_id: listingId } }, label: "Voir l'annonce", href: `/fr/my/listings/${listingId}` },
    { data: { ...approval, action_type: "listing_publish", action_ref_id: listingId,
      action_ref: { listing_id: "invalid-listing" } }, label: "Voir l'annonce", href: `/fr/my/listings/${listingId}` },
    { data: { ...approval, action_ref: { listing_id: listingId, mission_id: "invalid-mission" } },
      label: "Voir l'annonce", href: `/fr/browse/${listingId}` },
    { data: { ...approval, state: "APPROVED", action_ref: { listing_id: listingId } }, label: null, href: null },
    // Consent references are transactions; their listing is already reserved even while PENDING.
    { data: { ...approval, action_type: "contact_reveal_consent", action_ref: { listing_id: listingId } }, label: null, href: null },
    { data: { ...approval, action_ref: { listing_id: "invalid-listing", mission_id: "invalid-mission" } }, label: null, href: null }
  ];
  let current: (typeof cases)[number]["data"] = approval;
  await browser.route("**/api/v1/approvals/**", route => route.fulfill({ json: { data: current } }));
  for (const [index, scenario] of cases.entries()) {
    current = scenario.data;
    if (index === 0) await app.open(path);
    else await browser.reload();
    await expect(screen.getByText(scenario.data.state, { exact: true })).toBeVisible();
    if (scenario.href) {
      await expect(screen.getByRole("link", scenario.label!)).toHaveAttribute("href", scenario.href);
      await expect(screen.getByRole("link", scenario.label === "Voir la mission" ? "Voir l'annonce" : "Voir la mission")).toHaveCount(0);
    } else {
      await expect(screen.getByRole("link", "Voir la mission")).toHaveCount(0);
      await expect(screen.getByRole("link", "Voir l'annonce")).toHaveCount(0);
    }
    await expect(browser.locator(`a[href*="${approval.action_ref_id}"]`)).toHaveCount(0);
  }
});

test("a queue decision cannot replace an interrupted approval or discard its note", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  let current = structuredClone(approval);
  const writes: { url: string; key: string; body: string }[] = [];
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: ownerId } } }));
  await browser.route("**/api/v1/me/agents**", route => route.fulfill({ json: { data: { agents: [] } } }));
  await browser.route("**/api/v1/approvals**", async route => {
    if (route.request.method === "POST") {
      writes.push({ url: route.request.url, key: route.request.headers["idempotency-key"], body: route.request.postData || "" });
      current = { ...current, state: "APPROVED" };
      await route.fulfill({ json: { data: current } });
    } else if (new URL(route.request.url).pathname === "/api/v1/approvals") {
      await route.fulfill({ json: { data: { approvals: [current], next_cursor: null } } });
    } else await route.fulfill({ json: { data: current } });
  });
  await browser.addInitScript(({ owner, id }) => {
    sessionStorage.setItem(`clawdeals:approval-recovery:v1:${owner}:${id}`, JSON.stringify({
      ownerId: owner, approvalId: id, amount: "1290",
      pending: { action: "approve", body: JSON.stringify({ amount: 1290, note: "Original recovery note" }), key: "original-approval-attempt" }
    }));
  }, { owner: ownerId, id: approvalId });
  await app.open("/fr/my/approvals");
  await screen.getByRole("button", "Refuser").tap();
  const recoveryLink = screen.getByRole("link", "Ouvrir l’approbation pour continuer");
  await expect(recoveryLink).toBeVisible();
  expect(writes).toHaveLength(0);
  await recoveryLink.tap();
  await expect(screen.getByTestId("approval-offer-amount")).toHaveValue("1290");
  await screen.getByRole("button", "Vérifier le résultat").tap();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].url).toContain(`${approvalId}:approve`);
  expect(writes[0].key).toBe("original-approval-attempt");
  expect(JSON.parse(writes[0].body)).toEqual({ amount: 1290, note: "Original recovery note" });
  await expect(screen.getByRole("button", "Vérifier le résultat")).toHaveCount(0);
});
