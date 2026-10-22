import { expect } from "e2e";
import { test } from "./fixtures";

const selectionKey = "clawdeals:smartphone-comparison:v1";

test("real comparison: select two, cap at three, remove and preserve selection across reload and locale", async ({ app, browser, screen, comparison: fixture }) => {
  const { budget, battery, condition, fourth } = fixture.entries;
  await app.open(`/fr/browse?q=${fixture.query}`);
  await screen.getByTestId(`comparison-toggle-${budget.id}`).tap();
  await expect(screen.getByTestId("comparison-open")).toBeDisabled();
  await screen.getByTestId(`comparison-toggle-${battery.id}`).tap();
  await expect(screen.getByTestId("comparison-open")).toHaveAttribute("href", new RegExp(`${budget.id}.*${battery.id}`));
  await screen.getByTestId(`comparison-toggle-${condition.id}`).tap();
  await expect(screen.getByTestId("comparison-limit")).toBeVisible();
  await expect(screen.getByTestId(`comparison-toggle-${fourth.id}`)).toBeDisabled();
  await expect(screen.getByTestId(/^comparison-selected-/)).toHaveCount(3);
  await app.screenshot("comparison-selection-tray");
  await screen.getByTestId(`comparison-remove-${condition.id}`).tap();
  await expect(screen.getByTestId(`comparison-toggle-${fourth.id}`)).toBeEnabled();
  await browser.reload();
  await expect(screen.getByTestId(/^comparison-selected-/)).toHaveCount(2);
  await screen.getByTestId("comparison-open").tap();
  await expect(screen.getByTestId(`comparison-item-${budget.id}`)).toBeVisible();
  await expect(screen.getByTestId(`comparison-item-${battery.id}`)).toBeVisible();
  const nav = screen.getByRole("navigation");
  if (await browser.evaluate(() => window.innerWidth < 640)) await screen.getByTestId("navbar-mobile-settings-toggle").tap();
  else await nav.getByRole("button", "FR").tap();
  await nav.getByRole("link", "EN").tap();
  await expect(browser).toHaveURL(new RegExp(`/browse/compare\\?ids=.*${budget.id}`));
  await expect(screen.getByTestId(`comparison-item-${battery.id}`)).toBeVisible();
  await screen.getByTestId(`comparison-item-remove-${battery.id}`).tap();
  await expect(browser).toHaveURL(new RegExp(`ids=${budget.id}(?:&|$)`));
  await expect.poll(() => browser.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null")?.items.map((item: { listing_id: string }) => item.listing_id), selectionKey)).toEqual([budget.id]);
  await expect(screen.getByTestId("comparison-empty")).toBeVisible();
});

test("real comparison: priority changes identify the lowest price, highest battery and fewest declared defects", async ({ app, browser, screen, comparison: fixture }) => {
  const response = await fixture.read("budget", "battery", "condition");
  expect(response.status).toBe(200);
  expect(response.body.data.items.map((item: { listing_id: string }) => item.listing_id)).toEqual([fixture.entries.budget.id, fixture.entries.battery.id, fixture.entries.condition.id]);
  expect(response.body.data.items[1].passport.battery_health_percent).toBe(97);
  await app.open(fixture.comparePath("budget", "battery", "condition"));
  for (const key of ["budget", "battery", "condition"] as const) {
    await screen.getByTestId(`comparison-priority-${key}`).tap();
    await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "ranked");
    await expect(screen.getByTestId(`comparison-winner-${fixture.entries[key].id}`)).toContainText(fixture.entries[key].title);
    await expect(screen.getByTestId(/^comparison-winner-/)).toHaveCount(1);
  }
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await app.screenshot("comparison-three-priorities");
  await expect(screen.getByTestId(`comparison-model-${fixture.entries.budget.id}`)).toHaveText(fixture.entries.budget.model);
  await screen.getByTestId(`comparison-item-${fixture.entries.budget.id}`).scrollIntoView();
  await app.screenshot("comparison-table-models");
  await screen.getByTestId(`comparison-check-${fixture.entries.budget.id}-screen`).scrollIntoView();
  await app.screenshot("comparison-declared-checks");
});

test("real comparison: equal facts keep both smartphones tied", async ({ app, screen, comparison: fixture }) => {
  await app.open(fixture.comparePath("budget", "tie"));
  for (const priority of ["budget", "battery", "condition"]) {
    await screen.getByTestId(`comparison-priority-${priority}`).tap();
    await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "tie");
    await expect(screen.getByTestId(/^comparison-winner-/)).toHaveCount(2);
  }
});

test("real comparison: unknown answers cannot win on battery or condition", async ({ app, screen, comparison: fixture }) => {
  for (const key of ["unknown", "without"] as const) {
    await app.open(fixture.comparePath("condition", key));
    await expect(screen.getByTestId(`comparison-winner-${fixture.entries[key].id}`)).toBeVisible();
    for (const priority of ["battery", "condition"]) {
      await screen.getByTestId(`comparison-priority-${priority}`).tap();
      await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "incomplete");
      await expect(screen.getByTestId(/^comparison-winner-/)).toHaveCount(0);
    }
    await expect(screen.getByTestId(`comparison-battery-${fixture.entries[key].id}`)).not.toContainText("0 %");
    await expect(screen.getByTestId(`comparison-issues-${fixture.entries[key].id}`)).not.toHaveText("0");
  }
});

test("real comparison: currencies are displayed without an invented conversion or winner", async ({ app, screen, comparison: fixture }) => {
  await app.open(fixture.comparePath("budget", "foreign"));
  await expect(screen.getByTestId(`comparison-price-${fixture.entries.foreign.id}`)).toContainText(/GBP|£/);
  for (const priority of ["budget", "battery", "condition"]) {
    await screen.getByTestId(`comparison-priority-${priority}`).tap();
    await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "different_currencies");
    await expect(screen.getByTestId(/^comparison-winner-/)).toHaveCount(0);
  }
});

test("real comparison: private, deleted and moderated listings disclose no listing or passport", async ({ app, screen, comparison: fixture }) => {
  await fixture.removeListing("fourth");
  const response = await fixture.read("private", "fourth", "hidden");
  expect(response.status).toBe(200);
  for (const item of response.body.data.items) expect(item).toMatchObject({ availability: "unavailable", listing: null, passport: null });
  const unsupported = await fixture.read("unsupported");
  expect(unsupported.body.data.items[0]).toMatchObject({ availability: "unsupported", listing: null, passport: null });
  await app.open(fixture.comparePath("private", "fourth", "hidden"));
  await expect(screen.getByTestId("comparison-result")).toHaveAttribute("data-status", "unavailable");
  for (const key of ["private", "fourth", "hidden"] as const) {
    await expect(screen.getByText(fixture.entries[key].title)).toHaveCount(0);
    await expect(screen.getByText(fixture.entries[key].model)).toHaveCount(0);
  }
});

test("real comparison: missing evidence produces copyable questions without claiming verification", async ({ app, browser, screen, comparison: fixture }) => {
  await app.open(fixture.comparePath("budget", "unknown"));
  const item = screen.getByTestId(`comparison-item-${fixture.entries.unknown.id}`);
  await expect(item).toBeVisible();
  await screen.getByTestId(`comparison-copy-questions-${fixture.entries.unknown.id}`).tap();
  const copied = await browser.evaluate("window.__comparisonCopiedText");
  expect(copied).toContain("batterie");
  expect(copied).toContain("caméras");
  await expect(screen.getByText("Vérifié", { exact: true })).toHaveCount(0);
  await app.screenshot("comparison-missing-information");
  await screen.getByTestId("comparison-priority-battery").tap();
  await screen.getByTestId("comparison-share").tap();
  const shared = new URL(await browser.evaluate("window.__comparisonCopiedText") as string);
  expect(shared.pathname).toBe("/fr/browse/compare");
  expect(shared.searchParams.get("ids")).toBe(`${fixture.entries.budget.id},${fixture.entries.unknown.id}`);
  expect(shared.searchParams.get("priority")).toBe("battery");
  expect([...shared.searchParams.keys()].sort()).toEqual(["ids", "priority"]);
});

test("real comparison: malformed or oversized URLs fetch no data and the API rejects more than three IDs", async ({ app, screen, comparison: fixture }) => {
  const oversized = fixture.comparePath("budget", "battery", "condition", "fourth");
  for (const path of ["/fr/browse/compare", "/fr/browse/compare?ids=not-a-uuid", oversized]) {
    await app.open(path);
    await expect(screen.getByTestId("comparison-empty")).toBeVisible();
  }
  expect(fixture.browserReads).toHaveLength(0);
  const response = await fixture.read("budget", "battery", "condition", "fourth");
  expect(response.status).toBe(400);
  expect(response.body.data).toBeUndefined();
});
