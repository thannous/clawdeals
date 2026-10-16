import { expect } from "e2e";
import { test } from "./fixtures";

function successful(response: { status: number; body: any }, status: number) {
  expect({ status: response.status, code: response.body?.error?.code || null }).toEqual({ status, code: null });
  return response.body;
}

// Real owner cookies and agent APIs, with the fixture's owned graph and cleanup.
// The buyer discovers their saved work and decisions through the visible UI;
// API calls perform only the negotiation that belongs to an agent today.
test("a connected buyer finds their mission and starts new criteria without losing the original", { trace: "off", video: "off" }, async ({ app, browser, screen, commerceFixture: fixture }) => {
  const { listing } = fixture;
  await fixture.signIn("buyer", "/fr/my/missions");
  await app.open(`/fr/browse/${listing.id}`);
  await screen.getByTestId("listing-ask-agent").click();
  await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(listing.title);
  await screen.getByRole("spinbutton", "Prix préféré").fill("120");
  await screen.getByRole("spinbutton", "Plafond absolu").fill("130");
  await screen.getByRole("textbox", "Exigences minimales").fill("");
  await screen.getByRole("button", "Vérifier ma mission").click();
  const creationResponse = browser.waitForResponse("**/api/v1/owner/missions");
  await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
  const creation = await creationResponse;
  const original = successful({ status: creation.status, body: await creation.json() }, 201);
  expect(original.watchlist_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(original.criteria.mission).toMatchObject({ preferred_price_max: 120, hard_budget_max: 130 });
  await expect(browser).toHaveURL(`/fr/my/missions/${original.watchlist_id}`);
  await expect(screen.getByTestId("mission-matches").getByRole("heading", new RegExp(`^${listing.title}$`, "i"))).toBeVisible();
  // The real fixture title has no spaces: its rendered text must stay readable
  // inside the summary, rather than merely existing outside a clipped card.
  expect(await browser.evaluate(() => {
    const summary = document.querySelector('[data-testid="buy-mission-summary"]');
    const title = summary?.querySelector("h3");
    if (!summary || !title) return false;
    const range = document.createRange();
    range.selectNodeContents(title);
    const text = range.getBoundingClientRect();
    const card = summary.getBoundingClientRect();
    return text.width > 0 && text.left >= card.left && text.right <= card.right + 1 &&
      document.documentElement.scrollWidth <= window.innerWidth + 1;
  })).toBe(true);
  await app.screenshot("buyer-mission-matching-listing");

  await screen.getByTestId("app-nav").getByRole("link", "Mes missions").click();
  await expect(browser).toHaveURL("/fr/my/missions");
  await screen.getByTestId("owner-missions").getByRole("link", listing.title, { exact: true }).click();
  await expect(browser).toHaveURL(`/fr/my/missions/${original.watchlist_id}`);
  const matchingListing = screen.getByTestId("mission-matches").getByRole("link");
  await expect(matchingListing).toHaveCount(1);
  await expect(matchingListing).toHaveAttribute("href", `/fr/browse/${listing.id}`);
  await matchingListing.click();
  await expect(browser).toHaveURL(new RegExp(`/fr/browse/${listing.id}$`));
  await expect(screen.getByRole("heading", new RegExp(`^${listing.title}$`, "i"))).toBeVisible();
  await app.back();
  await expect(browser).toHaveURL(`/fr/my/missions/${original.watchlist_id}`);

  await screen.getByRole("button", "Repartir de ces critères").click();
  await expect(browser).toHaveURL(`/fr/my/missions/new?from=${original.watchlist_id}`);
  await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(listing.title);
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("130");
  await screen.getByRole("spinbutton", "Prix préféré").fill("90");
  await screen.getByRole("spinbutton", "Plafond absolu").fill("100");
  await screen.getByRole("button", "Vérifier ma mission").click();
  const revisedResponse = browser.waitForResponse("**/api/v1/owner/missions");
  await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
  const revision = await revisedResponse;
  const revised = successful({ status: revision.status, body: await revision.json() }, 201);
  expect(revised.watchlist_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(revised.watchlist_id).not.toBe(original.watchlist_id);
  expect(revised.criteria.mission).toMatchObject({ preferred_price_max: 90, hard_budget_max: 100 });
  await expect(browser).toHaveURL(`/fr/my/missions/${revised.watchlist_id}`);
  await expect(screen.getByTestId("mission-no-matches")).toContainText("Aucune annonce correspondante pour le moment");
  await expect(screen.getByTestId("mission-matches").getByRole("link")).toHaveCount(0);
  await app.screenshot("buyer-mission-lower-budget-empty");

  await screen.getByRole("link", "Toutes mes missions").click();
  await expect(screen.getByTestId("owner-missions").getByRole("link", listing.title, { exact: true })).toHaveCount(2);
  await expect(browser.locator(`article:has(a[href="/fr/my/missions/${original.watchlist_id}"])`)).toContainText(/Plafond : 130,00\s*€/);
  await expect(browser.locator(`article:has(a[href="/fr/my/missions/${revised.watchlist_id}"])`)).toContainText(/Plafond : 100,00\s*€/);
  expect(await browser.evaluate(() => {
    const links = document.querySelectorAll('[data-testid="owner-missions"] article a');
    return links.length === 2 && [...links].every(link => {
      const range = document.createRange();
      range.selectNodeContents(link);
      const text = range.getBoundingClientRect();
      const card = link.closest("article")!.getBoundingClientRect();
      return text.width > 0 && text.left >= card.left && text.right <= card.right + 1;
    }) && document.documentElement.scrollWidth <= window.innerWidth + 1;
  })).toBe(true);
  await app.screenshot("buyer-two-independent-missions");
  await browser.reload();
  await expect(screen.getByTestId("owner-missions").getByRole("link", listing.title, { exact: true })).toHaveCount(2);
});

test("a connected buyer discovers their budget approval, refuses contact sharing and can find both resolved decisions", { trace: "off", video: "off" }, async ({ app, browser, screen, commerceFixture: fixture }) => {
  const { listing } = fixture;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await fixture.signIn("buyer", "/fr/my/missions");
  await app.open(`/fr/browse/${listing.id}`);
  await screen.getByTestId("listing-ask-agent").click();
  await screen.getByRole("spinbutton", "Prix préféré").fill("120");
  await screen.getByRole("spinbutton", "Plafond absolu").fill("130");
  await screen.getByRole("textbox", "Exigences minimales").fill("");
  await screen.getByText("Plus d’options · durée et actions autorisées").click();
  await screen.getByRole("checkbox", "Faire des offres conformes").check();
  await screen.getByRole("button", "Vérifier ma mission").click();
  const creationResponse = browser.waitForResponse("**/api/v1/owner/missions");
  await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
  const creation = await creationResponse;
  const mission = successful({ status: creation.status, body: await creation.json() }, 201);
  await expect(browser).toHaveURL(`/fr/my/missions/${mission.watchlist_id}`);
  await expect(screen.getByTestId("mission-matches").getByRole("heading", new RegExp(`^${listing.title}$`, "i"))).toBeVisible();

  const thread = successful(await fixture.asAgent("buyer", "POST", `/api/v1/listings/${listing.id}/threads`, {}), 201);
  const initial = successful(await fixture.asAgent("buyer", "POST", `/api/v1/listings/${listing.id}/offers`, {
    thread_id: thread.thread_id, mission_id: mission.watchlist_id, amount: 120, currency: "EUR", expires_at: expiresAt
  }), 201);
  const counter = successful(await fixture.asAgent("seller", "POST", `/api/v1/offers/${initial.offer_id}/counter`, {
    amount: 135, currency: "EUR", expires_at: expiresAt
  }), 201);
  const blocked = await fixture.asAgent("buyer", "POST", `/api/v1/offers/${counter.offer_id}/accept`, { mission_id: mission.watchlist_id });
  expect(blocked.status).toBe(409);
  expect(blocked.body.error).toMatchObject({ code: "APPROVAL_REQUIRED", details: { reason: "hard_budget_exceeded" } });
  const approvalId = blocked.body.error.details.approval_id;
  expect(approvalId).toMatch(/^[0-9a-f-]{36}$/);

  // No approval deep link: the buyer must find and open the pending row.
  await screen.getByTestId("app-nav").getByRole("link", "Mes approbations").click();
  await expect(screen.getByTestId("my-approvals-page")).toBeVisible();
  // Labels describe the decision to the owner; backend action codes stay in API data.
  const budgetRow = screen.getByRole("table").getByRole("button", /Offre au-delà du budget/);
  await expect(budgetRow).toContainText(/en attente/i);
  expect(await browser.evaluate(() => {
    const table = document.querySelector("table");
    const container = table?.parentElement;
    const actions = table?.querySelectorAll("tbody td:last-child button");
    return Boolean(container && container.scrollWidth <= container.clientWidth + 1 && actions?.length === 2 &&
      [...actions].every(button => {
        const bounds = button.getBoundingClientRect();
        return bounds.width > 0 && bounds.left >= 0 && bounds.right <= window.innerWidth;
      }));
  })).toBe(true);
  await app.screenshot("buyer-pending-budget-approval-list");
  await budgetRow.getByText("Offre au-delà du budget", { exact: true }).click();
  await expect(browser).toHaveURL(`/fr/my/approvals/${approvalId}`);
  await expect(screen.getByTestId("editable-offer-approval-sheet")).toContainText("130 EUR");
  await screen.getByTestId("approval-offer-amount").fill("129");
  const approvalResponse = browser.waitForResponse(`**/api/v1/approvals/${approvalId}:approve`);
  await screen.getByRole("button", "Approuver", { exact: true }).click();
  const approved = await approvalResponse;
  expect(successful({ status: approved.status, body: await approved.json() }, 200).data.state).toBe("APPROVED");
  await expect(screen.getByRole("button", "Approuver", { exact: true })).toHaveCount(0);
  const revised = await fixture.db.from("offers").select("offer_id,amount,status").eq("previous_offer_id", counter.offer_id);
  expect(revised.error).toBeNull();
  expect(revised.data).toHaveLength(1);
  expect(revised.data![0]).toMatchObject({ amount: 129, status: "CREATED" });
  const accepted = successful(await fixture.asAgent("seller", "POST", `/api/v1/offers/${revised.data![0].offer_id}/accept`, {}), 200);
  expect(accepted).toMatchObject({ status: "ACCEPTED", listing_status: "RESERVED", transaction: { status: "ACCEPTED" } });
  const txId = accepted.transaction.tx_id;
  expect(txId).toMatch(/^[0-9a-f-]{36}$/);

  await screen.getByTestId("app-nav").getByRole("link", "Mes offres").click();
  await screen.getByTestId("my-offers-toolbar").getByRole("button", "Acceptée", { exact: true }).click();
  await expect(browser).toHaveURL(/status=ACCEPTED/);
  await expect(browser.locator("table tbody tr")).toHaveCount(1);
  await expect(screen.getByRole("table")).toContainText("129 EUR");
  await expect(screen.getByRole("table")).toContainText("Annonce indisponible publiquement");
  await expect(screen.getByRole("table").getByRole("button", listing.id.slice(0, 8), { exact: true })).toHaveAttribute("title", listing.id);
  await expect(screen.getByTestId("my-offers-item-link")).toHaveCount(0);
  // A buyer may read the accepted offer, but the seller's private listing page
  // remains owner-only. Retain only status/code, never a private response body.
  const privateListing = await browser.evaluate(async (listingId) => {
    const response = await fetch(`/api/v1/owner/listings/${listingId}`, { credentials: "include", cache: "no-store" });
    const body = await response.json();
    return { status: response.status, code: body?.error?.code || null };
  }, listing.id);
  expect(privateListing).toEqual({ status: 404, code: "NOT_FOUND" });
  await app.screenshot("buyer-accepted-offer-private-listing");

  const requested = successful(await fixture.asAgent("buyer", "POST", `/api/v1/transactions/${txId}/request-contact-reveal`, {}), 202);
  expect(requested).toMatchObject({ contact_reveal_state: "REQUESTED", consent_states: { buyer: "PENDING", seller: "PENDING" } });
  await screen.getByTestId("app-nav").getByRole("link", "Mes approbations").click();
  const consentRow = screen.getByRole("table").getByRole("button", /Partager les coordonnées/);
  await expect(consentRow).toContainText(/en attente/i);
  await consentRow.getByText("Partager les coordonnées", { exact: true }).click();
  await expect(screen.getByTestId("contact-reveal-consent-sheet")).toContainText("Propriétaire acheteur");
  const consentId = new URL(await browser.url()).pathname.split("/").pop()!;
  expect(consentId).toMatch(/^[0-9a-f-]{36}$/);
  await app.screenshot("buyer-contact-consent-before-refusal");
  const refusalResponse = browser.waitForResponse(`**/api/v1/approvals/${consentId}:deny`);
  await screen.getByRole("button", "Refuser", { exact: true }).click();
  const refusal = await refusalResponse;
  expect(successful({ status: refusal.status, body: await refusal.json() }, 200).data)
    .toMatchObject({ state: "DENIED", contact_reveal_state: "DENIED", became_revealed: false });
  await expect(screen.getByRole("button", "Refuser", { exact: true })).toHaveCount(0);
  for (const role of ["buyer", "seller"] as const) {
    const transaction = successful(await fixture.asAgent(role, "GET", `/api/v1/transactions/${txId}`), 200);
    expect(transaction.data).toMatchObject({ status: "ACCEPTED", contact_reveal_state: "DENIED" });
    expect(transaction.data).not.toHaveProperty("seller_contact");
    expect(transaction.data).not.toHaveProperty("buyer_contact");
  }

  // Resolved decisions must remain discoverable without remembering their URLs.
  await screen.getByTestId("app-nav").getByRole("link", "Mes approbations").click();
  const filters = screen.getByTestId("my-approvals-toolbar");
  await filters.getByRole("button", "Refusé", { exact: true }).click();
  await expect(screen.getByRole("table").getByRole("button", /Partager les coordonnées/)).toContainText(/refusé/i);
  await app.screenshot("buyer-refused-contact-history");
  await filters.getByRole("button", "Tous", { exact: true }).click();
  await expect(browser).toHaveURL(/state=ALL/);
  await expect(filters.getByRole("button", "Tous", { exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(browser.locator("table tbody tr")).toHaveCount(2);
  await expect(screen.getByRole("table").getByRole("button", /Offre au-delà du budget/)).toContainText(/approuvé/i);
  await expect(screen.getByRole("table").getByRole("button", /Partager les coordonnées/)).toContainText(/refusé/i);
  await app.screenshot("buyer-all-approval-history");
  await filters.getByRole("button", "Tous", { exact: true }).click();
  await expect(browser.locator("table tbody tr")).toHaveCount(2);
  const agents = screen.getByTestId("agent-dropdown");
  await agents.getByRole("button", "Agent : Tous les agents", { exact: true }).click();
  await agents.getByRole("button", "Tous les agents", { exact: true }).click();
  await expect(browser.locator("table tbody tr")).toHaveCount(2);
  await browser.reload();
  await expect(filters.getByRole("button", "Tous", { exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(browser.locator("table tbody tr")).toHaveCount(2);
  await screen.getByRole("table").getByText("Offre au-delà du budget", { exact: true }).click();
  await expect(browser).toHaveURL(`/fr/my/approvals/${approvalId}`);
  await app.back();
  await expect(browser).toHaveURL(/state=ALL/);
  await expect(browser.locator("table tbody tr")).toHaveCount(2);
});
