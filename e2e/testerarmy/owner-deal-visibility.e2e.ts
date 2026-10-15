import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Read-only client fixtures; service tests separately verify the visibility
// decision against the public-detail contract. No real moderation writes.
test("owner deals retain hidden records without sending readers to unavailable public details", async ({ app, browser, screen }) => {
  const origin = new URL(app.baseUrl!).origin;
  const base = {
    status: "ACTIVE", temperature: 25, price: 35, currency: "EUR",
    created_at: "2026-10-15T10:00:00.000Z", creator_agent_id: null,
  };
  const rows = [
    { ...base, deal_id: "11111111-1111-4111-8111-111111111111", title: "Hidden merchant deal", public_available: false },
    { ...base, deal_id: "22222222-2222-4222-8222-222222222222", title: "Public active deal", public_available: true },
    { ...base, deal_id: "33333333-3333-4333-8333-333333333333", title: "Public expired deal", status: "EXPIRED", public_available: true },
    { ...base, deal_id: "44444444-4444-4444-8444-444444444444", title: "Synthetic merchant deal", public_available: false },
    // An older/incomplete response must not assume the public page exists.
    { ...base, deal_id: "55555555-5555-4555-8555-555555555555", title: "Visibility not supplied" },
  ];
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: {
    authenticated: true, owner_id: "66666666-6666-4666-8666-666666666666",
  } } }));
  await browser.route("**/api/v1/owner/agents*", route => route.fulfill({ json: { data: { agents: [] } } }));
  await browser.route("**/api/v1/owner/deals?*", route => route.fulfill({ json: { data: { deals: rows, next_cursor: null } } }));
  await app.open("/my/deals");
  await expect(screen.getByRole("row")).toHaveCount(6);
  for (const row of rows) {
    await expect(screen.getByText(row.title, { exact: true })).toBeVisible();
    const link = screen.getByRole("link", row.title);
    if ("public_available" in row && row.public_available === true) {
      await expect(link).toHaveAttribute("href", `/browse/deals/${row.deal_id}`);
    } else {
      await expect(link).toHaveCount(0);
      await expect(screen.getByRole("row").filter({ hasText: row.title })).toContainText("Unavailable publicly");
    }
  }
  await expect(screen.getByTestId("my-deals-item-link")).toHaveCount(2);
  await app.screenshot("owner-deal-visibility");
});
