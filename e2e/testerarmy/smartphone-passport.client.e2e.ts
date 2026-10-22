import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { installPassportClientFixture, passportListingId, passportPhotoId, passportUploadPhotoId, samplePassport } from "./smartphone-passport.client-fixture";

// All data writes in this file are explicit browser-route fixtures. Real API
// ownership, revision and database checks are qualified separately.
const ownerPath = `/fr/my/listings/${passportListingId}`;

test("passport client: seller creates, reloads and edits five smartphone checks", async ({ app, screen, browser }) => {
  const fixture = await installPassportClientFixture(browser, app.baseUrl!);
  await app.open(ownerPath);
  const editor = screen.getByTestId("smartphone-passport-editor");
  await expect(editor).toBeVisible();
  await screen.getByTestId("passport-enabled").check();
  await expect(screen.getByTestId(/^passport-check-/)).toHaveCount(5);
  await screen.getByTestId("passport-model").fill("iPhone 13");
  await screen.getByTestId("passport-battery-health").fill("89");
  await screen.getByTestId("passport-check-battery").selectOption({ value: "ok" });
  await screen.getByTestId("passport-notes-battery").fill("Capture des réglages du téléphone");
  await screen.getByTestId("passport-photo-battery").setInputFiles("public/favicon-192.png");
  await expect.poll(() => fixture.uploads.length).toBe(1);
  await screen.getByTestId("passport-check-screen").selectOption({ value: "ok" });
  await screen.getByTestId("passport-save").tap();
  await expect(screen.getByTestId("passport-save-status")).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0]).toMatchObject({ expected_revision: 0, model: "iPhone 13", battery_health_percent: 89,
    checks: { battery: { answer: "ok", photo_ids: [passportUploadPhotoId] }, screen: { answer: "ok" }, locks: { answer: "unknown" } } });
  expect(fixture.uploads[0]).toMatchObject({ check_id: "battery", content_type: "image/png" });
  expect(fixture.uploads[0].data_base64.length).toBeGreaterThan(0);
  await browser.reload();
  await expect(screen.getByTestId("passport-model")).toHaveValue("iPhone 13");
  await expect(screen.getByTestId("passport-battery-health")).toHaveValue("89");
  await expect(screen.getByTestId("passport-check-screen")).toHaveValue("ok");
  await screen.getByTestId("passport-model").fill("iPhone 13 · 128 Go");
  await screen.getByTestId("passport-save").tap();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes[1].expected_revision).toBe(1);
  await browser.reload();
  await expect(screen.getByTestId("passport-model")).toHaveValue("iPhone 13 · 128 Go");
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await app.screenshot("passport-owner-saved");
});

test("passport client: buyer sees evidence provenance and copies questions for missing information", async ({ app, screen, browser }) => {
  const fixture = await installPassportClientFixture(browser, app.baseUrl!, samplePassport());
  await app.open("/fr/browse");
  await screen.getByTestId("sort-price_asc").tap();
  await screen.getByTestId("browse-grid").getByText(fixture.listing.title).tap();
  await expect(browser).toHaveURL(`/fr/browse/${passportListingId}`);
  const passport = screen.getByTestId("smartphone-passport");
  await expect(passport).toBeVisible();
  await expect(passport).toContainText("iPhone 13");
  await expect(passport).toContainText("89");
  await expect(screen.getByTestId("passport-check-status-battery")).toHaveText("Documenté");
  await expect(screen.getByTestId("passport-check-status-screen")).toHaveText("Déclaré");
  await expect(screen.getByTestId("passport-check-status-functionality")).toHaveText("À renseigner");
  await expect(passport.getByText("Vérifié", { exact: true })).toHaveCount(0);
  await expect(passport).toContainText("Les caméras, l’audio, la charge et les connexions");
  await screen.getByTestId("passport-public-model").scrollIntoView();
  await app.screenshot("passport-buyer-overview");
  await screen.getByTestId("passport-copy-questions").tap();
  const copied = await browser.evaluate("window.__passportCopiedQuestions");
  expect(copied).toContain("Les caméras, l’audio, la charge et les connexions");
  expect(copied).not.toContain("Quelle est la santé de la batterie");
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await app.screenshot("passport-buyer-evidence-and-questions");
});

for (const failure of [
  { status: 500, code: "INTERNAL_ERROR", message: "Enregistrement indisponible" },
  { status: 409, code: "PASSPORT_REVISION_CONFLICT", message: "Le passeport a été modifié ailleurs" },
]) {
  test(`passport client: ${failure.status} save failure preserves the seller draft`, async ({ app, screen, browser }) => {
    const fixture = await installPassportClientFixture(browser, app.baseUrl!, samplePassport());
    await app.open(ownerPath);
    await screen.getByTestId("passport-model").fill("iPhone 13 · brouillon privé");
    await screen.getByTestId("passport-notes-functionality").fill("Microphone à contrôler avant la vente");
    fixture.failNextSave(failure);
    await screen.getByTestId("passport-save").tap();
    await expect(screen.getByTestId("smartphone-passport-editor").getByRole("alert")).toBeVisible();
    await expect(screen.getByTestId("passport-model")).toHaveValue("iPhone 13 · brouillon privé");
    await expect(screen.getByTestId("passport-notes-functionality")).toHaveValue("Microphone à contrôler avant la vente");
    expect(fixture.passport?.model).toBe("iPhone 13");
    expect(fixture.writes).toHaveLength(1);
    await app.screenshot(`passport-${failure.status}-draft-retained`);
    if (failure.status === 500) {
      await screen.getByTestId("passport-save").tap();
      await expect(screen.getByTestId("passport-save-status")).toBeVisible();
      await browser.reload();
      await expect(screen.getByTestId("passport-model")).toHaveValue("iPhone 13 · brouillon privé");
      expect(fixture.writes).toHaveLength(2);
    } else {
      await expect(screen.getByTestId("passport-save")).toBeDisabled();
      await screen.getByRole("button", "Recharger et remplacer ma saisie").tap();
      await expect(screen.getByTestId("passport-model")).toHaveValue("iPhone 13");
      await expect(screen.getByTestId("passport-save")).toBeEnabled();
      expect(fixture.writes).toHaveLength(1);
    }
  });
}

test("passport client: a listing without a smartphone passport has no buyer passport", async ({ app, screen, browser }) => {
  const fixture = await installPassportClientFixture(browser, app.baseUrl!);
  await app.open("/fr/browse");
  await screen.getByTestId("sort-price_asc").tap();
  await screen.getByTestId("browse-grid").getByText(fixture.listing.title).tap();
  await expect(screen.getByRole("heading", fixture.listing.title)).toBeVisible();
  await expect(screen.getByTestId("smartphone-passport")).toHaveCount(0);
});


test("passport client: an incomplete success response retains edits without claiming a save", async ({ app, screen, browser }) => {
  const fixture = await installPassportClientFixture(browser, app.baseUrl!, samplePassport());
  await app.open(ownerPath);
  await screen.getByTestId("passport-model").fill("iPhone 13 · saisie conservée");
  fixture.returnMalformedSave();
  await screen.getByTestId("passport-save").tap();
  await expect(screen.getByTestId("smartphone-passport-editor").getByRole("alert")).toBeVisible();
  await expect(screen.getByTestId("passport-model")).toHaveValue("iPhone 13 · saisie conservée");
  await expect(screen.getByTestId("passport-save-status")).toHaveCount(0);
  expect(fixture.writes).toHaveLength(1);
});

test("passport client: a reserved listing keeps the passport readable and blocks edits", async ({ app, screen, browser }) => {
  const fixture = await installPassportClientFixture(browser, app.baseUrl!, samplePassport());
  fixture.listing.status = "RESERVED";
  await app.open(ownerPath);
  await expect(screen.getByTestId("passport-model")).toHaveValue("iPhone 13");
  await expect(screen.getByTestId("passport-model")).toBeDisabled();
  await expect(screen.getByTestId("passport-read-only")).toBeVisible();
  await expect(screen.getByTestId("passport-photo-screen")).toHaveCount(0);
  await expect(screen.getByTestId("passport-save")).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
  expect(fixture.uploads).toHaveLength(0);
});


test("passport client: removing an unsaved uploaded photo releases it without saving a passport", async ({ app, screen, browser }) => {
  const fixture = await installPassportClientFixture(browser, app.baseUrl!);
  await app.open(ownerPath);
  await screen.getByTestId("passport-enabled").check();
  await screen.getByTestId("passport-photo-battery").setInputFiles("public/favicon-192.png");
  const remove = screen.getByTestId(`passport-remove-photo-battery-${passportUploadPhotoId}`);
  await expect(remove).toBeVisible();
  await remove.tap();
  await expect.poll(() => fixture.deletes).toEqual([passportUploadPhotoId]);
  await expect(remove).toHaveCount(0);
  expect(fixture.writes).toHaveLength(0);
  expect(fixture.operations).toEqual(["POST photo", `DELETE ${passportUploadPhotoId}`]);
});

test("passport client: saved photo removal waits for a saved detachment and retries cleanup separately", async ({ app, screen, browser }) => {
  const fixture = await installPassportClientFixture(browser, app.baseUrl!, samplePassport());
  await app.open(ownerPath);
  const remove = screen.getByTestId(`passport-remove-photo-battery-${passportPhotoId}`);
  await remove.tap();
  await expect(remove).toHaveCount(0);
  expect(fixture.deletes).toHaveLength(0);
  fixture.failNextPhotoDelete();
  await screen.getByTestId("passport-save").tap();
  await expect(screen.getByTestId("passport-save-status")).toBeVisible();
  await expect(screen.getByTestId("passport-retry-photo-cleanup")).toBeVisible();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].checks.battery.photo_ids).toEqual([]);
  expect(fixture.operations).toEqual(["PUT", `DELETE ${passportPhotoId}`]);
  await screen.getByTestId("passport-retry-photo-cleanup").tap();
  await expect(screen.getByTestId("passport-retry-photo-cleanup")).toHaveCount(0);
  expect(fixture.operations).toEqual(["PUT", `DELETE ${passportPhotoId}`, `DELETE ${passportPhotoId}`]);
  expect(fixture.writes).toHaveLength(1);
  await browser.reload();
  await expect(screen.getByTestId("passport-model")).toHaveValue("iPhone 13");
  await expect(remove).toHaveCount(0);
});
