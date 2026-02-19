import { test, expect, type Page } from "@playwright/test";
import { waitForApiGet, waitForApiPostJson } from "./helpers/api";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const APPROVAL_ID = "appr-1111-2222-3333-444444444444";
const AGENT_ID = "aaaa-1111-2222-3333-444444444444";
const OWNER_ID = "oooo-1111-2222-3333-444444444444";

const MOCK_APPROVALS = [
  {
    approval_id: APPROVAL_ID,
    action_type: "listing_publish",
    state: "PENDING",
    created_by_agent_id: AGENT_ID,
    owner_id: OWNER_ID,
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by_human_id: null,
    action_payload_redacted: {
      listing_id: "llll-1111-2222-3333-444444444444",
      title: "Test Listing for Approval",
      description: "A listing description with https://example.com link",
      category: "electronics",
      condition: "NEW",
      price_amount: 49.99,
      currency: "EUR",
    },
  },
  {
    approval_id: "appr-2222-3333-4444-555555555555",
    action_type: "offer_over_budget",
    state: "PENDING",
    created_by_agent_id: "bbbb-1111-2222-3333-444444444444",
    owner_id: OWNER_ID,
    created_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by_human_id: null,
    action_payload_redacted: {
      offer_id: "offr-1111",
      amount: 500,
      currency: "EUR",
      listing_id: "llll-2222",
      thread_id: "tttt-2222",
      policy_max_offer: 200,
    },
  },
  {
    approval_id: "appr-3333-4444-5555-666666666666",
    action_type: "listing_publish",
    state: "APPROVED",
    created_by_agent_id: AGENT_ID,
    owner_id: OWNER_ID,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    resolved_at: new Date().toISOString(),
    resolved_by_human_id: "hhhh-1111",
    action_payload_redacted: {},
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApprovalsApi(
  page: Page,
  { items = MOCK_APPROVALS, next_cursor = null as string | null, status = 200, error = null as string | null } = {}
) {
  return page.route("**/api/console/approvals?*", async (route) => {
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

function mockApprovalDetailApi(page: Page, approval = MOCK_APPROVALS[0]) {
  return page.route(`**/api/console/approvals/${approval.approval_id}`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ approval }),
    });
  });
}

function mockApprovalActionApi(page: Page, { status = 200, error = null as string | null } = {}) {
  return page.route(`**/api/console/approvals/${APPROVAL_ID}`, (route) => {
    if (route.request().method() !== "POST") {
      // Let GET requests through to the detail mock
      return route.fallback();
    }
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
      body: JSON.stringify({ ok: true }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests — US-3: Parcours Approvals (TI-249 / TI-208)
// ---------------------------------------------------------------------------

test.describe("Console Approvals — US-3/US-4", () => {
  // -----------------------------------------------------------------------
  // List view
  // -----------------------------------------------------------------------
  test.describe("List view", () => {
    test("renders approvals queue with PENDING as default", async ({ page }) => {
      await mockApprovalsApi(page);
      await page.goto("/console/approvals");

      await expect(page.getByTestId("approvals-page")).toBeVisible();
      const rows = page.locator("table tbody tr");
      await expect(rows).toHaveCount(3);
    });

    test("shows empty state when no approvals", async ({ page }) => {
      await mockApprovalsApi(page, { items: [] });
      await page.goto("/console/approvals");

      await expect(page.getByText("No approvals found")).toBeVisible();
    });

    test("shows error state on API failure", async ({ page }) => {
      await mockApprovalsApi(page, { status: 500, error: "Server error" });
      await page.goto("/console/approvals");

      await expect(page.getByText("Server error")).toBeVisible();
      await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
    });

    test("filters by action type listing_publish", async ({ page }) => {
      await mockApprovalsApi(page);

      await page.goto("/console/approvals");
      await expect(page.getByTestId("approvals-page")).toBeVisible();

      const filteredReq = waitForApiGet(page, "/api/console/approvals", { action_type: "listing_publish" });
      await page.getByTestId("approvals-toolbar").getByRole("button", { name: "listing_publish" }).click();
      await filteredReq;
    });

    test("filters by action type offer_over_budget", async ({ page }) => {
      await mockApprovalsApi(page);

      await page.goto("/console/approvals");
      await expect(page.getByTestId("approvals-page")).toBeVisible();

      const filteredReq = waitForApiGet(page, "/api/console/approvals", { action_type: "offer_over_budget" });
      await page.getByTestId("approvals-toolbar").getByRole("button", { name: "offer_over_budget" }).click();
      await filteredReq;
    });

    test("filters by state APPROVED", async ({ page }) => {
      await mockApprovalsApi(page);

      await page.goto("/console/approvals");
      await expect(page.getByTestId("approvals-page")).toBeVisible();

      const filteredReq = waitForApiGet(page, "/api/console/approvals", { state: "APPROVED" });
      await page.getByTestId("approvals-toolbar").getByRole("button", { name: "APPROVED" }).click();
      await filteredReq;
    });

    test("filters by agent ID", async ({ page }) => {
      await mockApprovalsApi(page);

      await page.goto("/console/approvals");
      await expect(page.getByTestId("approvals-page")).toBeVisible();

      const filteredReq = waitForApiGet(page, "/api/console/approvals", { agent_id: AGENT_ID });
      await page.getByTestId("approvals-agent-id").fill(AGENT_ID);
      await filteredReq;
    });
  });

  // -----------------------------------------------------------------------
  // Detail view — Approve flow
  // -----------------------------------------------------------------------
  test.describe("Detail — Approve flow", () => {
    test("displays approval metadata and context preview", async ({ page }) => {
      await mockApprovalDetailApi(page, MOCK_APPROVALS[0]);
      await page.goto(`/console/approvals/${APPROVAL_ID}`);

      await expect(page.getByTestId("approval-detail-page")).toBeVisible();
      await expect(page.getByText("listing_publish")).toBeVisible();
      await expect(page.getByText("Action Context")).toBeVisible();
    });

    test("Approve button opens confirmation modal", async ({ page }) => {
      await mockApprovalDetailApi(page, MOCK_APPROVALS[0]);
      await page.goto(`/console/approvals/${APPROVAL_ID}`);

      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      // Click Approve
      await page.getByRole("button", { name: /^approve$/i }).click();

      // Modal appears
      const dialog = page.getByRole("dialog", { name: /approve this action\\?/i });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: /cancel/i })).toBeVisible();
      await expect(dialog.getByRole("button", { name: /^approve$/i })).toBeVisible();
    });

    test("Confirm Approve sends POST request", async ({ page }) => {
      await mockApprovalDetailApi(page, MOCK_APPROVALS[0]);
      await page.route(`**/api/console/approvals/${APPROVAL_ID}`, (route) => {
        if (route.request().method() === "POST") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          });
          return;
        }
        route.fallback();
      });

      await page.goto(`/console/approvals/${APPROVAL_ID}`);
      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      // Click Approve → modal → Confirm
      await page.getByRole("button", { name: /^approve$/i }).click();
      await expect(page.getByText("Approve this action?")).toBeVisible();
      const dialog = page.getByRole("dialog", { name: /approve this action\\?/i });
      const approveReq = waitForApiPostJson(page, `/api/console/approvals/${APPROVAL_ID}`, { action: "approve" });
      await dialog.getByRole("button", { name: /^approve$/i }).click();

      await approveReq;
    });

    test("shows success toast after approve", async ({ page }) => {
      await mockApprovalDetailApi(page, MOCK_APPROVALS[0]);
      await mockApprovalActionApi(page);

      await page.goto(`/console/approvals/${APPROVAL_ID}`);
      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      await page.getByRole("button", { name: /^approve$/i }).click();
      const dialog = page.getByRole("dialog", { name: /approve this action\\?/i });
      await dialog.getByRole("button", { name: /^approve$/i }).click();

      await expect(page.getByText(/action completed successfully/i)).toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // Detail — Deny flow
  // -----------------------------------------------------------------------
  test.describe("Detail — Deny flow", () => {
    test("Deny button opens confirmation modal", async ({ page }) => {
      await mockApprovalDetailApi(page, MOCK_APPROVALS[0]);
      await page.goto(`/console/approvals/${APPROVAL_ID}`);

      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      await page.getByRole("button", { name: /^deny$/i }).click();

      await expect(page.getByText("Deny this action?")).toBeVisible();
      await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    });

    test("Confirm Deny sends POST request", async ({ page }) => {
      await mockApprovalDetailApi(page, MOCK_APPROVALS[0]);
      await page.route(`**/api/console/approvals/${APPROVAL_ID}`, (route) => {
        if (route.request().method() === "POST") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true }),
          });
          return;
        }
        route.fallback();
      });

      await page.goto(`/console/approvals/${APPROVAL_ID}`);
      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      await page.getByRole("button", { name: /^deny$/i }).click();
      await expect(page.getByText("Deny this action?")).toBeVisible();
      const dialog = page.getByRole("dialog", { name: /deny this action\\?/i });
      const denyReq = waitForApiPostJson(page, `/api/console/approvals/${APPROVAL_ID}`, { action: "deny" });
      await dialog.getByRole("button", { name: /^deny$/i }).click();

      await denyReq;
    });
  });

  // -----------------------------------------------------------------------
  // Detail — Error handling
  // -----------------------------------------------------------------------
  test.describe("Detail — Error handling", () => {
    test("shows error toast on API failure", async ({ page }) => {
      await mockApprovalDetailApi(page, MOCK_APPROVALS[0]);
      await mockApprovalActionApi(page, { status: 500, error: "Internal server error" });

      await page.goto(`/console/approvals/${APPROVAL_ID}`);
      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      await page.getByRole("button", { name: /^approve$/i }).click();
      const dialog = page.getByRole("dialog", { name: /approve this action\\?/i });
      const approveReq = waitForApiPostJson(page, `/api/console/approvals/${APPROVAL_ID}`, { action: "approve" });
      await dialog.getByRole("button", { name: /^approve$/i }).click();

      await approveReq;
      // Error should be displayed
      await expect(page.getByText(/internal server error|failed/i)).toBeVisible();
    });

    test("Cancel button in modal closes without action", async ({ page }) => {
      await mockApprovalDetailApi(page, MOCK_APPROVALS[0]);
      await page.goto(`/console/approvals/${APPROVAL_ID}`);

      await page.getByRole("button", { name: /^approve$/i }).click();
      await expect(page.getByText("Approve this action?")).toBeVisible();

      await page.getByRole("button", { name: /cancel/i }).click();

      // Modal should be closed
      await expect(page.getByText("Approve this action?")).not.toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // Buttons hidden when not PENDING
  // -----------------------------------------------------------------------
  test.describe("Non-pending approvals", () => {
    test("does not show Approve/Deny buttons for APPROVED approvals", async ({ page }) => {
      const approved = MOCK_APPROVALS[2];
      await page.route(`**/api/console/approvals/${approved.approval_id}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ approval: approved }),
        });
      });

      await page.goto(`/console/approvals/${approved.approval_id}`);
      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      await expect(page.getByRole("button", { name: /^approve$/i })).not.toBeVisible();
      await expect(page.getByRole("button", { name: /^deny$/i })).not.toBeVisible();
    });
  });
});
