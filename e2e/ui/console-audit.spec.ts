import { test, expect, type Page } from "@playwright/test";
import { waitForApiGet } from "./helpers/api";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_AUDIT_LOGS = [
  {
    audit_id: "aud-1111-2222-3333-444444444444",
    ts: new Date(Date.now() - 3600000).toISOString(),
    actor: { type: "agent", id: "aaaa-1111-2222-3333-444444444444" },
    action: "listing.create",
    entity: { type: "listing", id: "llll-1111-2222-3333-444444444444" },
    outcome: "SUCCESS",
    metadata: { hash: "sha256:abc123", redacted: false },
    request_id: "req-1111",
  },
  {
    audit_id: "aud-2222-3333-4444-555555555555",
    ts: new Date(Date.now() - 7200000).toISOString(),
    actor: { type: "human", id: "hhhh-1111-2222-3333-444444444444" },
    action: "approval.approved",
    entity: { type: "approval", id: "appr-1111-2222-3333-444444444444" },
    outcome: "SUCCESS",
    metadata: { hash: "sha256:def456", redacted: false },
    request_id: "req-2222",
  },
  {
    audit_id: "aud-3333-4444-5555-666666666666",
    ts: new Date(Date.now() - 10800000).toISOString(),
    actor: { type: "system", id: "system" },
    action: "offer.create",
    entity: { type: "offer", id: "offr-1111-2222-3333-444444444444" },
    outcome: "FAILURE",
    metadata: { hash: "sha256:ghi789", redacted: true },
    request_id: "req-3333",
  },
];

const MOCK_CURSOR = "eyJhdWRpdF9pZCI6ImF1ZC0yMjIyIn0=";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockAuditApi(
  page: Page,
  { items = MOCK_AUDIT_LOGS, next_cursor = null as string | null, status = 200, delay = 0, error = null as string | null } = {}
) {
  return page.route("**/api/console/audit?*", async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (error) {
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "ERROR", message: error } }),
      });
    }
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ items, next_cursor }),
    });
  });
}

function mockAuditExportApi(page: Page, { status = 200, error = null as string | null } = {}) {
  return page.route("**/api/console/audit/export*", async (route) => {
    if (error) {
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "ERROR", message: error } }),
      });
    }
    route.fulfill({
      status,
      contentType: "text/csv",
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="audit-export-2026-02-08.csv"',
      },
      body: "audit_id,timestamp,actor_type,actor_id,action,entity_type,entity_id,outcome,metadata_hash,request_id\naud-1111,2026-02-08T10:00:00Z,agent,aaaa-1111,listing.create,listing,llll-1111,SUCCESS,sha256:abc123,req-1111\n",
    });
  });
}

// ---------------------------------------------------------------------------
// Tests — US-5: Parcours Audit (TI-251 / TI-209)
// ---------------------------------------------------------------------------

test.describe("Console Audit — US-5/US-6", () => {
  // -----------------------------------------------------------------------
  // List view
  // -----------------------------------------------------------------------
  test.describe("List view", () => {
    test("renders audit logs table", async ({ page }) => {
      await mockAuditApi(page);
      await page.goto("/console/audit");

      await expect(page.getByTestId("audit-page")).toBeVisible();
      const rows = page.locator("table tbody tr");
      await expect(rows).toHaveCount(3);
    });

    test("from and to date fields are pre-filled", async ({ page }) => {
      await mockAuditApi(page);
      await page.goto("/console/audit");

      await expect(page.getByTestId("audit-page")).toBeVisible();
      const fromInput = page.getByTestId("audit-from");
      const toInput = page.getByTestId("audit-to");
      await expect(fromInput).toBeVisible();
      await expect(toInput).toBeVisible();

      // Inputs should have values (pre-filled with default range)
      const fromValue = await fromInput.inputValue();
      const toValue = await toInput.inputValue();
      expect(fromValue).toBeTruthy();
      expect(toValue).toBeTruthy();
    });

    test("shows empty state when no audit logs", async ({ page }) => {
      await mockAuditApi(page, { items: [] });
      await page.goto("/console/audit");

      await expect(page.getByText("No audit entries found")).toBeVisible();
    });

    test("shows error state on API failure", async ({ page }) => {
      await mockAuditApi(page, { status: 500, error: "Server error" });
      await page.goto("/console/audit");

      await expect(page.getByText("Server error")).toBeVisible();
      await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
    });

    test("shows loading skeleton while fetching", async ({ page }) => {
      await mockAuditApi(page, { delay: 3000 });
      await page.goto("/console/audit");

      await expect(page.locator(".animate-pulse")).toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // Filters
  // -----------------------------------------------------------------------
  test.describe("Filters", () => {
    test("filters by actor type agent", async ({ page }) => {
      await mockAuditApi(page);

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      const toolbar = page.getByTestId("audit-toolbar");
      const actorRow = toolbar.locator("div").filter({ hasText: "Actor:" }).first();
      const filteredReq = waitForApiGet(page, "/api/console/audit", { actor_type: "agent" });
      await actorRow.getByRole("button", { name: /^agent$/ }).click();
      await filteredReq;
    });

    test("filters by action name listing.create", async ({ page }) => {
      await mockAuditApi(page);

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      const filteredReq = waitForApiGet(page, "/api/console/audit", { action_name: "listing.create" });
      await page.getByTestId("audit-toolbar").getByRole("button", { name: "listing.create" }).click();
      await filteredReq;
    });

    test("filters by entity type listing", async ({ page }) => {
      await mockAuditApi(page);

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      const filteredReq = waitForApiGet(page, "/api/console/audit", { entity_type: "listing" });
      await page.getByTestId("audit-toolbar").getByRole("button", { name: /^listing$/ }).click();
      await filteredReq;
    });

    test("filters by actor ID", async ({ page }) => {
      await mockAuditApi(page);

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      const actorId = "aaaa-1111-2222-3333-444444444444";
      const filteredReq = waitForApiGet(page, "/api/console/audit", { actor_id: actorId });
      await page.getByTestId("audit-actor-id").fill(actorId);
      await filteredReq;
    });

    test("filters by entity ID", async ({ page }) => {
      await mockAuditApi(page);

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      const entityId = "llll-1111-2222-3333-444444444444";
      const filteredReq = waitForApiGet(page, "/api/console/audit", { entity_id: entityId });
      await page.getByTestId("audit-entity-id").fill(entityId);
      await filteredReq;
    });

    test("filters by outcome SUCCESS", async ({ page }) => {
      await mockAuditApi(page);

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      const filteredReq = waitForApiGet(page, "/api/console/audit", { outcome: "SUCCESS" });
      await page.getByTestId("audit-toolbar").getByRole("button", { name: "SUCCESS" }).click();
      await filteredReq;
    });
  });

  // -----------------------------------------------------------------------
  // Pagination
  // -----------------------------------------------------------------------
  test.describe("Pagination", () => {
    test("shows Load More when next_cursor exists", async ({ page }) => {
      await mockAuditApi(page, { next_cursor: MOCK_CURSOR });
      await page.goto("/console/audit");

      await expect(page.getByRole("button", { name: /load more/i })).toBeVisible();
    });

    test("appends results on Load More click", async ({ page }) => {
      let callCount = 0;
      await page.route("**/api/console/audit?*", (route) => {
        callCount++;
        if (callCount === 1) {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ items: MOCK_AUDIT_LOGS.slice(0, 2), next_cursor: MOCK_CURSOR }),
          });
          return;
        }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MOCK_AUDIT_LOGS.slice(2), next_cursor: null }),
        });
      });

      await page.goto("/console/audit");
      await expect(page.locator("table tbody tr")).toHaveCount(2);

      const loadMoreReq = waitForApiGet(page, "/api/console/audit", { cursor: MOCK_CURSOR });
      await page.getByRole("button", { name: /load more/i }).click();
      await loadMoreReq;

      await expect(page.locator("table tbody tr")).toHaveCount(3);
    });
  });

  // -----------------------------------------------------------------------
  // Detail modal
  // -----------------------------------------------------------------------
  test.describe("Detail modal", () => {
    test("clicking audit row opens detail modal", async ({ page }) => {
      await mockAuditApi(page);
      await page.goto("/console/audit");

      await expect(page.getByTestId("audit-page")).toBeVisible();

      // Click first row
      await page.locator("table tbody tr").first().click();

      // Modal appears
      const dialog = page.getByRole("dialog", { name: /audit entry/i });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("listing.create")).toBeVisible();
      await expect(dialog.getByText("Metadata Hash")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    });

    test("modal closes on Close button", async ({ page }) => {
      await mockAuditApi(page);
      await page.goto("/console/audit");
      await page.locator("table tbody tr").first().click();

      await expect(page.getByText("Audit Entry")).toBeVisible();

      await page.getByRole("dialog", { name: /audit entry/i }).getByRole("button", { name: "Close", exact: true }).click();

      await expect(page.getByText("Audit Entry")).not.toBeVisible();
    });

    test("modal closes on Escape key", async ({ page }) => {
      await mockAuditApi(page);
      await page.goto("/console/audit");
      await page.locator("table tbody tr").first().click();

      await expect(page.getByText("Audit Entry")).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(page.getByText("Audit Entry")).not.toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // Time range validation
  // -----------------------------------------------------------------------
  test.describe("Time range validation", () => {
    test("shows error when time range exceeds 7 days", async ({ page }) => {
      await mockAuditApi(page);
      await page.goto("/console/audit");

      await expect(page.getByTestId("audit-page")).toBeVisible();

      // Set from to 10 days ago
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
      const fromStr = tenDaysAgo.toISOString().slice(0, 16);
      const fromInput = page.getByTestId("audit-from");
      await fromInput.fill(fromStr);
      await fromInput.press("Tab");

      // Error message should appear
      await expect(page.getByText(/time range/i)).toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // Export CSV — US-6
  // -----------------------------------------------------------------------
  test.describe("Export CSV", () => {
    test("Export CSV button is visible", async ({ page }) => {
      await mockAuditApi(page);
      await page.goto("/console/audit");

      await expect(page.getByTestId("audit-export-csv")).toBeVisible();
    });

    test("clicking Export CSV triggers API call", async ({ page }) => {
      await mockAuditApi(page);
      await mockAuditExportApi(page);

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      const exportReq = waitForApiGet(page, "/api/console/audit/export", { format: "csv" });
      await page.getByTestId("audit-export-csv").click();
      await exportReq;
    });
  });
});
