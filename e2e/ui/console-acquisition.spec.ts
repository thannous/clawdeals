import { expect, test } from "@playwright/test";

const MOCK_ACQUISITION = {
  window: {
    days: 30,
    from: "2026-07-11T00:00:00.000Z",
    to: "2026-08-10T00:00:00.000Z"
  },
  sample: { acquisitions: 4, truncated: false, max_rows: 10000 },
  funnel: [
    { step: "landing_view", count: 4, pct_of_landing: 100 },
    { step: "organic_entry", count: 3, pct_of_landing: 75 },
    { step: "connect_cta_clicked", count: 2, pct_of_landing: 50 },
    { step: "activation_started", count: 2, pct_of_landing: 50 },
    { step: "agent_connected", count: 2, pct_of_landing: 50 },
    { step: "watchlist_created", count: 1, pct_of_landing: 25 },
    { step: "first_match", count: 1, pct_of_landing: 25 },
    { step: "d7_retained", count: 0, pct_of_landing: 0 }
  ],
  by_market: [
    {
      market_code: "FR",
      landing_view: 4,
      organic_entry: 3,
      connect_cta_clicked: 2,
      activation_started: 2,
      agent_connected: 2,
      watchlist_created: 1,
      first_match: 1,
      d7_retained: 0
    }
  ],
  by_source: [{ source: "google.fr", landing_views: 3 }],
  by_channel: [
    {
      channel: "organic_search",
      source: "google.fr",
      medium: "organic",
      landing_views: 3,
      agent_connected: 2,
      first_match: 1
    }
  ],
  by_cta: [
    { cta_location: "mcp_activation", interaction_type: "primary_click", clicks: 1 },
    { cta_location: "mcp_activation", interaction_type: "auxclick", clicks: 1 }
  ],
  attribution: {
    id: "buyer_last_touch_v1",
    label: "Buyer last touch",
    rule: "Most recent attributed backend activation before escrow release",
    conversion_owner: "buyer_agent",
    revenue_event: "escrow status RELEASED",
    gross_value: "escrow amount_gross_minor",
    revenue: "escrow amount_platform_fee_minor"
  },
  revenue: {
    source_of_truth: "released escrows",
    sample: {
      released_escrows: 2,
      attributed_released_escrows: 1,
      unattributed_released_escrows: 1,
      truncated: false,
      max_rows: 10000
    },
    by_currency: [
      {
        currency: "EUR",
        released_escrows: 1,
        attributed_released_escrows: 1,
        gross_volume_minor: "10000",
        platform_revenue_minor: "400"
      },
      {
        currency: "GBP",
        released_escrows: 1,
        attributed_released_escrows: 0,
        gross_volume_minor: "5000",
        platform_revenue_minor: "200"
      }
    ],
    by_channel_currency: [
      {
        channel: "organic_search",
        source: "google.fr",
        medium: "organic",
        currency: "EUR",
        released_escrows: 1,
        gross_volume_minor: "10000",
        platform_revenue_minor: "400"
      },
      {
        channel: "unattributed",
        source: "(unattributed)",
        medium: "unknown",
        currency: "GBP",
        released_escrows: 1,
        gross_volume_minor: "5000",
        platform_revenue_minor: "200"
      }
    ]
  },
  reconciliation: {
    browser_events: { landing_views: 4, connect_cta_clicks: 2 },
    backend_activations: {
      activation_started: 2,
      agent_connected: 2,
      watchlist_created: 1,
      first_match: 1,
      d7_retained: 0
    },
    backend_revenue: {
      released_escrows: 2,
      attributed_released_escrows: 1,
      unattributed_released_escrows: 1
    }
  }
};

test("renders the attribution contract, auxclick split, and currency-safe revenue", async ({ page }) => {
  await page.route("**/api/console/acquisition?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(MOCK_ACQUISITION)
  }));

  await page.goto("/console/acquisition");

  await expect(page.getByText("Attribution contract — Buyer last touch")).toBeVisible();
  await expect(page.getByText(/Gross volume is not revenue/)).toBeVisible();
  await expect(page.getByText("auxclick", { exact: true })).toBeVisible();
  await expect(page.getByText("1/2 released escrows attributed; 1 unattributed.")).toBeVisible();

  const currencySection = page.getByRole("heading", { name: "Released escrow value by currency" }).locator("..");
  await expect(currencySection.getByRole("cell", { name: "EUR", exact: true })).toBeVisible();
  await expect(currencySection.getByRole("cell", { name: "GBP", exact: true })).toBeVisible();

  const reconciliation = page.getByRole("heading", { name: "Measurement reconciliation" }).locator("..");
  await expect(reconciliation.getByText("escrow_released + acq_id", { exact: true })).toBeVisible();
  await expect(reconciliation.getByText("buyer_last_touch_v1", { exact: true })).toBeVisible();
});
