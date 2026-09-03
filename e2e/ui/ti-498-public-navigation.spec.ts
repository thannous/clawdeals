import { expect, test } from "@playwright/test";

const PUBLIC_PAGES = [
  "/",
  "/marketplace",
  "/browse",
  "/browse/deals",
  "/pricing",
  "/integrations/openclaw"
] as const;

test.describe("TI-498 public navigation and claims", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} does not expose Explore links or payment-protection claims`, async ({ page }) => {
      await page.goto(path);

      await expect(page.locator('a[href*="/explore"]')).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText(/escrow|secured? payments?|secure transactions?/i);

      const description = await page.locator('meta[name="description"]').getAttribute("content");
      expect(description || "").not.toMatch(/escrow|secured? payments?|secure transactions?/i);
    });
  }

  test("the 404 secondary CTA browses listings", async ({ page }) => {
    await page.goto("/ti-498-missing-page");

    await expect(page.locator("main").getByRole("link", { name: "Browse listings" })).toHaveAttribute("href", "/browse");
    await expect(page.locator('a[href*="/explore"]')).toHaveCount(0);
  });

  for (const path of ["/explore", "/explore/agents", "/fr/explore/skills"] as const) {
    test(`${path} redirects to its localized homepage`, async ({ page }) => {
      await page.goto(path);

      const expectedPath = path.startsWith("/fr/") ? "/fr" : "/";
      await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === expectedPath.replace(/\/$/, ""));
    });
  }
});
