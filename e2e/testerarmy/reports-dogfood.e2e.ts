import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

// Local, read-only client fixtures. No report action, moderation, message or
// backend mutation is executed; these cases qualify filtering and selection.
const reports = [
  { report_id: "11111111-1111-4111-8111-111111111111", status: "UNCONFIRMED", entity_type: "deal", reason_code: "spam" },
  { report_id: "22222222-2222-4222-8222-222222222222", status: "UNCONFIRMED", entity_type: "listing", reason_code: "scam" },
  { report_id: "33333333-3333-4333-8333-333333333333", status: "CONFIRMED", entity_type: "deal", reason_code: "spam" },
  { report_id: "44444444-4444-4444-8444-444444444444", status: "CONFIRMED", entity_type: "listing", reason_code: "scam" },
].map(report => ({
  ...report,
  entity_id: "55555555-5555-4555-8555-555555555555",
  reporter_owner_id: "66666666-6666-4666-8666-666666666666",
  report_weight: 1,
  created_at: "2026-10-15T10:00:00.000Z",
  resolved_by: null,
  resolved_at: null,
}));

beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", async route => {
    const url = new URL(route.request.url);
    if (url.origin !== origin || !["GET", "HEAD"].includes(route.request.method)) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await browser.route("**/api/console/reports?*", async route => {
    const params = new URL(route.request.url).searchParams;
    const status = params.get("status") || "UNCONFIRMED";
    const entity = params.get("entity_type");
    const reason = params.get("reason_code");
    const matching = reports.filter(report => report.status === status
      && (!entity || report.entity_type === entity)
      && (!reason || report.reason_code === reason));
    const paginate = status === "UNCONFIRMED" && !entity && !reason;
    const isNextPage = params.get("cursor") === "unconfirmed-page-2";
    await route.fulfill({ status: 200, json: {
      items: paginate ? matching.slice(isNextPage ? 1 : 0, isNextPage ? 2 : 1) : matching,
      next_cursor: paginate && !isNextPage ? "unconfirmed-page-2" : null,
    } });
  });
});

for (const activeFilter of ["status", "entity", "reason"] as const) {
  test(`reselecting the active report ${activeFilter} preserves rows, selection and pagination`, async ({ app, screen, browser }) => {
    await app.open("/console/reports");
    const rows = browser.locator("table tbody tr");
    await expect(rows).toHaveCount(1);
    await rows.nth(0).getByRole("checkbox").check();
    await expect(screen.getByText("1 report selected")).toBeVisible();

    const toolbar = screen.getByTestId("reports-toolbar");
    const activeButton = activeFilter === "status"
      ? toolbar.getByRole("button", "UNCONFIRMED")
      : toolbar.getByRole("button", "All").nth(activeFilter === "entity" ? 0 : 1);
    await activeButton.tap();
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0).getByRole("checkbox")).toBeChecked();
    await expect(screen.getByText("1 report selected")).toBeVisible();
    await expect(activeButton).toHaveAttribute("aria-pressed", "true");

    await screen.getByRole("button", "Load More").tap();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).getByRole("checkbox")).toBeChecked();
    await expect(rows.nth(1).getByRole("checkbox")).not.toBeChecked();
    await expect(rows.nth(1).getByRole("button", "22222222")).toBeVisible();
    await expect(screen.getByRole("button", "Load More")).toHaveCount(0);
    await app.screenshot(`reports-${activeFilter}-selection-preserved`);
  });
}

test("changing report filters refreshes rows and clears the previous selection and cursor", async ({ app, screen, browser }) => {
  await app.open("/console/reports");
  const rows = browser.locator("table tbody tr");
  await expect(rows).toHaveCount(1);
  await screen.getByRole("button", "Load More").tap();
  await expect(rows).toHaveCount(2);
  await browser.locator("table thead").getByRole("checkbox").check();
  await expect(screen.getByText("2 reports selected")).toBeVisible();

  const toolbar = screen.getByTestId("reports-toolbar");
  await toolbar.getByRole("button", "CONFIRMED").tap();
  await expect(browser).toHaveURL(/status=CONFIRMED/);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).getByRole("button", "33333333")).toBeVisible();
  await expect(rows.nth(0).getByRole("checkbox")).not.toBeChecked();
  await expect(screen.getByText("2 reports selected")).toHaveCount(0);
  await expect(screen.getByRole("button", "Load More")).toHaveCount(0);

  await rows.nth(0).getByRole("checkbox").check();
  await toolbar.getByRole("button", "listing").tap();
  await expect(browser).toHaveURL(/entity_type=listing/);
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByRole("button", "44444444")).toBeVisible();
  await expect(rows.nth(0).getByRole("checkbox")).not.toBeChecked();
  await expect(screen.getByText("1 report selected")).toHaveCount(0);

  await rows.nth(0).getByRole("checkbox").check();
  await toolbar.getByRole("button", "spam").tap();
  await expect(browser).toHaveURL(/reason_code=spam/);
  await expect(screen.getByText("No reports found")).toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(screen.getByText("1 report selected")).toHaveCount(0);
  await toolbar.getByRole("button", "All").nth(1).tap();
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0).getByRole("button", "44444444")).toBeVisible();
  await expect(rows.nth(0).getByRole("checkbox")).not.toBeChecked();
  await app.screenshot("reports-filters-changed-and-recovered");
});
