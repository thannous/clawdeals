import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { composeProjectPlan, type ProjectCandidate } from "../../src/shared/project-missions";
import type { ProjectMission } from "../../src/ui/project-missions/projectClient";
import { officeBrief, officeCatalogue, PROJECT_DATE, PROJECT_ID, PROJECT_NOW, PROJECT_OTHER_OWNER, PROJECT_OWNER } from "./project-mission-fixtures";

const wire = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

async function projectApi(browser: any, candidates = officeCatalogue()) {
  const state = {
    owner: PROJECT_OWNER,
    authenticated: true,
    candidates,
    writes: [] as { action: string; body: any; owner: string; key: string }[],
    loseCreationResponse: false,
    mission: {
      id: PROJECT_ID, owner_id: PROJECT_OWNER, agent_id: "ba500000-0000-4000-8000-000000000001", version: 1,
      brief: officeBrief, plan: composeProjectPlan(officeBrief, candidates), selected_configuration_id: null,
      confirmed_version: null, confirmed_at: null, status: "DRAFT", contacts: [], created_at: PROJECT_NOW, updated_at: PROJECT_NOW
    } as ProjectMission
  };
  await browser.route("**/api/v1/auth/session", (route: any) => route.fulfill({ json: { data: { authenticated: state.authenticated, owner_id: state.authenticated ? state.owner : null } } }));
  await browser.route("**/api/v1/policies", (route: any) => route.fulfill({ json: { data: {} } }));
  await browser.route("**/api/v1/owner/project-missions**", async (route: any) => {
    const path = new URL(route.request.url).pathname.replace("/api/v1/owner/project-missions", "");
    if (route.request.method === "GET") return route.fulfill({ json: wire(path.endsWith("/conversations") ? { items: state.mission.contacts.slice(0, 1).map(contact => ({
      seller_agent_id: contact.seller_agent_id, thread_id: contact.thread_id, listing_ids: [state.candidates[0].listing_id],
      messages: [{ message_id: "ba800000-0000-4000-8000-000000000001", sender_type: "agent", sender_id: contact.seller_agent_id,
        type: "answer", payload: { text: "Je propose le bureau à 90 euros, sans frais de retrait." }, redacted: false, created_at: PROJECT_NOW },
        { message_id: "ba800000-0000-4000-8000-000000000002", sender_type: "SYSTEM", sender_id: null,
          type: "warning", payload: { text: "Les coordonnées personnelles ont été masquées." }, redacted: false, created_at: PROJECT_NOW }]
    })) } : path ? state.mission : { items: [state.mission] }) });
    const body = JSON.parse(route.request.postData || "{}");
    const action = path ? path.split("/").at(-1)! : "create";
    state.writes.push({ action, body, owner: route.request.headers["x-expected-owner-id"], key: route.request.headers["idempotency-key"] });
    if (action === "create") {
      state.mission.brief = body.brief;
      state.mission.plan = composeProjectPlan(body.brief, state.candidates);
      if (state.loseCreationResponse) { state.loseCreationResponse = false; return route.abort(); }
      return route.fulfill({ status: 201, json: wire(state.mission) });
    }
    if (action === "select") {
      state.mission = { ...state.mission, selected_configuration_id: body.configuration_id, status: "SELECTED", version: state.mission.version + 1 };
    } else if (action === "confirm") {
      state.mission = { ...state.mission, status: "CONFIRMED", confirmed_version: state.mission.version + 1, confirmed_at: PROJECT_NOW, version: state.mission.version + 1 };
    } else if (action === "recalculate") {
      state.mission = { ...state.mission, plan: composeProjectPlan(state.mission.brief, state.candidates), status: "DRAFT", selected_configuration_id: null, confirmed_version: null, confirmed_at: null, version: state.mission.version + 1 };
    } else if (action === "facts") {
      state.candidates = state.candidates.map(item => item.listing_id === body.listing_id ? { ...item, facts: body.facts } : item);
      state.mission = { ...state.mission, plan: composeProjectPlan(state.mission.brief, state.candidates), status: "DRAFT", selected_configuration_id: null, confirmed_version: null, confirmed_at: null, version: state.mission.version + 1 };
    } else if (action === "contact") {
      const selected = state.mission.plan.configurations.find(item => item.id === body.configuration_id)!;
      state.mission.contacts = selected.seller_groups.map((seller, index) => ({
        seller_agent_id: seller.seller_agent_id, version: state.mission.version,
        thread_id: `ba600000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        message_id: `ba700000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, sent_at: PROJECT_NOW
      }));
    }
    return route.fulfill({ json: wire(state.mission) });
  });
  return state;
}

test("project brief survives reload and an uncertain create retries the same owner and payload", async ({ app, browser, screen }) => {
  const api = await projectApi(browser);
  api.loseCreationResponse = true;
  await app.open("/fr/my/projects/new");
  await screen.getByRole("textbox", "Résultat recherché").fill(officeBrief.description);
  await screen.getByLabel("Retrait souhaité au plus tard").fill(PROJECT_DATE);
  await screen.getByRole("spinbutton", "Budget total, frais compris (€)").fill("500.25");
  await browser.reload();
  await expect(screen.getByRole("textbox", "Résultat recherché")).toHaveValue(officeBrief.description);
  await expect(screen.getByRole("spinbutton", "Budget total, frais compris (€)")).toHaveValue("500.25");
  await screen.getByRole("button", "Vérifier le projet").click();
  await screen.getByRole("button", "Composer mes configurations").click();
  await expect(screen.getByRole("alert").filter({ hasText: "serveur" })).toBeVisible();
  expect(api.writes).toHaveLength(1);
  expect(api.writes[0]).toMatchObject({ action: "create", owner: PROJECT_OWNER, body: { brief: { budget_cents: 50_025 } } });
  const original = structuredClone(api.writes[0]);
  api.owner = PROJECT_OTHER_OWNER;
  await screen.getByRole("button", "Composer mes configurations").click();
  await expect(screen.getByRole("alert").filter({ hasText: "compte" })).toBeVisible();
  expect(api.writes).toHaveLength(1);
  api.owner = PROJECT_OWNER;
  await browser.reload();
  await screen.getByRole("button", "Composer mes configurations").click();
  await expect(browser).toHaveURL(new RegExp(`/fr/my/projects/${PROJECT_ID}$`));
  expect(api.writes).toHaveLength(2);
  expect(api.writes[1]).toEqual(original);
  await expect(screen.getByText(officeBrief.description, { exact: true })).toBeVisible();
  await browser.reload();
  await expect(screen.getByTestId("project-configuration-economy")).toBeVisible();
  expect(api.writes.every(write => write.action === "create")).toBe(true);
  await app.screenshot("project-configurations-after-reload");
});

test("an anonymous project returns from sign-in with its private brief in the original tab", async ({ app, browser, screen }) => {
  const api = await projectApi(browser);
  api.authenticated = false;
  await app.open("/fr/my/projects/new");
  await screen.getByRole("textbox", "Résultat recherché").fill("Mon bureau avec un éclairage doux");
  await screen.getByLabel("Retrait souhaité au plus tard").fill(PROJECT_DATE);
  await screen.getByRole("checkbox", "Lampe").check();
  await screen.getByRole("button", "Continuer avec mon projet").click();
  await expect(screen.getByTestId("auth-login-page")).toBeVisible();
  await expect(browser).toHaveURL(/auth\/login\?next=%2Ffr%2Fmy%2Fprojects%2Fnew/);
  await screen.getByRole("link", "Revenir à mon brouillon").click();
  await expect(screen.getByRole("textbox", "Résultat recherché")).toHaveValue("Mon bureau avec un éclairage doux");
  await expect(screen.getByRole("checkbox", "Lampe")).toBeChecked();
  api.authenticated = true;
  await browser.reload();
  await expect(screen.getByRole("textbox", "Résultat recherché")).toHaveValue("Mon bureau avec un éclairage doux");
  await screen.getByRole("button", "Vérifier le projet").click();
  expect(api.writes).toHaveLength(0);
  await screen.getByRole("button", "Composer mes configurations").click();
  await expect(browser).toHaveURL(new RegExp(`/fr/my/projects/${PROJECT_ID}$`));
  expect(api.writes[0]).toMatchObject({ owner: PROJECT_OWNER, body: { brief: { optional_slots: ["lamp"] } } });
});

test("a seller reply can revise the project price without accepting an offer", async ({ app, browser, screen }) => {
  const api = await projectApi(browser, officeCatalogue().slice(0, 3));
  await app.open(`/fr/my/projects/${PROJECT_ID}`);
  await screen.getByTestId("project-configuration-economy").getByRole("button", "Choisir cette configuration").click();
  await screen.getByRole("button", "Vérifier les messages").click();
  await screen.getByRole("button", "Envoyer ces questions").click();
  const conversations = screen.getByTestId("project-conversations");
  await expect(conversations).toContainText("Je propose le bureau à 90 euros");
  await expect(conversations.getByRole("link", "Bureau compact 120 cm")).toBeVisible();
  await expect(conversations.getByRole("listitem").filter({ hasText: "Je propose le bureau à 90 euros" })).toContainText("Le vendeur");
  const systemMessage = conversations.getByRole("listitem").filter({ hasText: "Les coordonnées personnelles ont été masquées." });
  await expect(systemMessage).toContainText("Message système");
  await expect(systemMessage).not.toContainText("Le vendeur");
  await conversations.getByRole("button", "Actualiser les réponses").click();
  await expect(conversations).toContainText("Je propose le bureau à 90 euros");
  await app.screenshot("project-seller-reply-attribution");
  const desk = screen.getByTestId("project-configuration-economy").getByRole("listitem").filter({ hasText: "Bureau compact 120 cm" });
  await desk.getByText("Renseigner les vérifications", { exact: true }).click();
  await desk.getByRole("spinbutton", "Prix proposé par le vendeur (€)").fill("90");
  await desk.getByRole("checkbox", "Je confirme avoir vérifié ces informations. Elles seront présentées comme renseignées par moi.").check();
  await desk.getByRole("button", "Enregistrer et recalculer").click();
  await expect(screen.getByTestId("project-configuration-economy")).toContainText("240,00");
  await expect(screen.getByTestId("project-selected-basket")).not.toBeVisible();
  expect(api.writes.at(-1)).toMatchObject({ action: "facts", body: { facts: { quoted_price_cents: 9000, provenance: "user_confirmed" } } });
  expect(api.writes.some(write => write.action === "confirm")).toBe(false);
  await app.screenshot("project-negotiated-price");
});

test("an incompatible measurement stays editable so a mistake does not strand the project", async ({ app, browser, screen }) => {
  const api = await projectApi(browser, officeCatalogue().slice(0, 3));
  await app.open(`/fr/my/projects/${PROJECT_ID}`);
  const desk = screen.getByTestId("project-configuration-economy").getByRole("listitem").filter({ hasText: "Bureau compact 120 cm" });
  await desk.getByText("Renseigner les vérifications", { exact: true }).click();
  await desk.getByRole("spinbutton", "Largeur du bureau (cm)").fill("150");
  await desk.getByRole("checkbox", "Je confirme avoir vérifié ces informations. Elles seront présentées comme renseignées par moi.").check();
  await desk.getByRole("button", "Enregistrer et recalculer").click();
  await expect(screen.getByTestId("project-configuration-economy")).not.toBeVisible();
  const corrections = screen.getByTestId("project-corrections");
  await expect(corrections).toContainText("Bureau compact 120 cm");
  await corrections.getByText("Renseigner les vérifications", { exact: true }).click();
  await corrections.getByRole("spinbutton", "Largeur du bureau (cm)").fill("120");
  await corrections.getByRole("checkbox", "Je confirme avoir vérifié ces informations. Elles seront présentées comme renseignées par moi.").check();
  await corrections.getByRole("button", "Enregistrer et recalculer").click();
  await expect(screen.getByTestId("project-configuration-economy")).toBeVisible();
  await expect(corrections).not.toBeVisible();
  expect(api.writes.map(write => write.action)).toEqual(["facts", "facts"]);
});

test("a changed account cannot submit the private reviewed project", async ({ app, browser, screen }) => {
  const api = await projectApi(browser);
  await app.open("/fr/my/projects/new");
  await screen.getByRole("textbox", "Résultat recherché").fill("Mon bureau privé");
  await screen.getByLabel("Retrait souhaité au plus tard").fill(PROJECT_DATE);
  await screen.getByRole("button", "Vérifier le projet").click();
  api.owner = PROJECT_OTHER_OWNER;
  await screen.getByRole("button", "Composer mes configurations").click();
  await expect(screen.getByRole("alert").filter({ hasText: "compte" })).toBeVisible();
  expect(api.writes).toHaveLength(0);
});

test("unknown fees block approval while seller questions require their own explicit confirmation", async ({ app, browser, screen }) => {
  const candidates: ProjectCandidate[] = officeCatalogue().slice(0, 3).map(item => ({ ...item, facts: null }));
  const api = await projectApi(browser, candidates);
  await app.open(`/fr/my/projects/${PROJECT_ID}`);
  const economy = screen.getByTestId("project-configuration-economy");
  await expect(economy).toBeVisible();
  await economy.getByRole("button", "Choisir cette configuration").click();
  await expect(screen.getByRole("button", "Vérifier le panier")).toBeDisabled();
  expect(api.writes.map(write => write.action)).toEqual(["select"]);
  await screen.getByRole("button", "Vérifier les messages").click();
  await expect(screen.getByText(/sans offre d’achat ni réservation/).first()).toBeVisible();
  expect(api.writes.map(write => write.action)).toEqual(["select"]);
  await app.screenshot("project-seller-questions-review");
  await screen.getByRole("button", "Envoyer ces questions").click();
  await expect.poll(() => api.writes.filter(write => write.action === "contact").length).toBe(1);
  expect(api.writes.at(-1)).toMatchObject({ owner: PROJECT_OWNER, body: { expected_version: 2, confirmed_preview: true, configuration_id: api.mission.selected_configuration_id } });
  expect(api.mission.contacts).toHaveLength(3);
  expect(api.writes.some(write => write.action === "confirm")).toBe(false);
});

test("a disappeared item recalculates alternatives and the replacement requires a new basket approval", async ({ app, browser, screen }) => {
  const api = await projectApi(browser);
  await app.open(`/fr/my/projects/${PROJECT_ID}`);
  await screen.getByTestId("project-configuration-economy").getByRole("button", "Choisir cette configuration").click();
  await screen.getByRole("button", "Vérifier le panier").click();
  expect(api.writes.map(write => write.action)).toEqual(["select"]);
  await screen.getByTestId("project-action-review").getByRole("button", "Valider ce panier").click();
  await expect(screen.getByRole("button", "Panier validé")).toBeDisabled();
  expect(api.writes.filter(write => write.action === "confirm")).toHaveLength(1);
  api.candidates[0].status = "SOLD";
  await screen.getByRole("button", "Actualiser les configurations").click();
  await expect(screen.getByTestId("project-selected-basket")).not.toBeVisible();
  const economy = screen.getByTestId("project-configuration-economy");
  await expect(economy.getByRole("link", "Bureau réglable 130 cm")).toBeVisible();
  await expect(economy.getByRole("link", "Bureau compact 120 cm")).not.toBeVisible();
  await economy.getByRole("button", "Choisir cette configuration").click();
  await expect(screen.getByRole("button", "Vérifier le panier")).toBeEnabled();
  expect(api.writes.filter(write => write.action === "confirm")).toHaveLength(1);
  expect(api.writes.filter(write => write.action === "contact")).toHaveLength(0);
  await app.screenshot("project-replacement-requires-new-approval");
  api.candidates = officeCatalogue().slice(0, 3);
  api.candidates[0].facts!.delivery_fee_cents = 30_001;
  await screen.getByRole("button", "Actualiser les configurations").click();
  await expect(screen.getByRole("heading", "Pas encore d’ensemble compatible")).toBeVisible();
  await expect(screen.getByTestId("project-configuration-economy")).not.toBeVisible();
  await expect(screen.getByTestId("project-selected-basket")).not.toBeVisible();
});
