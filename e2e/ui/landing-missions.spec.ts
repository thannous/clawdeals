import { test, expect } from "@playwright/test";

test.describe("Landing Mission Select", () => {
  test("switches active mission and updates mission context", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Mission Select/i })).toBeVisible();

    const missionTabs = page.getByRole("tablist", { name: "Mission selection" });
    await missionTabs.scrollIntoViewIfNeeded();

    const marketWatchTab = missionTabs.getByRole("tab", { name: /MARKET_WATCH/i });
    const adminCoreTab = missionTabs.getByRole("tab", { name: /ADMIN_CORE/i });
    const activeSummary = page.getByText("Monitoring active for the selected market and currency.");

    await expect(marketWatchTab).toHaveAttribute("aria-selected", "true");
    await expect(activeSummary).toBeVisible();

    await adminCoreTab.click();

    await expect(adminCoreTab).toHaveAttribute("aria-selected", "true");
    await expect(marketWatchTab).toHaveAttribute("aria-selected", "false");
    await expect(page.getByText("Listing created: MacBook Pro M3 14\"")).toBeVisible();
  });
});
