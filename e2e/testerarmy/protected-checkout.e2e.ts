import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

// Client contracts only. Real authorization, storage and payout transitions are
// covered by e2e/integration/protected-checkout.spec.ts.
const escrowId = "11111111-1111-4111-8111-111111111111";
const disputeId = "22222222-2222-4222-8222-222222222222";
const now = "2026-11-19T10:00:00.000Z";
const evidenceId = "33333333-3333-4333-8333-333333333333";
function fixture() {
  return {
    escrow: { escrow_id: escrowId, status: "DELIVERED", amount_gross_minor: 350, currency: "EUR", created_at: now },
    terms: {
      listing: { title: "Blue wool jacket", description: "Wool jacket, no stains or tears.", condition: "GOOD", category: "clothing", delivery_method: "SHIPPING", photos: [], price_amount: 400, currency: "EUR" },
      offer: { amount: 350, currency: "EUR" }, captured_at: now, sha256: "a".repeat(64)
    },
    inspection: { window_hours: 48, open: true, ends_at: new Date(Date.now() + 47 * 3600_000).toISOString() },
    shipment: { carrier: "colissimo", tracking_number: "PC12345678", status: "DELIVERED", events: [{ tracking_event_id: "event1", status: "DELIVERED", occurred_at: now, location: "Lyon" }] },
    viewer_roles: ["BUYER"],
    actions: { open_dispute: true, confirm_received: true },
    dispute: null as any
  };
}

beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl).origin;
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: escrowId } } }));
});

test("buyer opens a dispute, adds a statement and sees both parties' evidence", async ({ app, screen, browser }) => {
  const order = fixture();
  const writes: any[] = [];
  await browser.route(`**/api/v1/escrows/${escrowId}`, route => route.fulfill({ json: order }));
  await browser.route(`**/api/v1/escrows/${escrowId}/disputes`, route => {
    const body = JSON.parse(route.request.postData || "{}");
    writes.push(body);
    expect(route.request.headers["idempotency-key"]).toBeTruthy();
    order.escrow.status = "DISPUTE_OPEN";
    order.actions = { open_dispute: false, confirm_received: false, submit_statement: true, submit_evidence: true } as any;
    order.dispute = { dispute_id: disputeId, status: "OPEN", opened_by: "BUYER", reason_code: body.reason_code, opened_notes: body.notes, opened_at: now, statements: [] };
    return route.fulfill({ status: 201, json: { dispute_id: disputeId } });
  });
  await browser.route(`**/api/v1/disputes/${disputeId}/evidence`, route => route.fulfill({ json: { items: ["BUYER", "SELLER"].map(submitted_by => ({
    evidence_item_id: evidenceId, submitted_by, content_type: "image/png", bytes: 1000, created_at: now
  })) } }));
  await browser.route(`**/api/v1/disputes/${disputeId}/statement`, route => {
    const body = JSON.parse(route.request.postData || "{}");
    writes.push(body);
    order.dispute.statements = [{ submitted_by: "BUYER", body: body.statement, updated_at: now }];
    return route.fulfill({ json: {} });
  });
  await app.open(`/my/orders/${escrowId}`);
  await expect(screen.getByTestId("pc-terms-title")).toHaveText("Blue wool jacket");
  await expect(screen.getByTestId("pc-tracking-status")).toContainText(/Delivered by carrier/i);
  await screen.getByTestId("order-dispute-notes").fill("The parcel contained a brick, not the jacket.");
  await screen.getByTestId("order-dispute-submit").tap();
  await expect(screen.getByTestId("order-status")).toContainText(/payout paused/i);
  await expect(screen.getByTestId("order-confirm-submit")).toHaveCount(0);
  expect(writes[0]).toEqual({ reason_code: "not_as_described", notes: "The parcel contained a brick, not the jacket." });
  await screen.getByTestId("order-statement-input").fill("Photographed the contents on arrival.");
  await screen.getByTestId("order-statement-submit").tap();
  await expect(screen.getByTestId("pc-statement-buyer")).toContainText("Photographed the contents on arrival.");
  await expect(screen.getByTestId("order-evidence-buyer").getByRole("link", "Open file")).toBeVisible();
  await expect(screen.getByTestId("order-evidence-seller").getByRole("link", "Open file")).toBeVisible();
  await app.screenshot("buyer-dispute-paused");
});

test("seller registers tracking; an expired inspection hides dispute actions", async ({ app, screen, browser }) => {
  const order = fixture();
  order.escrow.status = "HOLD";
  order.viewer_roles = ["SELLER"];
  order.shipment = null as any;
  order.actions = { register_shipment: true } as any;
  order.inspection = { window_hours: 48, open: false, ends_at: null } as any;
  let registered: any;
  await browser.route(`**/api/v1/escrows/${escrowId}`, route => route.fulfill({ json: order }));
  await browser.route(`**/api/v1/escrows/${escrowId}/shipment`, route => {
    registered = JSON.parse(route.request.postData || "{}");
    order.shipment = { ...registered, status: "REGISTERED", events: [] };
    order.actions = {} as any;
    return route.fulfill({ json: { shipment: order.shipment } });
  });
  await app.open(`/my/orders/${escrowId}`);
  await screen.getByTestId("order-tracking-number").fill("PC12345678");
  await screen.getByTestId("order-tracking-submit").tap();
  await expect(screen.getByTestId("pc-tracking-status")).toContainText(/Registered/i);
  expect(registered).toEqual({ carrier: "colissimo", tracking_number: "PC12345678" });
  await expect(screen.getByTestId("order-tracking-form")).toHaveCount(0);
  order.escrow.status = "DELIVERED";
  order.inspection.ends_at = new Date(Date.now() - 60_000).toISOString();
  await browser.reload();
  await expect(screen.getByTestId("pc-inspection-state")).toContainText("Disputes can no longer be opened");
  await expect(screen.getByTestId("order-dispute-submit")).toHaveCount(0);
  await app.screenshot("seller-tracking-expired-window");
});

test("reviewer compares both sides then explicitly confirms a refund despite delivery", async ({ app, screen, browser }) => {
  const review: any = fixture();
  review.escrow.status = "DISPUTE_OPEN";
  review.dispute = {
    dispute_id: disputeId, status: "OPEN", opened_by: "BUYER", opened_at: now, reason_code: "not_as_described",
    opened_notes: "A brick was inside the parcel.",
    statements: [
      { submitted_by: "BUYER", body: "Photographed the brick.", updated_at: now },
      { submitted_by: "SELLER", body: "I packed a jacket.", updated_at: now }
    ]
  };
  review.evidence = { buyer: [{ evidence_item_id: evidenceId, content_type: "image/png", bytes: 1000, created_at: now }], seller: [{ evidence_item_id: evidenceId, content_type: "application/pdf", bytes: 2000, created_at: now }] };
  review.decision = { required: true };
  let decision: any = null;
  await browser.route(`**/api/console/disputes/${disputeId}/review`, route => route.fulfill({ json: review }));
  await browser.route(`**/api/console/disputes/${disputeId}/resolve`, route => {
    decision = JSON.parse(route.request.postData || "{}");
    review.decision.required = false;
    review.escrow.status = "REFUND_PENDING";
    review.dispute = { ...review.dispute, status: "RESOLVED", resolution: "REFUND", resolution_notes: decision.notes, resolved_at: now };
    return route.fulfill({ json: {} });
  });
  await app.open(`/console/disputes/${disputeId}`);
  await expect(screen.getByTestId("pc-tracking-status")).toContainText(/Delivered by carrier/i);
  await expect(screen.getByTestId("pc-statement-buyer")).toContainText("Photographed the brick.");
  await expect(screen.getByTestId("pc-statement-seller")).toContainText("I packed a jacket.");
  await expect(screen.getByTestId("review-evidence-buyer").getByRole("link", "Open file")).toBeVisible();
  await screen.getByTestId("review-notes").fill("Delivery does not establish the contents; refund justified.");
  await screen.getByTestId("review-decide-refund").tap();
  expect(decision).toBeNull();
  await screen.getByRole("dialog").getByRole("button", "Refund the buyer").tap();
  await expect(screen.getByTestId("review-escrow-status")).toHaveAttribute("data-status", "REFUND_PENDING");
  expect(decision).toEqual({ resolution: "REFUND", notes: "Delivery does not establish the contents; refund justified." });
  await expect(screen.getByTestId("review-decide-release")).toHaveCount(0);
  await app.screenshot("reviewer-refund-decided");
});
