import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Existing public-listing client seam, used only locally. Production selection
// keeps its real GET/HEAD network and never installs this empty-catalog fixture.
for (const locale of ["en", "fr"] as const) {
  const prefix = locale === "fr" ? "/fr" : "";
  test(`public ${locale} empty catalog opens real Browse and returns without a retired demo`, async ({
    app,
    screen,
    browser,
  }) => {
    const origin = new URL(app.baseUrl!).origin;
    await browser.route("**/*", async (route) => {
      if (
        new URL(route.request.url).origin !== origin ||
        !["GET", "HEAD"].includes(route.request.method)
      )
        await route.abort();
      else await route.continue();
    });
    await browser.route("**/api/v1/public/listings?*", async (route) => {
      if (
        new URL(route.request.url).origin !== origin ||
        route.request.method !== "GET"
      )
        await route.abort();
      else
        await route.fulfill({
          status: 200,
          json: { data: [], next_cursor: null },
        });
    });
    await app.open(`${prefix}/webmcp-challenge`);
    await expect(screen.getByTestId("webmcp-challenge-page")).toBeVisible();
    const notice = screen.getByTestId("catalog-availability-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      locale === "fr"
        ? "Cet hôte ne contient actuellement aucune annonce publique."
        : "This host has no public listings right now.",
    );
    await expect(notice).toContainText(
      locale === "fr"
        ? "Parcours la marketplace publique sans connecter d'agent."
        : "Browse the public marketplace without connecting an agent.",
    );
    const browse = notice.getByTestId("catalog-browse-link");
    await expect(browse).toHaveAttribute("href", `${prefix}/browse`);
    await expect(
      browser.locator('a[href*="sandbox.clawdeals.com"]'),
    ).toHaveCount(0);
    await browse.click();
    await expect(browser).toHaveURL(`${prefix}/browse`);
    await expect(screen.getByTestId("browse-toolbar")).toBeVisible();
    await expect(screen.getByTestId("browse-empty")).toBeVisible();
    await expect(
      screen.getByTestId("browse-grid").getByRole("article"),
    ).toHaveCount(0);
    await app.back();
    await expect(browser).toHaveURL(`${prefix}/webmcp-challenge`);
    await expect(notice).toBeVisible();

    await app.open(prefix || "/");
    await expect(screen.getByTestId("hero-section")).toBeVisible();
    await expect(screen.getByTestId("hero-browse-cta")).toHaveAttribute(
      "href",
      `${prefix}/browse`,
    );
    await expect(screen.getByTestId("hero-demo-link")).toHaveCount(0);
    await expect(
      browser.locator('a[href*="sandbox.clawdeals.com"]'),
    ).toHaveCount(0);
    await app.open(`${prefix}/start`);
    await expect(screen.getByTestId("connect-method-mcp")).toBeSelected();
    await expect(screen.getByTestId("connect-try-without-agent")).toHaveCount(
      0,
    );
    await expect(
      browser.locator('a[href*="sandbox.clawdeals.com"]'),
    ).toHaveCount(0);
    await app.screenshot(`public-${locale}-retired-demo-removed`);
  });
}
