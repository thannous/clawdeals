import { credentials, expect } from "e2e";
import { test } from "./fixtures";

for (const entry of ["search", "listing"] as const) {
  test(`a buyer creates and retrieves a real ${entry === "search" ? "French search with no matches" : "British listing mission with a match"}`, { trace: "off", video: "off" }, async ({ app, browser, screen, missionFixture }) => {
    const listing = entry === "listing" ? await missionFixture.createListing("GB", 75) : null;
    const query = listing?.title || `Introuvable ${missionFixture.id}`;
    const preferred = "75.50";
    const ceiling = "83.25";
    const city = entry === "listing" ? "custom" : "lyon";
    if (listing) {
      await app.open(`/fr/browse/${listing.id}`);
      await expect(screen.getByRole("heading", new RegExp(`^${listing.title}$`, "i"))).toBeVisible();
      await screen.getByTestId("listing-ask-agent").click();
      await expect(browser).toHaveURL(/\/fr\/my\/missions\/new\?/);
      await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue("75");
      await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue("82.5");
    } else {
      await app.open("/fr/browse");
      await screen.getByTestId("browse-search").fill(query);
      await screen.getByTestId("browse-create-mission").click();
      await screen.getByTestId("buy-mission-city").selectOption({ value: city });
    }
    await screen.getByRole("spinbutton", "Prix préféré").fill(preferred);
    await screen.getByRole("spinbutton", "Plafond absolu").fill(ceiling);
    await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(query);
    await screen.getByRole("spinbutton", "Rayon en km").fill("12");
    await screen.getByRole("textbox", "Exigences minimales").fill("");
    await app.screenshot(`${entry}-mission-before-login`);
    await screen.getByRole("button", "Continuer").click();
    await expect(screen.getByTestId("auth-login-page")).toBeVisible();
    expect(new URL(await browser.url()).searchParams.get("next")).toContain("/fr/my/missions/new");
    await screen.getByLabel("Email").fill(missionFixture.email);
    await screen.getByLabel("Password").fill(credentials.user("mission").password);
    await screen.getByTestId("auth-login-submit").click();
    await expect(browser).toHaveURL(/\/fr\/my\/missions\/new/);
    await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(query);
    await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue(ceiling);
    await expect(screen.getByRole("button", "Vérifier ma mission")).toBeEnabled();

    // The input values survive the actual authentication redirect and a reload.
    await browser.reload();
    await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(query);
    await expect(screen.getByRole("spinbutton", "Prix préféré")).toHaveValue(preferred);
    await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue(ceiling);
    await expect(screen.getByRole("spinbutton", "Rayon en km")).toHaveValue("12");
    await expect(screen.getByTestId("buy-mission-city")).toHaveValue(city);
    expect(await browser.evaluate(() => localStorage.getItem("clawdeals_api_key"))).toBeNull();

    await screen.getByRole("button", "Vérifier ma mission").click();
    const review = screen.getByRole("region", "Vérifier ma mission");
    await expect(review).toContainText(query, { ignoreCase: true });
    const before = await browser.evaluate(async () => {
      const response = await fetch("/api/v1/owner/missions", { credentials: "include", cache: "no-store" });
      return { status: response.status, body: await response.json() };
    });
    expect(before.status).toBe(200);
    expect(before.body.items).toHaveLength(0);
    expect(missionFixture.missionWrites).toHaveLength(0);
    await review.getByRole("button", "Modifier").click();
    await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(query);
    await screen.getByRole("button", "Vérifier ma mission").click();
    const creationResponse = browser.waitForResponse("**/api/v1/owner/missions");
    await screen.getByRole("region", "Vérifier ma mission").getByRole("button", "Confirmer la mission").click();
    const creation = await creationResponse;
    const creationBody = await creation.json() as { error?: { code?: string } };
    expect({ status: creation.status, code: creationBody?.error?.code || null }).toEqual({ status: 201, code: null });
    await expect(screen.getByTestId("owner-mission-detail")).toBeVisible();
    const missionId = new URL(await browser.url()).pathname.split("/").pop()!;
    expect(missionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(missionFixture.missionWrites).toHaveLength(1);
    const firstWrite = missionFixture.missionWrites[0];
    expect(firstWrite.idempotencyKey).toBeTruthy();

    const missionResponse = await browser.evaluate(async (id) => {
      const response = await fetch(`/api/v1/owner/missions/${id}`, { credentials: "include", cache: "no-store" });
      return { status: response.status, body: await response.json() };
    }, missionId);
    expect(missionResponse.status).toBe(200);
    expect(missionResponse.body).toMatchObject({
      watchlist_id: missionId, market_code: listing ? "GB" : "FR", currency: listing ? "GBP" : "EUR",
      criteria: { query, mission: {
        preferred_price_max: 75.5, hard_budget_max: Number(ceiling), currency: listing ? "GBP" : "EUR",
        autonomous_actions: ["search"], location: { radius_km: 12 }
      } }
    });
    const persisted = await missionFixture.db.from("watchlists").select("criteria,agent_id").eq("watchlist_id", missionId).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data!.criteria).toEqual(missionResponse.body.criteria);
    const noKeys = await missionFixture.db.from("api_keys").select("api_key_id").eq("agent_id", persisted.data!.agent_id);
    expect(noKeys.error).toBeNull();
    expect(noKeys.data).toHaveLength(0);
    const replay = await browser.evaluate(async ({ idempotencyKey, body }) => {
      const response = await fetch("/api/v1/owner/missions", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body
      });
      return { status: response.status, body: await response.json() };
    }, firstWrite);
    expect(replay.status).toBe(201);
    expect(replay.body.watchlist_id).toBe(missionId);

    const matches = await browser.evaluate(async (id) => {
      const response = await fetch(`/api/v1/owner/missions/${id}/matches`, { credentials: "include", cache: "no-store" });
      return { status: response.status, body: await response.json() };
    }, missionId);
    expect(matches.status).toBe(200);
    expect(matches.body.status).toBe("ACTIVE");
    if (listing) {
      expect(matches.body.items.map((item: { listing_id: string }) => item.listing_id)).toEqual([listing.id]);
      await expect(screen.getByTestId("mission-matches").getByRole("heading", new RegExp(`^${listing.title}$`, "i"))).toBeVisible();
    } else {
      expect(matches.body.items).toHaveLength(0);
      await expect(screen.getByTestId("mission-matches")).toContainText("Aucune annonce");
      await expect(screen.getByTestId("mission-matches").getByRole("button", "Repartir de ces critères")).toBeVisible();
    }
    await browser.reload();
    await expect(screen.getByTestId("buy-mission-summary")).toContainText(query, { ignoreCase: true });
    await app.open("/fr/my/missions");
    await expect(screen.getByTestId("owner-missions").getByRole("link", query)).toBeVisible();
    await screen.getByTestId("owner-missions").getByRole("link", query).click();
    await expect(browser).toHaveURL(`/fr/my/missions/${missionId}`);
    await expect(screen.getByTestId("buy-mission-summary")).toContainText(query, { ignoreCase: true });

    const anonymous = await fetch(new URL(`/api/v1/owner/missions/${missionId}`, app.baseUrl));
    expect(anonymous.status).toBe(401);
    if (!listing) {
      await screen.getByRole("button", "Repartir de ces critères").click();
      await expect(browser).toHaveURL(`/fr/my/missions/new?from=${missionId}`);
      await expect(screen.getByRole("textbox", "Objet recherché")).toHaveValue(query);
      await expect(screen.getByRole("spinbutton", "Plafond absolu")).toHaveValue(ceiling);
    }
  });
}
