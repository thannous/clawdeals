import { randomUUID } from "node:crypto";
import { credentials, expect } from "e2e";
import { test } from "./fixtures";

// Two real password sessions and agent API identities, no legacy identity
// headers. Auth/contact payloads stay out of network traces and screenshots.
test("two owners complete a mission, recover an expired approval session and consent bilaterally", { trace: "off", video: "off" }, async ({ app, browser, screen, commerceFixture: fixture }) => {
  const { listing } = fixture;
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const exactResponse = (response: { status: number; body: any }, status: number) => {
    expect({ status: response.status, code: response.body?.error?.code || null }).toEqual({ status, code: null });
    return response.body;
  };
  const ownerRead = async (path: string) => browser.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    return { status: response.status, body: await response.json() };
  }, path);
  const signIn = async (role: "buyer" | "seller") => {
    await expect(screen.getByTestId("auth-login-page")).toBeVisible();
    await screen.getByLabel("Email").fill(fixture[role].email);
    await screen.getByLabel("Mot de passe").fill(credentials.user(role).password);
    await screen.getByTestId("auth-login-submit").click();
  };
  const switchOwner = async (role: "buyer" | "seller", next: string) => {
    await app.clearState();
    await fixture.installBrowserGuard();
    await app.open(`/fr/auth/login?next=${encodeURIComponent(next)}`);
    await signIn(role);
    await expect(browser).toHaveURL(next);
  };
  const approve = async (approvalId: string) => {
    const response = browser.waitForResponse(`**/api/v1/approvals/${approvalId}:approve`);
    await screen.getByRole("button", "Approuver").click();
    const result = await response;
    const body = await result.json() as { data: { state: string; contact_reveal_state?: string; became_revealed?: boolean } };
    exactResponse({ status: result.status, body }, 200);
    expect(body.data.state).toBe("APPROVED");
    await expect(screen.getByRole("button", "Approuver")).toHaveCount(0);
    return body;
  };

  await app.open(`/fr/browse/${listing.id}`);
  await expect(screen.getByRole("heading", new RegExp(`^${listing.title}$`, "i"))).toBeVisible();
  await screen.getByTestId("listing-ask-agent").click();
  await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(listing.title);
  await screen.getByRole("spinbutton", "Prix préféré").fill("120");
  await screen.getByRole("spinbutton", "Plafond absolu").fill("130");
  await screen.getByRole("textbox", "Exigences minimales").fill("");
  await screen.getByText("Plus d’options · durée et actions autorisées").click();
  await screen.getByRole("checkbox", "Faire des offres conformes").check();
  await screen.getByRole("button", "Continuer").click();
  await signIn("buyer");
  await expect(browser).toHaveURL(/\/fr\/my\/missions\/new/);
  await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("130");
  await screen.getByRole("button", "Vérifier ma mission").click();
  const missionCreationResponse = browser.waitForResponse("**/api/v1/owner/missions");
  await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
  const missionCreation = await missionCreationResponse;
  exactResponse({ status: missionCreation.status, body: await missionCreation.json() }, 201);
  await expect(screen.getByTestId("owner-mission-detail")).toBeVisible();
  const missionId = new URL(await browser.url()).pathname.split("/").pop()!;
  expect(missionId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(screen.getByTestId("mission-matches").getByRole("heading", new RegExp(`^${listing.title}$`, "i"))).toBeVisible();
  const mission = exactResponse(await ownerRead(`/api/v1/owner/missions/${missionId}`), 200);
  expect(mission.criteria.mission).toMatchObject({ preferred_price_max: 120, hard_budget_max: 130, autonomous_actions: ["search", "make_offer"] });
  const assignedAgent = await fixture.db.from("watchlists").select("agent_id").eq("watchlist_id", missionId).single();
  expect(assignedAgent.error).toBeNull();
  expect(assignedAgent.data?.agent_id).toBe(fixture.buyer.agentId);
  // The public full-text index finds this word only in the description. A
  // mission must retain that result even though the query has no ASCII token.
  const unicodeMission = exactResponse(await browser.evaluate(async ({ criteria, key, ownerId }) => {
    const response = await fetch("/api/v1/owner/missions", { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key, "X-Expected-Owner-Id": ownerId },
      body: JSON.stringify({ market_code: "FR", criteria: { ...criteria, query: "été" } }) });
    return { status: response.status, body: await response.json() };
  }, { criteria: mission.criteria, key: randomUUID(), ownerId: fixture.buyer.ownerId }), 201);
  const unicodeMatches = exactResponse(await ownerRead(`/api/v1/owner/missions/${unicodeMission.watchlist_id}/matches`), 200);
  expect(unicodeMatches.items.map((row: any) => row.listing_id)).toContain(listing.id);

  const thread = exactResponse(await fixture.asAgent("buyer", "POST", `/api/v1/listings/${listing.id}/threads`, {}), 201);
  const initial = exactResponse(await fixture.asAgent("buyer", "POST", `/api/v1/listings/${listing.id}/offers`, {
    thread_id: thread.thread_id, mission_id: missionId, amount: 120, currency: "EUR", expires_at: expiresAt
  }), 201);
  const counter = exactResponse(await fixture.asAgent("seller", "POST", `/api/v1/offers/${initial.offer_id}/counter`, {
    amount: 135, currency: "EUR", expires_at: expiresAt
  }), 201);
  const blocked = await fixture.asAgent("buyer", "POST", `/api/v1/offers/${counter.offer_id}/accept`, { mission_id: missionId });
  expect(blocked.status).toBe(409);
  expect(blocked.body.error).toMatchObject({ code: "APPROVAL_REQUIRED", details: { reason: "hard_budget_exceeded" } });
  const approvalId = blocked.body.error.details.approval_id;
  expect(approvalId).toMatch(/^[0-9a-f-]{36}$/);
  const forbidden = await fixture.asAgent("buyer", "POST", `/api/v1/approvals/${approvalId}:approve`, { amount: 129 });
  expect({ status: forbidden.status, code: forbidden.body.error.code }).toEqual({ status: 403, code: "HUMAN_APPROVAL_REQUIRED" });

  await app.open(`/fr/my/approvals/${approvalId}`);
  await expect(screen.getByTestId("editable-offer-approval-sheet")).toBeVisible();
  await screen.getByTestId("approval-offer-amount").fill("129");
  await browser.reload();
  await expect(screen.getByTestId("approval-offer-amount")).toHaveValue("129");
  await fixture.expireOwnerSessions("buyer");
  await screen.getByRole("button", "Approuver").click();
  const renewedSession = browser.waitForResponse("**/api/v1/auth/session:bridge");
  await screen.getByRole("link", "Se reconnecter").click();
  // Supabase authentication is still valid: the login page re-establishes the
  // expired owner session without asking for a password again.
  expect((await renewedSession).status).toBe(200);
  await expect(browser).toHaveURL(`/fr/my/approvals/${approvalId}`);
  await expect(screen.getByTestId("approval-offer-amount")).toHaveValue("129");
  await approve(approvalId);
  const approved = await fixture.db.from("approvals").select("state,action_ref,resolved_by_human_id").eq("approval_id", approvalId).single();
  expect(approved.error).toBeNull();
  expect(approved.data).toMatchObject({ state: "APPROVED", resolved_by_human_id: fixture.buyer.ownerId, action_ref: { amount: 129, mission_id: missionId } });
  const revised = await fixture.db.from("offers").select("offer_id,amount,status").eq("previous_offer_id", counter.offer_id);
  expect(revised.error).toBeNull();
  expect(revised.data).toHaveLength(1);
  expect(revised.data![0]).toMatchObject({ amount: 129, status: "CREATED" });

  // A repeated owner action must return the existing result, not a second offer.
  const replay = await browser.evaluate(async ({ id, key }) => {
    const response = await fetch(`/api/v1/approvals/${id}:approve`, { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ amount: 129 }) });
    return { status: response.status, body: await response.json() };
  }, { id: approvalId, key: randomUUID() });
  exactResponse(replay, 200);
  const offerCount = await fixture.db.from("offers").select("offer_id", { count: "exact", head: true }).eq("previous_offer_id", counter.offer_id);
  expect(offerCount.error).toBeNull();
  expect(offerCount.count).toBe(1);
  const accepted = exactResponse(await fixture.asAgent("seller", "POST", `/api/v1/offers/${revised.data![0].offer_id}/accept`, {}), 200);
  expect(accepted).toMatchObject({ status: "ACCEPTED", listing_status: "RESERVED", transaction: { status: "ACCEPTED" } });
  expect(accepted.transaction.tx_id).toMatch(/^[0-9a-f-]{36}$/);
  const txId = accepted.transaction.tx_id;

  await app.open(`/fr/my/approvals/${approvalId}`);
  await screen.getByRole("link", "Voir la mission").click();
  await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
  await expect(screen.getByTestId("owner-mission-detail")).toBeVisible();

  await app.open("/fr/my/offers?status=ACCEPTED");
  await expect(screen.getByRole("table")).toContainText("129 EUR");
  await expect(screen.getByRole("table")).toContainText(/acceptée/i);
  const requested = exactResponse(await fixture.asAgent("buyer", "POST", `/api/v1/transactions/${txId}/request-contact-reveal`, {}), 202);
  expect(requested).toMatchObject({ contact_reveal_state: "REQUESTED", consent_states: { buyer: "PENDING", seller: "PENDING" } });
  const consentRows = await fixture.db.from("approvals").select("approval_id,owner_id,state").eq("action_type", "contact_reveal_consent").eq("action_ref_id", txId);
  expect(consentRows.error).toBeNull();
  expect(consentRows.data).toHaveLength(2);
  const buyerConsent = consentRows.data!.find(row => row.owner_id === fixture.buyer.ownerId)!;
  const sellerConsent = consentRows.data!.find(row => row.owner_id === fixture.seller.ownerId)!;
  expect((await ownerRead(`/api/v1/approvals/${sellerConsent.approval_id}`)).status).toBe(404);
  await app.open(`/fr/my/approvals/${buyerConsent.approval_id}`);
  await expect(screen.getByTestId("contact-reveal-consent-sheet")).toBeVisible();
  expect((await approve(buyerConsent.approval_id)).data).toMatchObject({ contact_reveal_state: "REQUESTED", became_revealed: false });
  const oneConsent = exactResponse(await fixture.asAgent("buyer", "GET", `/api/v1/transactions/${txId}`), 200);
  expect(oneConsent.data.contact_reveal_state).toBe("REQUESTED");
  expect(oneConsent.data).not.toHaveProperty("seller_contact");
  expect(oneConsent.data).not.toHaveProperty("buyer_contact");

  await switchOwner("seller", `/fr/my/approvals/${sellerConsent.approval_id}`);
  await expect(screen.getByTestId("contact-reveal-consent-sheet")).toBeVisible();
  expect((await approve(sellerConsent.approval_id)).data).toMatchObject({ contact_reveal_state: "APPROVED", became_revealed: true });
  for (const role of ["buyer", "seller"] as const) {
    const view = exactResponse(await fixture.asAgent(role, "GET", `/api/v1/transactions/${txId}`), 200);
    const other = role === "buyer" ? "seller" : "buyer";
    expect(view.data[`${other}_contact`].email).toBe(fixture[other].email);
    expect(view.data[`${role}_contact`].email).toBeUndefined();
  }
  const firstCompletion = exactResponse(await fixture.asAgent("buyer", "POST", `/api/v1/transactions/${txId}/mark-completed`, {}), 200);
  expect(firstCompletion.status).toBe("COMPLETED_PENDING_CONFIRM");
  const secondCompletion = exactResponse(await fixture.asAgent("seller", "POST", `/api/v1/transactions/${txId}/mark-completed`, {}), 200);
  expect(secondCompletion.status).toBe("COMPLETED");
  for (const role of ["buyer", "seller"] as const) {
    const view = exactResponse(await fixture.asAgent(role, "GET", `/api/v1/transactions/${txId}`), 200);
    expect(view.data.status).toBe("COMPLETED");
  }
  await app.open("/fr/my/listings");
  await expect(screen.getByRole("button", new RegExp(listing.title))).toContainText("125.00 EUR");
  await screen.getByRole("button", new RegExp(listing.title)).click();
  await expect(browser).toHaveURL(`/fr/my/listings/${listing.id}`);
  await expect(screen.getByTestId("my-listing-detail-page")).toContainText("125.00 EUR");
  await app.open("/fr/my/offers?status=ACCEPTED");
  await expect(screen.getByRole("table")).toContainText("129 EUR");
  await app.open("/fr/my/threads");
  await expect(screen.getByRole("table")).toBeVisible();
  const sellerThreads = exactResponse(await ownerRead("/api/v1/owner/threads"), 200);
  expect(sellerThreads.data.threads.map((row: any) => row.thread_id)).toContain(thread.thread_id);
});
