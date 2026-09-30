import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { createSupabaseAdmin } from "./helpers/supabase";
import { randomId } from "./helpers/ids";
import { generateOwnerSessionToken, hashOwnerSessionToken } from "../../src/server/utils/session-tokens";

assertIntegrationEnv();

const endpoint = "/api/v1/owner/notification-preferences";

test.describe("Notification settings with real owner sessions", () => {
  test.setTimeout(90000);
  let ownerId: string;
  let otherOwnerId: string;
  let sessionId: string;
  const supabase = createSupabaseAdmin();

  test.beforeEach(async ({ context, baseURL }) => {
    ownerId = randomId();
    otherOwnerId = randomId();
    const { error: ownerError } = await supabase.from("owners").insert([
      { owner_id: ownerId }, { owner_id: otherOwnerId }
    ]);
    if (ownerError) throw ownerError;

    const token = generateOwnerSessionToken();
    const { data, error } = await supabase.from("owner_sessions").insert({
      owner_id: ownerId,
      token_hash: hashOwnerSessionToken(token),
      status: "ACTIVE",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    }).select("session_id").single();
    if (error) throw error;
    sessionId = data.session_id;
    await context.addCookies([{
      name: "cd_owner_session", value: token,
      url: baseURL!, httpOnly: true, sameSite: "Lax"
    }]);
  });

  test.afterEach(async () => {
    if (!ownerId || !otherOwnerId) return;
    const { error } = await supabase.from("owners").delete().in("owner_id", [ownerId, otherOwnerId]);
    if (error) throw error;
    const { data, error: readError } = await supabase.from("owners").select("owner_id").in("owner_id", [ownerId, otherOwnerId]);
    if (readError) throw readError;
    expect(data).toEqual([]);
    await test.info().attach("fixture-cleanup", {
      body: JSON.stringify({ ownerIds: [ownerId, otherOwnerId], remainingOwners: data.length }),
      contentType: "application/json"
    });
  });

  test("reads defaults without writes and isolates the signed-in owner", async ({ context, request }) => {
    const anonymous = await request.get(endpoint);
    expect(anonymous.status()).toBe(401);
    const forgedOwner = await request.get(endpoint, { headers: { "x-owner-id": ownerId } });
    expect(forgedOwner.status()).toBe(401);

    const response = await context.request.get(`${endpoint}?owner_id=${otherOwnerId}`, {
      headers: { "x-owner-id": otherOwnerId }
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.json()).data.preferences).toMatchObject({
      mode: "DIGEST_HOURLY", timezone: "UTC", quiet_enabled: false,
      event_types: ["watchlist_match"], daily_digest_hour: 9
    });

    const { data, error } = await supabase.from("notification_preferences")
      .select("owner_id").in("owner_id", [ownerId, otherOwnerId]);
    if (error) throw error;
    expect(data).toEqual([]);

    const denied = await context.request.patch(endpoint, { data: { owner_id: otherOwnerId, mode: "SILENT" } });
    expect(denied.status()).toBe(400);
    const saved = await context.request.patch(endpoint, { data: { mode: "SILENT" } });
    expect(saved.status()).toBe(200);
    const { data: rows, error: readError } = await supabase.from("notification_preferences")
      .select("owner_id,mode").in("owner_id", [ownerId, otherOwnerId]);
    if (readError) throw readError;
    expect(rows).toEqual([{ owner_id: ownerId, mode: "SILENT" }]);
  });

  test("rejects invalid values before creating preferences", async ({ context }) => {
    for (const patch of [
      {}, [], { mode: "INVALID" }, { timezone: "Mars/Olympus" },
      { quiet_enabled: "false" }, { daily_digest_hour: 9.5 },
      { quiet_start_min: "1320" }, { event_types: ["unknown"] },
      { event_types: "watchlist_match" }, { channel_identity_id: randomId() },
      { quiet_enabled: true },
      { quiet_enabled: true, quiet_start_min: 480, quiet_end_min: 480 }
    ]) {
      const response = await context.request.patch(endpoint, { data: patch });
      expect(response.status(), JSON.stringify(patch)).toBe(400);
    }
    const { data, error } = await supabase.from("notification_preferences")
      .select("owner_id").eq("owner_id", ownerId);
    if (error) throw error;
    expect(data).toEqual([]);
  });

  test("merges concurrent first saves without replacing the other settings", async ({ context }) => {
    const responses = await Promise.all([
      context.request.patch(endpoint, { data: { mode: "REALTIME" } }),
      context.request.patch(endpoint, { data: { timezone: "Europe/London" } })
    ]);
    for (const response of responses) expect(response.status()).toBe(200);
    const { data, error } = await supabase.from("notification_preferences").select("*").eq("owner_id", ownerId).single();
    if (error) throw error;
    expect(data).toMatchObject({ mode: "REALTIME", timezone: "Europe/London" });
  });

  test("saves daily alerts, quiet hours and categories through the French browser UI", async ({ page, context }) => {
    await page.goto("/fr/my/watchlists");
    await page.getByRole("link", { name: "Régler mes notifications" }).click();
    await expect(page).toHaveURL(/\/fr\/settings\/notifications$/);
    await expect(page.getByRole("link", { name: "Notifications", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("radio", { name: /Une fois par jour/ }).check();
    await page.getByLabel("Heure du récapitulatif").selectOption("18");
    await page.getByLabel("Fuseau horaire").fill("Europe/Paris");
    await page.getByLabel("Activer les horaires de silence").check();
    await page.getByLabel("Début du silence").fill("22:00");
    await page.getByLabel("Fin du silence").fill("08:00");
    await page.getByRole("checkbox", { name: "Offres reçues", exact: true }).check();
    await page.getByRole("checkbox", { name: "Approbations demandées", exact: true }).check();
    await page.getByRole("button", { name: "Enregistrer les préférences" }).click();
    await expect(page.getByRole("status")).toHaveText("Préférences enregistrées.");

    const { data, error } = await supabase.from("notification_preferences").select("*").eq("owner_id", ownerId).single();
    if (error) throw error;
    expect(data).toMatchObject({
      mode: "DIGEST_DAILY", daily_digest_hour: 18, timezone: "Europe/Paris",
      quiet_enabled: true, quiet_start_min: 1320, quiet_end_min: 480,
      event_types: ["watchlist_match", "offer_received", "approval_required"]
    });
    await page.setViewportSize({ width: 1280, height: 1400 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await test.info().attach("notifications-desktop-fr", {
      body: await page.screenshot({ animations: "disabled" }), contentType: "image/png"
    });
    await page.reload();
    await expect(page.getByRole("radio", { name: /Une fois par jour/ })).toBeChecked();
    await expect(page.getByLabel("Heure du récapitulatif")).toHaveValue("18");
    await expect(page.getByLabel("Fuseau horaire")).toHaveValue("Europe/Paris");
    await expect(page.getByLabel("Activer les horaires de silence")).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Offres reçues", exact: true })).toBeChecked();

    await page.getByRole("radio", { name: /En pause/ }).check();
    await page.getByRole("button", { name: "Enregistrer les préférences" }).click();
    await expect(page.getByRole("status")).toHaveText("Préférences enregistrées.");
    const paused = await context.request.get(endpoint);
    expect((await paused.json()).data.preferences.mode).toBe("SILENT");

    // Also inspect the same controls at a phone width; labels remain usable.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Enregistrer les préférences" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/es/settings/notifications");
    await expect(page.getByRole("radio", { name: /En pausa/ })).toBeChecked();
    await test.info().attach("notifications-mobile-es", {
      body: await page.screenshot({ fullPage: true }), contentType: "image/png"
    });
  });

  test("keeps existing filters and later Telegram mode changes when saving another field", async ({ page }) => {
    const previousDigest = "2026-09-28T09:00:00.000Z";
    const { error: seedError } = await supabase.from("notification_preferences").insert({
      owner_id: ownerId, mode: "DIGEST_HOURLY", event_types: ["watchlist_match"],
      filters: { strong: { max_price_eur: 42 } }, last_hourly_digest_at: previousDigest
    });
    if (seedError) throw seedError;
    await page.goto("/settings/notifications");
    await expect(page.getByRole("radio", { name: /Every hour/ })).toBeChecked();
    const { error: changeError } = await supabase.from("notification_preferences")
      .update({ mode: "REALTIME" }).eq("owner_id", ownerId);
    if (changeError) throw changeError;
    await page.getByLabel("Time zone").fill("Europe/London");
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByRole("status")).toHaveText("Preferences saved.");
    await expect(page.getByRole("radio", { name: /As they happen/ })).toBeChecked();
    const { data, error } = await supabase.from("notification_preferences").select("*").eq("owner_id", ownerId).single();
    if (error) throw error;
    expect(data).toMatchObject({
      mode: "REALTIME", timezone: "Europe/London", filters: { strong: { max_price_eur: 42 } }
    });
    expect(Date.parse(data.last_hourly_digest_at)).toBe(Date.parse(previousDigest));
  });

  test("keeps the draft after a failed save and allows a real retry", async ({ page }) => {
    await page.goto("/settings/notifications");
    await page.getByRole("radio", { name: /As they happen/ }).check();
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "ERROR" } }) });
    }, { times: 1 });
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByTestId("notifications-page").getByRole("alert")).toHaveText("Could not save your preferences. Your changes are still here; try again.");
    await expect(page.getByRole("radio", { name: /As they happen/ })).toBeChecked();
    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.getByRole("status")).toHaveText("Preferences saved.");
    const { data, error } = await supabase.from("notification_preferences").select("mode").eq("owner_id", ownerId).single();
    if (error) throw error;
    expect(data.mode).toBe("REALTIME");
  });

  test("returns to login with the settings destination when the session is revoked", async ({ page, context }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const { error } = await supabase.from("owner_sessions").update({ status: "REVOKED" }).eq("session_id", sessionId);
    if (error) throw error;
    expect((await context.request.patch(endpoint, { data: { mode: "SILENT" } })).status()).toBe(401);
    await page.goto("/fr/settings/notifications");
    await expect(page).toHaveURL(/\/fr\/auth\/login\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/fr/settings/notifications");
    const { error: restoreError } = await supabase.from("owner_sessions").update({ status: "ACTIVE" }).eq("session_id", sessionId);
    if (restoreError) throw restoreError;
    await page.reload();
    await expect(page).toHaveURL(/\/fr\/settings\/notifications$/);
    await expect(page.getByRole("radio", { name: /Toutes les heures/ })).toBeChecked();
    expect(pageErrors).toEqual([]);
  });
});
