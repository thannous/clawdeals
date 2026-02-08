import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const LISTING_WITH_URL = {
  listing_id: "sec-listing-1111",
  title: "Security Test Listing",
  description: "Buy at https://malicious-phishing.com/steal — great deal!",
  category: "electronics",
  condition: "NEW",
  price_amount: 10,
  currency: "EUR",
  status: "LIVE",
  seller_agent_id: "sec-agent-1111",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const THREAD_WITH_MESSAGES = {
  thread_id: "sec-thread-1111",
  listing_id: LISTING_WITH_URL.listing_id,
  buyer_agent_id: "sec-buyer-1111",
  seller_agent_id: "sec-agent-1111",
  status: "OPEN",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MESSAGES_WITH_URL_AND_REDACTION = [
  {
    message_id: "sec-msg-1111",
    type: "answer",
    body: "Check out https://phishing-link.com/scam for photos",
    sender_id: "sec-agent-1111",
    sender_type: "agent",
    redacted: false,
    payload: { type: "answer" },
    created_at: new Date().toISOString(),
  },
  {
    message_id: "sec-msg-2222",
    type: "warning",
    body: "External link detected — potential phishing attempt",
    sender_id: "system",
    sender_type: "system",
    redacted: false,
    payload: { type: "warning" },
    created_at: new Date().toISOString(),
  },
  {
    message_id: "sec-msg-3333",
    type: "answer",
    body: null,
    sender_id: "sec-agent-1111",
    sender_type: "agent",
    redacted: true,
    payload: { type: "answer" },
    created_at: new Date().toISOString(),
  },
];

const PENDING_APPROVAL = {
  approval_id: "sec-appr-1111",
  action_type: "listing_publish",
  state: "PENDING",
  created_by_agent_id: "sec-agent-1111",
  owner_id: "sec-owner-1111",
  created_at: new Date().toISOString(),
  resolved_at: null,
  resolved_by_human_id: null,
  action_payload_redacted: {
    listing_id: LISTING_WITH_URL.listing_id,
    title: LISTING_WITH_URL.title,
    description: LISTING_WITH_URL.description,
  },
};

// ---------------------------------------------------------------------------
// Tests — US-8: Security Checks (TI-254)
// ---------------------------------------------------------------------------

test.describe("Console Security — US-8", () => {
  // -----------------------------------------------------------------------
  // 1. No auto-linkify
  // -----------------------------------------------------------------------
  test.describe("No auto-linkify", () => {
    test("listing description does not render URLs as clickable links", async ({ page }) => {
      await page.route(`**/api/console/listings/${LISTING_WITH_URL.listing_id}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ listing: LISTING_WITH_URL }),
        });
      });

      await page.goto(`/console/listings/${LISTING_WITH_URL.listing_id}`);
      await expect(page.getByTestId("listing-detail-page")).toBeVisible();

      // URL text IS visible
      await expect(page.getByText("https://malicious-phishing.com/steal")).toBeVisible();

      // But no <a> tag with that href
      const clickableLink = page.locator('a[href*="malicious-phishing"]');
      await expect(clickableLink).toHaveCount(0);
    });

    test("thread messages do not render URLs as clickable links", async ({ page }) => {
      await page.route(`**/api/console/threads/${THREAD_WITH_MESSAGES.thread_id}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            thread: THREAD_WITH_MESSAGES,
            messages: MESSAGES_WITH_URL_AND_REDACTION,
            messages_next_cursor: null,
          }),
        });
      });
      await page.route(`**/api/console/threads/${THREAD_WITH_MESSAGES.thread_id}/messages*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MESSAGES_WITH_URL_AND_REDACTION, next_cursor: null }),
        });
      });

      await page.goto(`/console/threads/${THREAD_WITH_MESSAGES.thread_id}`);
      await expect(page.getByTestId("thread-detail-page")).toBeVisible();

      // URL text IS visible
      await expect(page.getByText("https://phishing-link.com/scam")).toBeVisible();

      // But no <a> tag with that href
      const clickableLink = page.locator('a[href*="phishing-link"]');
      await expect(clickableLink).toHaveCount(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. No PII
  // -----------------------------------------------------------------------
  test.describe("No PII exposure", () => {
    test("listing detail does not show email or phone", async ({ page }) => {
      await page.route(`**/api/console/listings/${LISTING_WITH_URL.listing_id}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ listing: LISTING_WITH_URL }),
        });
      });

      await page.goto(`/console/listings/${LISTING_WITH_URL.listing_id}`);
      await expect(page.getByTestId("listing-detail-page")).toBeVisible();

      // No email patterns
      const pageText = await page.textContent("body");
      expect(pageText).not.toMatch(/[\w.-]+@[\w.-]+\.\w+/);
      // No phone patterns (basic check)
      expect(pageText).not.toMatch(/\+\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Redaction
  // -----------------------------------------------------------------------
  test.describe("Redaction", () => {
    test("redacted messages show REDACTED badge", async ({ page }) => {
      await page.route(`**/api/console/threads/${THREAD_WITH_MESSAGES.thread_id}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            thread: THREAD_WITH_MESSAGES,
            messages: MESSAGES_WITH_URL_AND_REDACTION,
            messages_next_cursor: null,
          }),
        });
      });
      await page.route(`**/api/console/threads/${THREAD_WITH_MESSAGES.thread_id}/messages*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MESSAGES_WITH_URL_AND_REDACTION, next_cursor: null }),
        });
      });

      await page.goto(`/console/threads/${THREAD_WITH_MESSAGES.thread_id}`);
      await expect(page.getByTestId("thread-detail-page")).toBeVisible();

      // REDACTED badge is visible
      await expect(page.getByText("REDACTED")).toBeVisible();
    });

    test("warning messages are visually highlighted (yellow border)", async ({ page }) => {
      await page.route(`**/api/console/threads/${THREAD_WITH_MESSAGES.thread_id}`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            thread: THREAD_WITH_MESSAGES,
            messages: MESSAGES_WITH_URL_AND_REDACTION,
            messages_next_cursor: null,
          }),
        });
      });
      await page.route(`**/api/console/threads/${THREAD_WITH_MESSAGES.thread_id}/messages*`, (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: MESSAGES_WITH_URL_AND_REDACTION, next_cursor: null }),
        });
      });

      await page.goto(`/console/threads/${THREAD_WITH_MESSAGES.thread_id}`);

      // WARNING badge visible
      await expect(page.getByText("WARNING", { exact: true })).toBeVisible();

      // Yellow-bordered card exists
      const yellowCard = page.locator(".border-yellow-400\\/40");
      await expect(yellowCard.first()).toBeVisible();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Confirmation modals
  // -----------------------------------------------------------------------
  test.describe("Confirmation modals", () => {
    test("approve requires confirmation modal before action", async ({ page }) => {
      let apiCalled = false;

      await page.route(`**/api/console/approvals/${PENDING_APPROVAL.approval_id}`, (route) => {
        if (route.request().method() === "POST") {
          apiCalled = true;
          route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
          return;
        }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ approval: PENDING_APPROVAL }),
        });
      });

      await page.goto(`/console/approvals/${PENDING_APPROVAL.approval_id}`);
      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      // Clicking approve once opens modal, does NOT call API yet
      await page.getByRole("button", { name: /^approve$/i }).click();
      await expect(page.getByText("Approve this action?")).toBeVisible();

      // API not called yet
      expect(apiCalled).toBeFalsy();

      // Cancel closes modal
      await page.getByRole("button", { name: /cancel/i }).click();
      await expect(page.getByText("Approve this action?")).not.toBeVisible();

      // Still not called
      expect(apiCalled).toBeFalsy();
    });

    test("deny requires confirmation modal before action", async ({ page }) => {
      let apiCalled = false;

      await page.route(`**/api/console/approvals/${PENDING_APPROVAL.approval_id}`, (route) => {
        if (route.request().method() === "POST") {
          apiCalled = true;
          route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
          return;
        }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ approval: PENDING_APPROVAL }),
        });
      });

      await page.goto(`/console/approvals/${PENDING_APPROVAL.approval_id}`);
      await expect(page.getByTestId("approval-detail-page")).toBeVisible();

      // Click deny opens modal
      await page.getByRole("button", { name: /^deny$/i }).click();
      await expect(page.getByText("Deny this action?")).toBeVisible();

      // API not called yet
      expect(apiCalled).toBeFalsy();

      // Cancel
      await page.getByRole("button", { name: /cancel/i }).click();
      expect(apiCalled).toBeFalsy();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Audit time range enforcement
  // -----------------------------------------------------------------------
  test.describe("Audit time range enforcement", () => {
    test("from and to fields are pre-filled (required)", async ({ page }) => {
      await page.route("**/api/console/audit?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], next_cursor: null }),
        });
      });

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      const fromValue = await page.getByTestId("audit-from").inputValue();
      const toValue = await page.getByTestId("audit-to").inputValue();

      expect(fromValue).toBeTruthy();
      expect(toValue).toBeTruthy();
    });

    test("time range > 7 days shows validation error", async ({ page }) => {
      await page.route("**/api/console/audit?*", (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], next_cursor: null }),
        });
      });

      await page.goto("/console/audit");
      await expect(page.getByTestId("audit-page")).toBeVisible();

      // Set "from" to 10 days ago
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000);
      const fromInput = page.getByTestId("audit-from");
      await fromInput.fill(tenDaysAgo.toISOString().slice(0, 16));
      await fromInput.press("Tab");

      // Error should be visible
      await expect(page.getByText(/time range/i)).toBeVisible();
    });
  });
});
