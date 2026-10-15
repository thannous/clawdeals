import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const ownerId = "11111111-1111-4111-a111-111111111111";
const owner = {
  owner_id: ownerId, email_verified_at: "2026-10-01T10:00:00Z",
  display_name: "Dogfood Owner", bio: "", avatar_url: "/avatars/default-1.svg",
  city: "Paris", state_region: "", country: "FR", show_email: false, available: true
};

// Synthetic API seams qualify client recovery and accessibility; they never
// send auth emails or change an actual account or connected application's access.
test("login submits with Enter and rejects malformed email before authentication", async ({ app, screen, browser }) => {
  const attempts: unknown[] = [];
  await browser.route("**/auth/v1/token**", async route => {
    attempts.push(JSON.parse(route.request.postData || "{}"));
    await route.fulfill({ status: 400, json: { code: "invalid_credentials", msg: "Invalid login credentials" } });
  });
  await app.open("/fr/auth/login");
  await screen.getByTestId("auth-login-email").fill("missing-at-sign");
  await screen.getByTestId("auth-login-password").fill("Synthetic-password-42!");
  await screen.getByTestId("auth-login-submit").tap();
  expect(await browser.evaluate(() => (document.getElementById("auth-email") as HTMLInputElement).validity.typeMismatch)).toBe(true);
  expect(attempts).toHaveLength(0);
  await screen.getByTestId("auth-login-email").fill("synthetic-owner@example.com");
  await screen.getByTestId("auth-login-password").press("Enter");
  await expect.poll(() => attempts.length).toBe(1);
  await expect(screen.getByTestId("auth-login-error")).toBeVisible();
  await screen.getByRole("button", "Créer un compte").tap();
  await expect(screen.getByTestId("auth-login-error")).toHaveCount(0);
});

test("an expired French password reset link offers recovery without an unusable form", async ({ app, screen, browser }) => {
  await app.open("/fr/auth/reset?error=access_denied&error_description=Email+link+is+invalid+or+has+expired&next=%2Ffr%2Fmy%2Fmissions%2Fnew");
  await expect(screen.getByTestId("auth-reset-error")).toBeVisible();
  await expect(screen.getByTestId("auth-reset-password")).toHaveCount(0);
  await expect(screen.getByRole("heading", /Réinitialiser/)).toBeVisible();
  await screen.getByRole("link", /Demander un nouveau lien/).tap();
  await expect(browser).toHaveURL(/\/fr\/auth\/login\?next=%2Ffr%2Fmy%2Fmissions%2Fnew/);
  await expect(screen.getByTestId("auth-login-forgot")).toBeVisible();
});

test("a profile loading failure can be retried and labeled fields can be saved", async ({ app, screen, browser }) => {
  let shouldFail = true;
  let saved: Record<string, unknown> | null = null;
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ status: 200, json: { data: { authenticated: true, owner_id: ownerId } } }));
  await browser.route("**/api/v1/owner/", async route => {
    if (route.request.method === "PATCH") {
      saved = JSON.parse(route.request.postData || "{}");
      await route.fulfill({ status: 200, json: { data: { ...owner, ...saved } } });
      return;
    }
    await route.fulfill(shouldFail ? { status: 503, json: { error: { message: "Temporary fixture failure" } } } : { status: 200, json: { data: owner } });
  });
  await app.open("/fr/settings/profile");
  await expect(screen.getByText("Impossible de charger le profil")).toBeVisible();
  shouldFail = false;
  await screen.getByRole("button", "Réessayer").tap();
  await screen.getByLabel("nom d'affichage").fill("Profil corrigé");
  await screen.getByLabel("ville", { exact: true }).fill("Lyon");
  await screen.getByRole("switch", "afficher l'email").tap();
  await screen.getByRole("button", /enregistrer le profil/i).tap();
  await expect.poll(() => saved).toMatchObject({ display_name: "Profil corrigé", city: "Lyon", show_email: true });
  await expect(screen.getByText("Profil enregistré")).toBeVisible();
  await app.screenshot("profile-recovered-and-saved");
});

for (const section of ["profile", "account", "identities", "connected-apps", "policy", "notifications"]) {
  test(`French ${section} settings keep the destination language through sign in`, async ({ app, browser }) => {
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ status: 200, json: { data: { authenticated: false } } }));
    await browser.route("**/api/v1/auth/me", route => route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }));
    await browser.route("**/api/v1/owner/**", route => route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }));
    await app.open(`/fr/settings/${section}`);
    await expect(browser).toHaveURL(new RegExp(`/fr/auth/login\\?next=%2Ffr%2Fsettings%2F${section}`));
  });
}

for (const [next, destination] of [
  ["/fr/my/missions/new?query=velo&price_max=83.25", "/fr/my/missions/new?query=velo&price_max=83.25"],
  ["https://outside.example/my/missions", "/settings/account"]
]) {
  test(`legacy email sign in keeps only a safe return destination: ${destination}`, async ({ app, screen, browser }) => {
    await browser.route("**/api/v1/auth/login:start", route => route.fulfill({ status: 201, json: { data: {
      owner_id: ownerId, session_id: "synthetic-session", session_token: "synthetic-token"
    } } }));
    await app.open(`/auth/login-legacy?next=${encodeURIComponent(next)}`);
    await screen.getByTestId("auth-login-email").fill("synthetic-owner@example.com");
    await screen.getByTestId("auth-login-submit").tap();
    await expect(screen.getByTestId("auth-login-verify-link")).toHaveAttribute("href",
      `/auth/verify?session_id=synthetic-session&token=synthetic-token&next=${encodeURIComponent(destination)}`);
    expect(await browser.evaluate(() => sessionStorage.getItem("clawdeals.auth_next"))).toBe(destination);
  });
}
