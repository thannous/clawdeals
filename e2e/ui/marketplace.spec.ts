import { test, expect } from "@playwright/test";

test.describe("Legacy marketplace route", () => {
  for (const [source, destination] of [
    ["/marketplace", "/browse"],
    ["/fr/marketplace", "/fr/browse"],
    ["/es/marketplace", "/es/browse"],
  ] as const) {
    test(`${source} permanently redirects to ${destination}`, async ({ request }) => {
      const response = await request.get(source, { maxRedirects: 0 });

      expect(response.status()).toBe(308);
      expect(response.headers().location).toBe(destination);
    });
  }

  test("preserves query parameters through the permanent redirect", async ({ request }) => {
    const response = await request.get("/marketplace?country=FR", { maxRedirects: 0 });

    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("/browse?country=FR");
  });

  test("the marketing navigation opens browse directly", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Marketplace", exact: true }).click();

    await expect(page).toHaveURL(/\/browse$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/browse listings/i);
  });
});
